package google

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"client-list-backend/internal/models"
)

type Client struct {
	APIKey      string
	GeoapifyKey string
	FoursquareKey string
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey:        apiKey,
		GeoapifyKey:   os.Getenv("GEOAPIFY_KEY"),
		FoursquareKey: os.Getenv("FOURSQUARE_KEY"),
	}
}

type bizDataResponse struct {
	Total      int             `json:"total"`
	Businesses []bizDataResult `json:"businesses"`
}

type bizDataResult struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lon"`
	Phone     string  `json:"phone"`
	Website   string  `json:"website"`
	Category  string  `json:"category"`
	Hours     string  `json:"opening_hours"`
}

type nominatimResult struct {
	PlaceID     int64           `json:"place_id"`
	DisplayName string          `json:"display_name"`
	Lat         string          `json:"lat"`
	Lon         string          `json:"lon"`
	Address     json.RawMessage `json:"address"`
	Category    string          `json:"category"`
	Type        string          `json:"type"`
}

type geoapifyResponse struct {
	Features []geoapifyFeature `json:"features"`
}

type geoapifyFeature struct {
	Properties geoapifyProps `json:"properties"`
}

type geoapifyProps struct {
	Name      string  `json:"name"`
	Address   string  `json:"formatted"`
	Phone     string  `json:"phone"`
	Website   string  `json:"website"`
	Category  string  `json:"categories"`
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lon"`
	Rating    float64 `json:"rating"`
}

type foursquareResponse struct {
	Results []foursquareResult `json:"results"`
}

type foursquareResult struct {
	FsqID    string            `json:"fsq_id"`
	Name     string            `json:"name"`
	Address  foursquareAddress `json:"location"`
	Category []foursquareCat   `json:"categories"`
	Phone    string            `json:"tel"`
	Website  string            `json:"website"`
	FSQLink  string            `json:"link"`
	Rating   float64           `json:"rating"`
}

type foursquareAddress struct {
	Formatted string `json:"formatted_address"`
	Country   string `json:"country"`
	City      string `json:"locality"`
	Region    string `json:"region"`
}

type foursquareCat struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type placesSearchResponse struct {
	Results []placeResult `json:"results"`
	Status  string        `json:"status"`
}

type placeResult struct {
	PlaceID     string   `json:"place_id"`
	Name        string   `json:"name"`
	Vicinity    string   `json:"vicinity"`
	FormattedAd string   `json:"formatted_address"`
	Geometry    geometry `json:"geometry"`
	Rating      float64  `json:"rating"`
	UserRatings int      `json:"user_ratings_total"`
	PhoneNumber *string  `json:"formatted_phone_number"`
	Website     *string  `json:"website"`
}

type geometry struct {
	Location location `json:"location"`
}

type location struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type placeDetailResponse struct {
	Result detailResult `json:"result"`
	Status string       `json:"status"`
}

type detailResult struct {
	PlaceID                  string        `json:"place_id"`
	Name                     string        `json:"name"`
	FormattedAddress         string        `json:"formatted_address"`
	FormattedPhoneNumber     *string       `json:"formatted_phone_number"`
	InternationalPhoneNumber *string       `json:"international_phone_number"`
	Website                  *string       `json:"website"`
	URL                      *string       `json:"url"`
	AddressComponents        []addressComp `json:"address_components"`
	Geometry                 geometry      `json:"geometry"`
	Rating                   float64       `json:"rating"`
	UserRatingsTotal         int           `json:"user_ratings_total"`
}

type addressComp struct {
	LongName  string   `json:"long_name"`
	ShortName string   `json:"short_name"`
	Types     []string `json:"types"`
}

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

// BizData - Free, no API key
func (c *Client) SearchPlacesBizData(query string, location string, limit int) ([]models.Business, error) {
	if limit <= 0 || limit > 500 {
		limit = 20
	}

	searchURL := fmt.Sprintf("https://bizdata-web.vercel.app/api/businesses?category=%s&limit=%d", url.QueryEscape(query), limit)
	if location != "" {
		searchURL += "&location=" + url.QueryEscape(location)
	}

	resp, err := httpClient.Get(searchURL)
	if err != nil {
		return nil, fmt.Errorf("failed to search places: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var bizResp bizDataResponse
	if err := json.Unmarshal(body, &bizResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var businesses []models.Business
	for i, r := range bizResp.Businesses {
		if i >= limit {
			break
		}

		businesses = append(businesses, models.Business{
			Name:      r.Name,
			Address:   r.Address,
			Phone:     r.Phone,
			Website:   r.Website,
			Category:  r.Category,
			Hours:     r.Hours,
			Latitude:  r.Latitude,
			Longitude: r.Longitude,
		})
	}

	return businesses, nil
}

// Nominatim/OSM - Free, no API key, basic data
func (c *Client) SearchPlacesNominatim(query string, location string, limit int) ([]models.Business, error) {
	if limit <= 0 || limit > 500 {
		limit = 20
	}

	queryStr := query
	if location != "" {
		queryStr = query + " in " + location
	}

	nominatimURL := fmt.Sprintf("https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=%d&addressdetails=1",
		url.QueryEscape(queryStr), limit)

	req, err := http.NewRequest("GET", nominatimURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "ClientListPro/1.0 (contact@clientlistpro.com)")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to search places: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var results []nominatimResult
	if err := json.Unmarshal(body, &results); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var businesses []models.Business
	for _, r := range results {
		if len(businesses) >= limit {
			break
		}

		lat := 0.0
		lng := 0.0
		fmt.Sscanf(r.Lat, "%f", &lat)
		fmt.Sscanf(r.Lon, "%f", &lng)

		parts := strings.Split(r.DisplayName, ", ")
		name := ""
		address := r.DisplayName
		if len(parts) > 0 {
			name = parts[0]
		}
		if len(parts) > 1 {
			address = strings.Join(parts[1:], ", ")
		}

		businesses = append(businesses, models.Business{
			Name:      name,
			Address:   address,
			Category:  r.Category,
			Latitude:  lat,
			Longitude: lng,
		})
	}

	return businesses, nil
}

// Geoapify - 3,000 free/day, requires API key
func (c *Client) SearchPlacesGeoapify(query string, location string, limit int) ([]models.Business, error) {
	if c.GeoapifyKey == "" {
		return nil, fmt.Errorf("GEOAPIFY_KEY not configured")
	}

	if limit <= 0 || limit > 500 {
		limit = 20
	}

	categoryMap := map[string]string{
		"restaurant": "catering.restaurant",
		"cafe":       "catering.cafe",
		"bar":        "catering.bar",
		"hotel":      "accommodation.hotel",
		"gym":        "sportfitness.gym",
		"pharmacy":   "healthcare.pharmacy",
		"bank":       "finance.bank",
		"supermarket": "commercial.supermarket",
		"hospital":   "healthcare.hospital",
		"school":     "education.school",
		"gas_station": "service.station",
		"parking":    "parking.parking",
	}

	geoCategory, ok := categoryMap[query]
	if !ok {
		geoCategory = "commercial"
	}

	searchURL := fmt.Sprintf("https://api.geoapify.com/v2/places?categories=%s&limit=%d&apiKey=%s",
		geoCategory, limit, c.GeoapifyKey)

	if location != "" {
		geoURL := fmt.Sprintf("https://api.geoapify.com/v1/geocode/search?text=%s&apiKey=%s",
			url.QueryEscape(location), c.GeoapifyKey)
		geoResp, err := httpClient.Get(geoURL)
		if err == nil {
			defer geoResp.Body.Close()
			geoBody, _ := io.ReadAll(geoResp.Body)
			var geoResult struct {
				Features []struct {
					Properties struct {
						Lat float64 `json:"lat"`
						Lon float64 `json:"lon"`
					} `json:"properties"`
				} `json:"features"`
			}
			if json.Unmarshal(geoBody, &geoResult) == nil && len(geoResult.Features) > 0 {
				lat := geoResult.Features[0].Properties.Lat
				lon := geoResult.Features[0].Properties.Lon
				searchURL = fmt.Sprintf("https://api.geoapify.com/v2/places?categories=%s&filter=circle:%.6f,%.6f,5000&limit=%d&apiKey=%s",
					geoCategory, lon, lat, limit, c.GeoapifyKey)
			}
		}
	}

	resp, err := httpClient.Get(searchURL)
	if err != nil {
		return nil, fmt.Errorf("failed to search places: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var geoResp geoapifyResponse
	if err := json.Unmarshal(body, &geoResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var businesses []models.Business
	for _, f := range geoResp.Features {
		if len(businesses) >= limit {
			break
		}

		businesses = append(businesses, models.Business{
			Name:      f.Properties.Name,
			Address:   f.Properties.Address,
			Phone:     f.Properties.Phone,
			Website:   f.Properties.Website,
			Category:  f.Properties.Category,
			Latitude:  f.Properties.Latitude,
			Longitude: f.Properties.Longitude,
			Rating:    f.Properties.Rating,
		})
	}

	return businesses, nil
}

// Foursquare - Limited free, requires API key
func (c *Client) SearchPlacesFoursquare(query string, location string, limit int) ([]models.Business, error) {
	if c.FoursquareKey == "" {
		return nil, fmt.Errorf("FOURSQUARE_KEY not configured")
	}

	if limit <= 0 || limit > 50 {
		limit = 20
	}

	searchURL := fmt.Sprintf("https://api.foursquare.com/v3/places/search?query=%s&limit=%d",
		url.QueryEscape(query), limit)

	if location != "" {
		geoURL := fmt.Sprintf("https://api.geoapify.com/v1/geocode/search?text=%s&apiKey=%s",
			url.QueryEscape(location), c.GeoapifyKey)
		geoResp, err := httpClient.Get(geoURL)
		if err == nil {
			defer geoResp.Body.Close()
			geoBody, _ := io.ReadAll(geoResp.Body)
			var geoResult struct {
				Features []struct {
					Properties struct {
						Lat float64 `json:"lat"`
						Lon float64 `json:"lon"`
					} `json:"properties"`
				} `json:"features"`
			}
			if json.Unmarshal(geoBody, &geoResult) == nil && len(geoResult.Features) > 0 {
				lat := geoResult.Features[0].Properties.Lat
				lon := geoResult.Features[0].Properties.Lon
				searchURL = fmt.Sprintf("https://api.foursquare.com/v3/places/search?query=%s&ll=%.6f,%.6f&limit=%d",
					url.QueryEscape(query), lat, lon, limit)
			}
		}
	}

	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Authorization", c.FoursquareKey)
	req.Header.Set("Accept", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to search places: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var fsResp foursquareResponse
	if err := json.Unmarshal(body, &fsResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var businesses []models.Business
	for _, r := range fsResp.Results {
		if len(businesses) >= limit {
			break
		}

		category := ""
		if len(r.Category) > 0 {
			category = r.Category[0].Name
		}

		businesses = append(businesses, models.Business{
			Name:      r.Name,
			Address:   r.Address.Formatted,
			Phone:     r.Phone,
			Website:   r.Website,
			Category:  category,
			Rating:    r.Rating,
		})
	}

	return businesses, nil
}

// Google Places - Requires API key
func (c *Client) SearchPlacesGoogle(query string, location string, limit int) ([]models.Business, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("GOOGLE_API_KEY not configured")
	}

	if limit <= 0 || limit > 60 {
		limit = 20
	}

	searchURL := fmt.Sprintf("https://maps.googleapis.com/maps/api/place/textsearch/json?query=%s&key=%s", url.QueryEscape(query), c.APIKey)
	if location != "" {
		searchURL += "&location=" + url.QueryEscape(location)
	}

	resp, err := httpClient.Get(searchURL)
	if err != nil {
		return nil, fmt.Errorf("failed to search places: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var searchResp placesSearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if searchResp.Status != "OK" && searchResp.Status != "ZERO_RESULTS" {
		return nil, fmt.Errorf("places API returned status: %s", searchResp.Status)
	}

	var businesses []models.Business
	for i, r := range searchResp.Results {
		if i >= limit {
			break
		}

		biz := models.Business{
			Name:        r.Name,
			Address:     r.Vicinity,
			Phone:       getStringValue(r.PhoneNumber),
			Website:     getStringValue(r.Website),
			Latitude:    r.Geometry.Location.Lat,
			Longitude:   r.Geometry.Location.Lng,
			Rating:      r.Rating,
			TotalRating: r.UserRatings,
			PlaceID:     r.PlaceID,
		}
		businesses = append(businesses, biz)
	}

	return businesses, nil
}

func (c *Client) GetPlaceDetails(placeID string) (*models.Business, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("GOOGLE_API_KEY not configured")
	}

	fields := "name,formatted_address,formatted_phone_number,international_phone_number,website,url,address_components,geometry,rating,user_ratings_total"
	detailURL := fmt.Sprintf("https://maps.googleapis.com/maps/api/place/details/json?place_id=%s&fields=%s&key=%s", placeID, fields, c.APIKey)

	resp, err := httpClient.Get(detailURL)
	if err != nil {
		return nil, fmt.Errorf("failed to get place details: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var detailResp placeDetailResponse
	if err := json.Unmarshal(body, &detailResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if detailResp.Status != "OK" {
		return nil, fmt.Errorf("place details API returned status: %s", detailResp.Status)
	}

	r := detailResp.Result
	country := extractCountry(r.AddressComponents)

	biz := &models.Business{
		Name:        r.Name,
		Address:     r.FormattedAddress,
		Phone:       getStringValue(r.FormattedPhoneNumber),
		Website:     getStringValue(r.Website),
		Country:     country,
		Latitude:    r.Geometry.Location.Lat,
		Longitude:   r.Geometry.Location.Lng,
		Rating:      r.Rating,
		TotalRating: r.UserRatingsTotal,
		PlaceID:     r.PlaceID,
	}

	if biz.Website != "" {
		email, facebook := extractContactFromWebsite(biz.Website)
		biz.Email = email
		biz.Facebook = facebook
	}

	return biz, nil
}

func (c *Client) EnrichBusinesses(businesses []models.Business) []models.Business {
	for i := range businesses {
		if businesses[i].PlaceID == "" || c.APIKey == "" {
			continue
		}
		detail, err := c.GetPlaceDetails(businesses[i].PlaceID)
		if err != nil {
			continue
		}
		businesses[i].Phone = detail.Phone
		businesses[i].Website = detail.Website
		businesses[i].Email = detail.Email
		businesses[i].Facebook = detail.Facebook
		businesses[i].Country = detail.Country
	}
	return businesses
}

func getStringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func extractCountry(components []addressComp) string {
	for _, comp := range components {
		for _, t := range comp.Types {
			if t == "country" {
				return comp.LongName
			}
		}
	}
	return ""
}

func extractContactFromWebsite(websiteURL string) (email string, facebook string) {
	resp, err := httpClient.Get(websiteURL)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", ""
	}

	content := string(body)

	emailPatterns := []string{"mailto:", "email:", "contact@"}
	for _, pattern := range emailPatterns {
		idx := strings.Index(strings.ToLower(content), pattern)
		if idx != -1 {
			start := idx + len(pattern)
			end := start
			for end < len(content) && content[end] != '"' && content[end] != '\'' && content[end] != ' ' && content[end] != '<' && content[end] != '>' {
				end++
			}
			if start < end {
				email = content[start:end]
				break
			}
		}
	}

	fbPatterns := []string{"facebook.com/", "fb.com/"}
	for _, pattern := range fbPatterns {
		idx := strings.Index(strings.ToLower(content), pattern)
		if idx != -1 {
			start := idx
			end := start
			for end < len(content) && content[end] != '"' && content[end] != '\'' && content[end] != ' ' && content[end] != '<' && content[end] != '>' && content[end] != '&' {
				end++
			}
			if start < end {
				fb := content[start:end]
				if !strings.HasPrefix(fb, "http") {
					fb = "https://" + fb
				}
				facebook = fb
				break
			}
		}
	}

	return email, facebook
}
