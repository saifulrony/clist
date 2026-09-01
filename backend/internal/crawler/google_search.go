package crawler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"

	"client-list-backend/internal/models"
)

type overpassResponse struct {
	Elements []overpassElement `json:"elements"`
}

type overpassElement struct {
	Type   string            `json:"type"`
	ID     int               `json:"id"`
	Tags   map[string]string `json:"tags"`
	Lat    float64           `json:"lat"`
	Lon    float64           `json:"lon"`
	Center *struct {
		Lat float64 `json:"lat"`
		Lon float64 `json:"lon"`
	} `json:"center,omitempty"`
}

var categoryTagMap = map[string]string{
	"restaurant":      "amenity=restaurant",
	"cafe":            "amenity=cafe",
	"hotel":           "tourism=hotel",
	"dentist":         "amenity=dentist",
	"doctor":          "amenity=doctor",
	"pharmacy":        "amenity=pharmacy",
	"bank":            "amenity=bank",
	"supermarket":     "shop=supermarket",
	"hairdresser":     "shop=hairdresser",
	"lawyer":          "office=lawyer",
	"car_repair":      "shop=car_repair",
	"gym":             "leisure=fitness_centre",
	"bakery":          "shop=bakery",
	"electronics":     "shop=electronics",
	"hostel":          "tourism=hostel",
	"real_estate":     "office=estate_agent",
	"computer_repair": "shop=computer_repair",
}

var categoryKeywords = map[string][]string{
	"computer_repair": {"computer repair", "IT support", "tech support"},
}

var cityBBox = map[string][4]float64{
	"new york":       {40.4774, -74.2591, 40.9176, -73.7004},
	"los angeles":    {33.7037, -118.6682, 34.3373, -118.1553},
	"chicago":        {41.6444, -87.9073, 42.0230, -87.5240},
	"houston":        {29.5259, -95.8246, 30.1544, -95.0300},
	"phoenix":        {33.29, -112.32, 33.82, -111.79},
	"london":         {51.2868, -0.5103, 51.6919, 0.3340},
	"paris":          {48.8156, 2.2241, 49.0000, 2.5580},
	"berlin":         {52.3388, 13.0887, 52.6755, 13.7611},
	"tokyo":          {35.5000, 139.6000, 35.9000, 139.9000},
	"dubai":          {24.9000, 55.0000, 25.4000, 55.4000},
	"mumbai":         {18.8800, 72.7800, 19.2800, 73.0200},
	"toronto":        {43.5800, -79.6400, 43.8600, -79.1200},
	"singapore":      {1.1500, 103.6000, 1.4700, 104.0000},
	"bangkok":        {13.6800, 100.3500, 13.9500, 100.9000},
	"istanbul":       {40.8200, 28.7000, 41.3000, 29.4000},
	"delhi":          {28.4000, 76.8000, 28.8800, 77.5000},
	"mexico city":    {19.2000, -99.4000, 19.7000, -98.9000},
	"cairo":          {29.8500, 31.0500, 30.3500, 31.6500},
	"rome":           {41.6800, 12.2300, 42.0200, 12.8500},
	"madrid":         {40.2100, -3.9000, 40.6500, -3.4000},
	"barcelona":      {41.2500, 1.9000, 41.5500, 2.3500},
	"amsterdam":      {52.2600, 4.6600, 52.5200, 5.1700},
	"moscow":         {55.5500, 37.3500, 55.9500, 37.8500},
	"seoul":          {37.4300, 126.7000, 37.7000, 127.2500},
	"sydney":         {-34.1000, 150.5000, -33.6000, 151.3000},
	"melbourne":      {-38.1500, 144.5000, -37.7000, 145.2000},
	"cape town":      {-34.2000, 18.3000, -33.8000, 18.7000},
	"buenos aires":   {-34.9500, -58.7500, -34.3500, -58.1500},
	"rio de janeiro": {-23.1000, -43.8000, -22.7000, -43.0000},
	"stockholm":      {59.1000, 17.8000, 59.5500, 18.3500},
	"lisbon":         {38.6800, -9.3000, 38.8800, -9.0000},
	"warsaw":         {52.0800, 20.8000, 52.3800, 21.2000},
	"vienna":         {48.1000, 16.1500, 48.4000, 16.6500},
	"prague":         {49.9400, 14.2200, 50.2000, 14.7000},
	"zurich":         {47.2600, 8.3800, 47.5000, 8.7000},
	"dublin":         {53.1800, -6.4500, 53.4200, -6.0500},
	"kuala lumpur":   {3.0500, 101.5500, 3.3500, 101.8500},
	"johannesburg":   {-26.4000, 27.7000, -26.0000, 28.2000},
	"sao paulo":      {-23.8500, -46.9000, -23.3000, -46.3000},
	"nairobi":        {-1.4000, 36.6000, -1.1500, 37.0000},
	"lima":           {-12.4000, -77.2000, -11.8000, -76.8000},
	"hong kong":      {22.1500, 113.8500, 22.5500, 114.4000},
	"beijing":        {39.7000, 116.1000, 40.1000, 116.7000},
	"shanghai":       {31.0000, 121.2000, 31.5000, 121.9000},
	"manila":         {14.5000, 120.8500, 14.8000, 121.1500},
	"jakarta":        {-6.4000, 106.6000, -6.0000, 107.0000},
	"taipei":         {24.9500, 121.4000, 25.2500, 121.7500},
}

func (c *Crawler) OverpassSearch(ctx context.Context, query, city, country string, maxResults int) []models.Business {
	bbox := getBBox(city, country)
	if bbox == nil {
		log.Printf("[Overpass] No bounding box for city=%s country=%s", city, country)
		return nil
	}

	// Try tag-based search first
	tag := categoryTagMap[strings.ToLower(query)]
	if tag == "" {
		// No OSM tag mapping — OpenStreetMap doesn't track IT/service businesses well.
		// Return nil so the caller can fall back to other sources.
		log.Printf("[Overpass] No OSM tag for category '%s', skipping Overpass (use BizData or Nominatim instead)", query)
		return nil
	}

	parts := strings.SplitN(tag, "=", 2)
	if len(parts) == 2 {
		tagKey, tagValue := parts[0], parts[1]
		overpassQuery := fmt.Sprintf(`[out:json][timeout:60];
(
  node["%s"="%s"](%f,%f,%f,%f);
  way["%s"="%s"](%f,%f,%f,%f);
);
out center body;`, tagKey, tagValue, bbox[0], bbox[1], bbox[2], bbox[3], tagKey, tagValue, bbox[0], bbox[1], bbox[2], bbox[3])

		log.Printf("[Overpass] Tag search: %s=%s in %s", tagKey, tagValue, city)
		businesses := c.overpassQuery(ctx, overpassQuery)
		if len(businesses) > 0 {
			return businesses
		}
		log.Printf("[Overpass] Tag search returned 0 results")
	}

	// Fallback: keyword search on name tag
	keywords := categoryKeywords[strings.ToLower(query)]
	if len(keywords) == 0 {
		return nil
	}

	var allBusinesses []models.Business
	seen := make(map[string]bool)

	for _, kw := range keywords {
		overpassQuery := fmt.Sprintf(`[out:json][timeout:60];
(
  node["name"~"%s",i](%f,%f,%f,%f);
  way["name"~"%s",i](%f,%f,%f,%f);
);
out center body;`, kw, bbox[0], bbox[1], bbox[2], bbox[3], kw, bbox[0], bbox[1], bbox[2], bbox[3])

		log.Printf("[Overpass] Keyword search: \"%s\" in %s", kw, city)
		businesses := c.overpassQuery(ctx, overpassQuery)

		for _, biz := range businesses {
			key := strings.ToLower(biz.Name) + "|" + biz.Address
			if !seen[key] {
				seen[key] = true
				allBusinesses = append(allBusinesses, biz)
			}
		}

		if len(allBusinesses) >= maxResults {
			break
		}
	}

	log.Printf("[Overpass] Returning %d unique businesses", len(allBusinesses))
	return allBusinesses
}

func (c *Crawler) overpassQuery(ctx context.Context, overpassQuery string) []models.Business {
	overpassURL := "https://overpass-api.de/api/interpreter"
	formData := url.Values{}
	formData.Set("data", overpassQuery)

	req, err := http.NewRequestWithContext(ctx, "POST", overpassURL, strings.NewReader(formData.Encode()))
	if err != nil {
		log.Printf("[Overpass] Request error: %v", err)
		return nil
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "ClientListGenerator/1.0")

	resp, err := c.http.Do(req)
	if err != nil {
		log.Printf("[Overpass] HTTP error: %v", err)
		return nil
	}
	defer resp.Body.Close()

	var overpassResp overpassResponse
	if err := json.NewDecoder(resp.Body).Decode(&overpassResp); err != nil {
		log.Printf("[Overpass] Decode error: %v", err)
		return nil
	}

	log.Printf("[Overpass] Found %d raw elements", len(overpassResp.Elements))

	var businesses []models.Business
	for _, elem := range overpassResp.Elements {
		biz := convertOverpassElement(elem)
		if biz != nil {
			businesses = append(businesses, *biz)
		}
	}

	return businesses
}

func getBBox(city, country string) *[4]float64 {
	if city != "" {
		if bbox, ok := cityBBox[strings.ToLower(city)]; ok {
			return &bbox
		}
	}

	// Default bounding boxes for countries
	countryBBox := map[string][4]float64{
		"united states": {25.0, -125.0, 49.0, -66.0},
		"united kingdom": {49.9, -8.2, 58.7, 1.8},
		"germany":       {47.3, 6.0, 55.1, 15.0},
		"france":        {42.3, -5.0, 51.1, 9.6},
		"japan":         {30.0, 129.0, 46.0, 146.0},
		"india":         {6.5, 68.0, 37.5, 97.5},
		"australia":     {-44.0, 112.0, -10.0, 154.0},
		"canada":        {41.7, -141.0, 83.1, -52.0},
		"brazil":        {-34.0, -74.0, 5.0, -34.0},
		"china":         {18.0, 73.0, 54.0, 135.0},
		"russia":        {41.0, 27.0, 82.0, 180.0},
		"mexico":        {14.5, -118.4, 32.7, -86.7},
	}

	if country != "" {
		if bbox, ok := countryBBox[strings.ToLower(country)]; ok {
			return &bbox
		}
	}

	return nil
}

func convertOverpassElement(elem overpassElement) *models.Business {
	tags := elem.Tags

	name := tags["name"]
	if name == "" {
		name = tags["name:en"]
	}
	if name == "" {
		return nil
	}

	getTag := func(keys ...string) string {
		for _, k := range keys {
			if v, ok := tags[k]; ok && v != "" {
				return v
			}
		}
		return ""
	}

	biz := models.Business{
		Name:     name,
		Phone:    getTag("phone", "contact:phone", "contact:mobile"),
		Website:  getTag("website", "contact:website"),
		Email:    getTag("email", "contact:email"),
		Facebook: getTag("contact:facebook"),
		Category: getTag("amenity", "shop", "tourism", "healthcare"),
		Latitude:  elem.Lat,
		Longitude: elem.Lon,
	}

	if center := elem.Center; center != nil {
		if biz.Latitude == 0 {
			biz.Latitude = center.Lat
		}
		if biz.Longitude == 0 {
			biz.Longitude = center.Lon
		}
	}

	addrParts := []string{}
	for _, k := range []string{"addr:housenumber", "addr:street", "addr:city", "addr:postcode"} {
		if v := tags[k]; v != "" {
			addrParts = append(addrParts, v)
		}
	}
	biz.Address = strings.Join(addrParts, ", ")
	biz.Hours = tags["opening_hours"]

	return &biz
}
