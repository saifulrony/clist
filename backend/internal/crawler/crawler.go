package crawler

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"client-list-backend/internal/models"
)

type Progress struct {
	TotalFound    int
	TotalEnriched int
	Status        string
	Error         string
}

type Crawler struct {
	http     *http.Client
	scraper  ScraperInterface
	google   GoogleInterface
	progress map[string]*Progress
}

type ScraperInterface interface {
	EnrichBusinesses(businesses []models.Business) []models.Business
}

type GoogleInterface interface {
	SearchPlacesBizData(query, location string, limit int) ([]models.Business, error)
	SearchPlacesNominatim(query, location string, limit int) ([]models.Business, error)
	SearchPlacesGoogle(query, location string, limit int) ([]models.Business, error)
	SearchPlacesGeoapify(query, location string, limit int) ([]models.Business, error)
	SearchPlacesFoursquare(query, location string, limit int) ([]models.Business, error)
	EnrichBusinesses(businesses []models.Business) []models.Business
}

func New(scraper ScraperInterface, google GoogleInterface) *Crawler {
	return &Crawler{
		http: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
		scraper:  scraper,
		google:   google,
		progress: make(map[string]*Progress),
	}
}

func (c *Crawler) GetProgress(jobID string) *Progress {
	if p, ok := c.progress[jobID]; ok {
		return p
	}
	return &Progress{Status: "not_found"}
}

func (c *Crawler) Crawl(ctx context.Context, jobID, query, city, country, source string, limit int, scrape bool, minRating float64, sortBy string, removeDuplicates bool) ([]models.Business, error) {
	p := &Progress{Status: "running"}
	c.progress[jobID] = p

	location := city
	if country != "" {
		location = city + ", " + country
	}

	var businesses []models.Business
	var err error

	switch source {
	case "yellowpages":
		businesses, err = c.crawlYellowPages(ctx, query, city, country, p)
	case "yelp":
		businesses, err = c.crawlYelp(ctx, query, city, country, p)
	case "google_maps":
		businesses, err = c.crawlGoogleMaps(ctx, query, city, country, p)
	case "google_search":
		businesses, err = c.crawlGoogleSearch(ctx, query, city, country, p)
	case "bizdata":
		businesses, err = c.crawlBizData(ctx, query, location, p)
	case "nominatim":
		businesses, err = c.crawlNominatim(ctx, query, location, p)
	case "geoapify":
		businesses, err = c.crawlGeoapify(ctx, query, location, p)
	case "foursquare":
		businesses, err = c.crawlFoursquare(ctx, query, location, p)
	case "google":
		businesses, err = c.crawlGoogle(ctx, query, location, p)
	default:
		err = fmt.Errorf("unknown source: %s", source)
	}

	if err != nil {
		p.Status = "error"
		p.Error = err.Error()
		log.Printf("Crawl error for job %s: %v", jobID, err)
		return nil, err
	}

	// Apply filters
	if minRating > 0 {
		var filtered []models.Business
		for _, b := range businesses {
			if b.Rating >= minRating {
				filtered = append(filtered, b)
			}
		}
		businesses = filtered
	}

	if removeDuplicates {
		seen := make(map[string]bool)
		var unique []models.Business
		for _, b := range businesses {
			key := strings.ToLower(b.Name) + "|" + strings.ToLower(b.Address)
			if !seen[key] {
				seen[key] = true
				unique = append(unique, b)
			}
		}
		businesses = unique
	}

	if sortBy == "name" {
		sort.Slice(businesses, func(i, j int) bool {
			return businesses[i].Name < businesses[j].Name
		})
	} else if sortBy == "rating" {
		sort.Slice(businesses, func(i, j int) bool {
			return businesses[i].Rating > businesses[j].Rating
		})
	}

	if limit > 0 && len(businesses) > limit {
		businesses = businesses[:limit]
	}

	// Enrich with website scraping
	if len(businesses) > 0 && scrape {
		log.Printf("Enriching %d businesses from %s...", len(businesses), source)
		businesses = c.scraper.EnrichBusinesses(businesses)
		p.TotalEnriched = len(businesses)
	}

	p.Status = "done"
	log.Printf("Crawl job %s done: %d found, %d enriched", jobID, p.TotalFound, p.TotalEnriched)
	return businesses, nil
}

func (c *Crawler) crawlYellowPages(ctx context.Context, query, city, country string, p *Progress) ([]models.Business, error) {
	return nil, fmt.Errorf("Yellow Pages blocks server requests (Cloudflare). Use the Chrome extension instead for Yellow Pages scraping.")
}

func (c *Crawler) crawlYelp(ctx context.Context, query, city, country string, p *Progress) ([]models.Business, error) {
	return nil, fmt.Errorf("Yelp blocks server requests (Cloudflare). Use the Chrome extension instead for Yelp scraping.")
}

func (c *Crawler) crawlBizData(ctx context.Context, query, location string, p *Progress) ([]models.Business, error) {
	log.Printf("Crawling BizData API: query=%s location=%s", query, location)
	businesses, err := c.google.SearchPlacesBizData(query, location, 100)
	if err != nil {
		return nil, err
	}
	p.TotalFound += len(businesses)
	return businesses, nil
}

func (c *Crawler) crawlNominatim(ctx context.Context, query, location string, p *Progress) ([]models.Business, error) {
	log.Printf("Crawling Nominatim API: query=%s location=%s", query, location)
	businesses, err := c.google.SearchPlacesNominatim(query, location, 100)
	if err != nil {
		return nil, err
	}
	p.TotalFound += len(businesses)
	return businesses, nil
}

func (c *Crawler) crawlGoogleSearch(ctx context.Context, query, city, country string, p *Progress) ([]models.Business, error) {
	location := city
	if country != "" {
		location = city + ", " + country
	}

	log.Printf("Crawling Overpass API (OpenStreetMap): query=%s city=%s country=%s", query, city, country)
	businesses := c.OverpassSearch(ctx, query, city, country, 100)

	if len(businesses) == 0 {
		log.Printf("Overpass returned 0 results for '%s', falling back to Nominatim", query)
		var err error
		businesses, err = c.google.SearchPlacesNominatim(query, location, 100)
		if err != nil {
			log.Printf("Nominatim fallback also failed: %v", err)
		}
	}

	p.TotalFound += len(businesses)
	return businesses, nil
}

func (c *Crawler) crawlGoogleMaps(ctx context.Context, query, city, country string, p *Progress) ([]models.Business, error) {
	location := city
	if country != "" {
		location = city + ", " + country
	}
	log.Printf("Crawling Google Places API: query=%s location=%s", query, location)
	businesses, err := c.google.SearchPlacesGoogle(query, location, 100)
	if err != nil {
		return nil, err
	}
	p.TotalFound += len(businesses)
	return businesses, nil
}

func (c *Crawler) crawlGeoapify(ctx context.Context, query, location string, p *Progress) ([]models.Business, error) {
	log.Printf("Crawling Geoapify: query=%s location=%s", query, location)
	businesses, err := c.google.SearchPlacesGeoapify(query, location, 100)
	if err != nil {
		return nil, err
	}
	p.TotalFound += len(businesses)
	return businesses, nil
}

func (c *Crawler) crawlFoursquare(ctx context.Context, query, location string, p *Progress) ([]models.Business, error) {
	log.Printf("Crawling Foursquare: query=%s location=%s", query, location)
	businesses, err := c.google.SearchPlacesFoursquare(query, location, 100)
	if err != nil {
		return nil, err
	}
	p.TotalFound += len(businesses)
	return businesses, nil
}

func (c *Crawler) crawlGoogle(ctx context.Context, query, location string, p *Progress) ([]models.Business, error) {
	log.Printf("Crawling Google Places: query=%s location=%s", query, location)
	businesses, err := c.google.SearchPlacesGoogle(query, location, 100)
	if err != nil {
		return nil, err
	}
	businesses = c.google.EnrichBusinesses(businesses)
	p.TotalFound += len(businesses)
	p.TotalEnriched = len(businesses)
	return businesses, nil
}

func (c *Crawler) fetchPage(ctx context.Context, url string) string {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Cache-Control", "max-age=0")

	resp, err := c.http.Do(req)
	if err != nil {
		log.Printf("fetchPage error: %v", err)
		return ""
	}
	defer resp.Body.Close()

	log.Printf("fetchPage %s -> status %d", url, resp.StatusCode)

	if resp.StatusCode != 200 && resp.StatusCode != 202 {
		return ""
	}

	var reader io.Reader = resp.Body
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gr, err := gzip.NewReader(resp.Body)
		if err == nil {
			reader = gr
			defer gr.Close()
		}
	}

	body, err := io.ReadAll(io.LimitReader(reader, 2*1024*1024))
	if err != nil {
		return ""
	}

	return string(body)
}

// Yellow Pages HTML parser
func parseYellowPagesHTML(html string) []models.Business {
	var businesses []models.Business

	// Find listing cards
	cardRegex := regexp.MustCompile(`(?s)<div class="result\s*.*?".*?</div>\s*</div>\s*</div>`)
	cards := cardRegex.FindAllString(html, -1)

	for _, card := range cards {
		biz := models.Business{}

		// Name
		nameRegex := regexp.MustCompile(`(?s)<a class="business-name"[^>]*>(.*?)</a>`)
		if m := nameRegex.FindStringSubmatch(card); len(m) > 1 {
			biz.Name = cleanHTML(m[1])
		}
		if biz.Name == "" {
			continue
		}

		// Phone
		phoneRegex := regexp.MustCompile(`(?s)<div class="phones[^"]*"[^>]*>(.*?)</div>`)
		if m := phoneRegex.FindStringSubmatch(card); len(m) > 1 {
			biz.Phone = cleanHTML(m[1])
		}

		// Address
		streetRegex := regexp.MustCompile(`(?s)<div class="street-address"[^>]*>(.*?)</div>`)
		if m := streetRegex.FindStringSubmatch(card); len(m) > 1 {
			biz.Address = cleanHTML(m[1])
		}
		localityRegex := regexp.MustCompile(`(?s)<div class="locality"[^>]*>(.*?)</div>`)
		if m := localityRegex.FindStringSubmatch(card); len(m) > 1 {
			if biz.Address != "" {
				biz.Address += ", " + cleanHTML(m[1])
			} else {
				biz.Address = cleanHTML(m[1])
			}
		}

		// Website
		websiteRegex := regexp.MustCompile(`(?s)<a class="track-visit-website"[^>]*href="([^"]*)"`)
		if m := websiteRegex.FindStringSubmatch(card); len(m) > 1 {
			biz.Website = m[1]
		}

		// Category
		categoryRegex := regexp.MustCompile(`(?s)<div class="categories"[^>]*>(.*?)</div>`)
		if m := categoryRegex.FindStringSubmatch(card); len(m) > 1 {
			biz.Category = cleanHTML(m[1])
		}

		// Rating
		ratingRegex := regexp.MustCompile(`aria-label="(\d+\.?\d*) star rating"`)
		if m := ratingRegex.FindStringSubmatch(card); len(m) > 1 {
			if r, err := strconv.ParseFloat(m[1], 64); err == nil {
				biz.Rating = r
			}
		}

		businesses = append(businesses, biz)
	}

	return businesses
}

// Yelp HTML parser
func parseYelpHTML(html string) []models.Business {
	var businesses []models.Business

	// Try to find JSON-LD data
	jsonLDRegex := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`)
	jsonMatches := jsonLDRegex.FindAllStringSubmatch(html, -1)

	for _, m := range jsonMatches {
		var data map[string]interface{}
		if err := json.Unmarshal([]byte(m[1]), &data); err != nil {
			continue
		}
		if t, ok := data["@type"].(string); ok && t == "LocalBusiness" {
			biz := models.Business{}
			if name, ok := data["name"].(string); ok {
				biz.Name = name
			}
			if addr, ok := data["address"].(map[string]interface{}); ok {
				street, _ := addr["streetAddress"].(string)
				locality, _ := addr["addressLocality"].(string)
				region, _ := addr["addressRegion"].(string)
				postal, _ := addr["postalCode"].(string)
				biz.Address = fmt.Sprintf("%s, %s, %s %s", street, locality, region, postal)
			}
			if phone, ok := data["telephone"].(string); ok {
				biz.Phone = phone
			}
			if url, ok := data["url"].(string); ok {
				biz.Website = url
			}
			if rating, ok := data["rating"].(float64); ok {
				biz.Rating = rating
			}
			if biz.Name != "" {
				businesses = append(businesses, biz)
			}
		}
	}

	// Fallback: parse listing elements
	if len(businesses) == 0 {
		cardRegex := regexp.MustCompile(`(?s)<div class=".*?businessName.*?".*?</div>`)
		cards := cardRegex.FindAllString(html, -1)
		for _, card := range cards {
			biz := models.Business{}
			nameRegex := regexp.MustCompile(`(?s)<a[^>]*>(.*?)</a>`)
			if m := nameRegex.FindStringSubmatch(card); len(m) > 1 {
				biz.Name = cleanHTML(m[1])
			}
			if biz.Name != "" {
				businesses = append(businesses, biz)
			}
		}
	}

	return businesses
}

// Google Maps HTML parser (limited - Maps is JS-heavy)
func parseGoogleMapsHTML(html string) []models.Business {
	var businesses []models.Business

	// Try to extract from meta tags and JSON embedded in page
	metaRegex := regexp.MustCompile(`(?s)"name"\s*:\s*"([^"]+)"`)
	addrRegex := regexp.MustCompile(`(?s)"address"\s*:\s*"([^"]+)"`)
	phoneRegex := regexp.MustCompile(`(?s)"phone"\s*:\s*"([^"]+)"`)

	names := metaRegex.FindAllStringSubmatch(html, -1)
	addrs := addrRegex.FindAllStringSubmatch(html, -1)
	phones := phoneRegex.FindAllStringSubmatch(html, -1)

	for i, m := range names {
		biz := models.Business{Name: cleanJSON(m[1])}
		if i < len(addrs) {
			biz.Address = cleanJSON(addrs[i][1])
		}
		if i < len(phones) {
			biz.Phone = cleanJSON(phones[i][1])
		}
		if biz.Name != "" && biz.Name != "Google" {
			businesses = append(businesses, biz)
		}
	}

	return businesses
}

func cleanHTML(s string) string {
	s = regexp.MustCompile(`<[^>]*>`).ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	s = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return ' '
		}
		return r
	}, s)
	return strings.TrimSpace(s)
}

func cleanJSON(s string) string {
	s = strings.ReplaceAll(s, `\"`, `"`)
	s = strings.ReplaceAll(s, `\\n`, "\n")
	return strings.TrimSpace(s)
}
