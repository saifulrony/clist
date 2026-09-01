package api

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"client-list-backend/internal/crawler"
	"client-list-backend/internal/database"
	"client-list-backend/internal/google"
	"client-list-backend/internal/models"
	"client-list-backend/internal/scraper"

	"github.com/chromedp/chromedp"
)

type Handler struct {
	GoogleClient *google.Client
	Scraper      *scraper.Client
	Crawler      *crawler.Crawler
	DB           *database.DB
	mu           sync.Mutex
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func NewHandler(gc *google.Client, sc *scraper.Client, cr *crawler.Crawler, db *database.DB) *Handler {
	return &Handler{
		GoogleClient: gc,
		Scraper:      sc,
		Crawler:      cr,
		DB:           db,
	}
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		jsonError(w, "Query is required", http.StatusBadRequest)
		return
	}

	if req.Limit <= 0 {
		req.Limit = 20
	}

	log.Printf("Search: query=%s location=%q limit=%d source=%s", req.Query, req.Location, req.Limit, req.Source)

	var businesses []models.Business
	var err error
	var warning string

	switch req.Source {
	case "google":
		businesses, err = h.GoogleClient.SearchPlacesGoogle(req.Query, req.Location, req.Limit)
		if err == nil {
			businesses = h.GoogleClient.EnrichBusinesses(businesses)
		}
	case "nominatim":
		businesses, err = h.GoogleClient.SearchPlacesNominatim(req.Query, req.Location, req.Limit)
	case "geoapify":
		businesses, err = h.GoogleClient.SearchPlacesGeoapify(req.Query, req.Location, req.Limit)
	case "foursquare":
		businesses, err = h.GoogleClient.SearchPlacesFoursquare(req.Query, req.Location, req.Limit)
	default:
		businesses, err = h.GoogleClient.SearchPlacesBizData(req.Query, req.Location, req.Limit)
	}

	if businesses == nil {
		businesses = []models.Business{}
	}

	log.Printf("Results: %d businesses, err=%v", len(businesses), err)

	if err != nil {
		warning = err.Error()
	}

	// Auto-scrape websites for missing contact data
	if req.Scrape && len(businesses) > 0 {
		log.Printf("Scraping %d businesses for contact data...", len(businesses))
		businesses = h.Scraper.EnrichBusinesses(businesses)
	}

	resp := models.SearchResponse{
		Results: businesses,
		Total:   len(businesses),
		Warning: warning,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) Scrape(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var businesses []models.Business
	if err := json.NewDecoder(r.Body).Decode(&businesses); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("Scraping %d businesses...", len(businesses))
	enriched := h.Scraper.EnrichBusinesses(businesses)
	log.Printf("Scraping done. %d businesses enriched.", len(enriched))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(enriched)
}

// Crawl request body
type CrawlRequest struct {
	Query           string `json:"query"`
	City            string `json:"city"`
	Country         string `json:"country"`
	Source          string `json:"source"`
	Limit           int    `json:"limit"`
	Scrape          bool   `json:"scrape"`
	MinRating       float64 `json:"minRating"`
	SortBy          string `json:"sortBy"`
	RemoveDuplicates bool   `json:"removeDuplicates"`
}

func (h *Handler) StartCrawl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CrawlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Query == "" || req.City == "" || req.Source == "" {
		jsonError(w, "query, city, and source are required", http.StatusBadRequest)
		return
	}

	jobID := fmt.Sprintf("crawl_%d", time.Now().UnixNano())

	// Create job in DB
	if err := h.DB.CreateCrawlJob(jobID, req.Query, req.City, req.Country, req.Source); err != nil {
		http.Error(w, "Failed to create crawl job", http.StatusInternalServerError)
		return
	}

	// Start crawl in background (use Background context, not request context)
	go func() {
		ctx := context.Background()
		businesses, _ := h.Crawler.Crawl(ctx, jobID, req.Query, req.City, req.Country, req.Source, req.Limit, req.Scrape, req.MinRating, req.SortBy, req.RemoveDuplicates)

		// Get results from crawler progress
		p := h.Crawler.GetProgress(jobID)
		status := "done"
		errMsg := ""
		if p.Status == "error" {
			status = "error"
			errMsg = p.Error
		}

		// Save results to database
		if len(businesses) > 0 {
			// Clean useless directory websites before saving
			for i := range businesses {
				if isUselessWebsite(businesses[i].Website) {
					log.Printf("Filtered useless website: %s for %s", businesses[i].Website, businesses[i].Name)
					businesses[i].Website = ""
				}
			}
			saved, saveErr := h.DB.UpsertBusinesses(businesses, req.Source, jobID)
			if saveErr != nil {
				log.Printf("Failed to save crawl results: %v", saveErr)
				errMsg = saveErr.Error()
			} else {
				log.Printf("Saved %d businesses to database from crawl job %s", saved, jobID)
			}
		}

		h.DB.UpdateCrawlJob(jobID, status, p.TotalFound, p.TotalEnriched, errMsg)
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"job_id": jobID, "status": "started"})
}

func (h *Handler) CrawlStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("id")
	if jobID == "" {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}

	// Check crawler progress first
	p := h.Crawler.GetProgress(jobID)
	if p.Status != "not_found" && p.Status != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":         p.Status,
			"total_found":    p.TotalFound,
			"total_enriched": p.TotalEnriched,
			"error":          p.Error,
		})
		return
	}

	// Fallback to DB
	job, err := h.DB.GetCrawlJob(jobID)
	if err != nil {
		jsonError(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func (h *Handler) CrawlJobResults(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("id")
	if jobID == "" {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit := 50
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	businesses, total, err := h.DB.GetBusinessesByCrawlID(jobID, limit, offset)
	if err != nil {
		jsonError(w, "Failed to get results", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": businesses,
		"total":   total,
	})
}

func (h *Handler) CrawlResults(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	source := r.URL.Query().Get("source")

	limit := 50
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	businesses, total, err := h.DB.GetAllBusinesses(limit, offset)
	if err != nil {
		jsonError(w, "Failed to query database", http.StatusInternalServerError)
		return
	}

	_ = source // TODO: filter by source

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": businesses,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

func (h *Handler) CrawlSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	city := r.URL.Query().Get("city")
	category := r.URL.Query().Get("category")
	source := r.URL.Query().Get("source")
	country := r.URL.Query().Get("country")
	hasEmail := r.URL.Query().Get("has_email")
	hasPhone := r.URL.Query().Get("has_phone")
	hasWebsite := r.URL.Query().Get("has_website")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}

	businesses, total, err := h.DB.SearchBusinessesFiltered(query, city, category, source, country, hasEmail, hasPhone, hasWebsite, limit, offset)
	if err != nil {
		jsonError(w, "Failed to search database", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": businesses,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

func (h *Handler) CrawlJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.DB.GetRecentCrawlJobs(20)
	if err != nil {
		jsonError(w, "Failed to get jobs", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jobs)
}

func (h *Handler) CrawlStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.DB.GetStats()
	if err != nil {
		jsonError(w, "Failed to get stats", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (h *Handler) CrawlCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.DB.GetCategories()
	if err != nil {
		jsonError(w, "Failed to get categories", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}

func (h *Handler) CrawlFilters(w http.ResponseWriter, r *http.Request) {
	countries, err := h.DB.GetDistinctValues("country")
	if err != nil {
		countries = []string{}
	}
	cities, err := h.DB.GetDistinctValues("city")
	if err != nil {
		cities = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"countries": countries,
		"cities":    cities,
	})
}

func (h *Handler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		jsonError(w, "Query is required", http.StatusBadRequest)
		return
	}

	if req.Limit <= 0 {
		req.Limit = 20
	}

	var businesses []models.Business
	var err error

	switch req.Source {
	case "google":
		businesses, err = h.GoogleClient.SearchPlacesGoogle(req.Query, req.Location, req.Limit)
		if err == nil {
			businesses = h.GoogleClient.EnrichBusinesses(businesses)
		}
	case "nominatim":
		businesses, err = h.GoogleClient.SearchPlacesNominatim(req.Query, req.Location, req.Limit)
	case "geoapify":
		businesses, err = h.GoogleClient.SearchPlacesGeoapify(req.Query, req.Location, req.Limit)
	case "foursquare":
		businesses, err = h.GoogleClient.SearchPlacesFoursquare(req.Query, req.Location, req.Limit)
	default:
		businesses, err = h.GoogleClient.SearchPlacesBizData(req.Query, req.Location, req.Limit)
	}

	if businesses == nil {
		businesses = []models.Business{}
	}

	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment;filename=clients.csv")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	headers := []string{"Name", "Address", "Phone", "Email", "Website", "Facebook", "Country", "Rating"}
	writer.Write(headers)

	for _, biz := range businesses {
		record := []string{
			biz.Name,
			biz.Address,
			biz.Phone,
			biz.Email,
			biz.Website,
			biz.Facebook,
			biz.Country,
			strconv.FormatFloat(biz.Rating, 'f', 1, 64),
		}
		writer.Write(record)
	}
}

func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func printJSON(v interface{}) {
	b, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(b))
}

func (h *Handler) ExtensionImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Businesses []models.Business `json:"businesses"`
		Source     string            `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Businesses) == 0 {
		jsonError(w, "No businesses provided", http.StatusBadRequest)
		return
	}

	source := req.Source
	if source == "" {
		source = "browser_extension"
	}

	// Ensure each business has the source set, and clean useless websites
	for i := range req.Businesses {
		if req.Businesses[i].Source == "" {
			req.Businesses[i].Source = source
		}
		// Remove useless directory/listing website links
		if isUselessWebsite(req.Businesses[i].Website) {
			log.Printf("Filtered useless website: %s for %s", req.Businesses[i].Website, req.Businesses[i].Name)
			req.Businesses[i].Website = ""
		}
	}

	saved, err := h.DB.UpsertBusinesses(req.Businesses, source, "")
	if err != nil {
		log.Printf("Extension import error: %v", err)
		jsonError(w, "Failed to save businesses", http.StatusInternalServerError)
		return
	}

	log.Printf("Extension imported %d businesses (saved %d) from %s", len(req.Businesses), saved, source)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"saved":     saved,
		"total":     len(req.Businesses),
		"source":    source,
	})
}

func (h *Handler) DeleteBusiness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}

	if err := h.DB.DeleteBusiness(req.ID); err != nil {
		jsonError(w, "Failed to delete", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"deleted": 1})
}

func (h *Handler) DeleteBusinesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		IDs    []int  `json:"ids"`
		Source string `json:"source"`
		All    bool   `json:"all"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var deleted int
	var err error

	if req.All {
		deleted, err = h.DB.DeleteAllBusinesses()
	} else if req.Source != "" {
		deleted, err = h.DB.DeleteBusinessesBySource(req.Source)
	} else if len(req.IDs) > 0 {
		deleted, err = h.DB.DeleteBusinesses(req.IDs)
	} else {
		jsonError(w, "Provide ids, source, or all=true", http.StatusBadRequest)
		return
	}

	if err != nil {
		jsonError(w, "Failed to delete: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"deleted": deleted})
}

func (h *Handler) UpdateBusiness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.Business
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}

	if err := h.DB.UpdateBusiness(req.ID, req); err != nil {
		jsonError(w, "Failed to update", http.StatusInternalServerError)
		return
	}

	business, err := h.DB.GetBusinessByID(req.ID)
	if err != nil {
		jsonError(w, "Failed to fetch updated business", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"business": business})
}

func (h *Handler) EnrichEmails(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		IDs []int `json:"ids"`
		All bool  `json:"all"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var businesses []models.Business
	var err error

	if req.All {
		businesses, _, err = h.DB.GetAllBusinesses(10000, 0)
	} else if len(req.IDs) > 0 {
		businesses, err = h.DB.GetBusinessesByIDs(req.IDs)
	} else {
		jsonError(w, "Provide ids or all=true", http.StatusBadRequest)
		return
	}
	if err != nil {
		jsonError(w, "Failed to get businesses", http.StatusInternalServerError)
		return
	}

	type enrichResult struct {
		Name    string `json:"name"`
		Website string `json:"website"`
		Email   string `json:"email"`
		Error   string `json:"error,omitempty"`
	}

	var results []enrichResult
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 5)

	for _, biz := range businesses {
		if biz.Website == "" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(b models.Business) {
			defer wg.Done()
			defer func() { <-sem }()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Panic in enrich goroutine for %s: %v", b.Name, r)
				}
			}()

			email, err := scrapeEmailFromWebsite(b.Website)
			mu.Lock()
			if err == nil && email != "" {
				if dbErr := h.DB.UpdateBusinessEmail(b.ID, email); dbErr != nil {
					log.Printf("Failed to save email for %s (id=%d): %v", b.Name, b.ID, dbErr)
				} else {
					log.Printf("Saved email %s for %s (id=%d)", email, b.Name, b.ID)
				}
				results = append(results, enrichResult{Name: b.Name, Website: b.Website, Email: email})
			} else {
				results = append(results, enrichResult{Name: b.Name, Website: b.Website, Error: "no email found"})
			}
			mu.Unlock()
		}(biz)
	}
	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enriched": len(results),
		"results":  results,
	})
}

// isUselessWebsite checks if a website URL is a directory/listing site
// rather than the actual business website
func isUselessWebsite(websiteURL string) bool {
	if websiteURL == "" {
		return false
	}
	parsed, err := url.Parse(websiteURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	// Remove www. prefix
	host = strings.TrimPrefix(host, "www.")

	uselessDomains := []string{
		"localsearch.com",
		"yellowpages.com",
		"yelp.com",
		"superpages.com",
		"manta.com",
		"citysearch.com",
		"chamberofcommerce.com",
		"bbb.org",
		"mapquest.com",
		"bing.com",
		"foursquare.com",
		"tripadvisor.com",
		"angieslist.com",
		"thumbtack.com",
		"homeadvisor.com",
		"porch.com",
		"nextdoor.com",
		"alignable.com",
		"hotfrog.com",
		"n49.com",
		"cybo.com",
		"tupalo.com",
		"showmelocal.com",
		"insiderpages.com",
		"localpages.com",
		"mojeek.com",
		"brownbook.net",
		"europages.co.uk",
		"kompass.com",
		"mofuse.com",
		"ublocal.com",
		"local.com",
		"seat61.com",
		"ecommercedb.com",
		"craft.co",
		"opencorporates.com",
		"growjo.com",
		"tracxn.com",
		"owler.com",
		"zoominfo.com",
		"dandb.com",
		"hoovers.com",
		"glassdoor.com",
		"indeed.com",
		"builtin.com",
		"clutch.co",
		"sortlist.com",
		"goodfirms.co",
		"expertise.com",
		" Bark.com",
		"homeblue.com",
		"houselogic.com",
		"porch.com",
		"modernize.com",
		"zillow.com",
		"realtor.com",
		"redfin.com",
		"trulia.com",
	}
	for _, d := range uselessDomains {
		if host == d || strings.HasSuffix(host, "."+d) {
			return true
		}
	}
	return false
}

func scrapeEmailFromWebsite(websiteURL string) (string, error) {
	if websiteURL == "" {
		return "", fmt.Errorf("no URL")
	}
	if len(websiteURL) < 8 || (websiteURL[:7] != "http://" && websiteURL[:8] != "https://") {
		websiteURL = "https://" + websiteURL
	}

	// Remove trailing slash for consistent path joining
	if websiteURL[len(websiteURL)-1] == '/' {
		websiteURL = websiteURL[:len(websiteURL)-1]
	}

	blacklist := []string{"example@", "test@", "noreply", "no-reply", "donotreply", "wixpress", "sentry.io", "schema.org", "w3.org", "googleapis", "facebook.com", "twitter.com", "instagram.com", "youtube.com", ".png", ".jpg", ".gif", ".svg", ".css", ".js", "cloudflare", "gravatar", "wordpress.org", "w.org", "google.com/recaptcha", "fonts.googleapis"}

	extractEmail := func(body string) string {
		emailRe := regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}`)
		emails := emailRe.FindAllString(body, -1)
		for _, e := range emails {
			lower := strings.ToLower(e)
			skip := false
			for _, b := range blacklist {
				if strings.Contains(lower, b) {
					skip = true
					break
				}
			}
			if !skip {
				if idx := strings.IndexAny(e, "()>\"' "); idx > 0 {
					e = e[:idx]
				}
				return e
			}
		}
		return ""
	}

	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 { return fmt.Errorf("too many redirects") }
		return nil
	}}

	fetchAndExtract := func(target string) string {
		req, err := http.NewRequest("GET", target, nil)
		if err != nil {
			return ""
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		req.Header.Set("Accept-Language", "en-US,en;q=0.5")

		resp, err := client.Do(req)
		if err != nil {
			return ""
		}
		defer resp.Body.Close()
		bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 500*1024))
		if err != nil || len(bodyBytes) == 0 {
			return ""
		}
		return extractEmail(string(bodyBytes))
	}

	// Parse URL to check if it already has a path
	parsed, err := url.Parse(websiteURL)
	if err == nil && parsed.Path != "" && parsed.Path != "/" {
		// URL already has a path — try it directly first
		if email := fetchAndExtract(websiteURL); email != "" {
			return email, nil
		}
		// Also try the homepage
		home := parsed.Scheme + "://" + parsed.Host
		if email := fetchAndExtract(home); email != "" {
			return email, nil
		}
	} else {
		// No path — try homepage + common contact pages
		pages := []string{"", "/contact", "/contact-us", "/about", "/about-us"}
		for _, page := range pages {
			target := websiteURL + page
			if email := fetchAndExtract(target); email != "" {
				return email, nil
			}
		}
	}

	// Fallback: use headless browser for JS-rendered pages
	log.Printf("No email found via HTTP for %s, trying headless browser...", websiteURL)
	email := scrapeEmailWithBrowser(websiteURL)
	if email != "" {
		return email, nil
	}

	return "", nil
}

// scrapeEmailWithBrowser uses chromedp headless browser to extract emails
// from JS-rendered pages
func scrapeEmailWithBrowser(websiteURL string) string {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("disable-background-networking", true),
	)

	allocCtx, allocCancel := chromedp.NewExecAllocator(context.Background(), opts...)

	browserCtx, _ := chromedp.NewContext(allocCtx)

	ctx, cancel := context.WithTimeout(browserCtx, 30*time.Second)

	result := scrapeEmailWithBrowserInner(ctx, websiteURL)

	cancel()

	// Cleanup in background - allocCancel blocks waiting for Chrome to exit
	go allocCancel()

	return result
}

func scrapeEmailWithBrowserInner(ctx context.Context, websiteURL string) string {
	var html string
	parsed, _ := url.Parse(websiteURL)
	home := parsed.Scheme + "://" + parsed.Host

	// Try homepage first, then contact pages
	targets := []string{home, home + "/contact", home + "/contact-us", home + "/about", home + "/about-us"}

	blacklist := []string{"example@", "test@", "noreply", "no-reply", "donotreply", "wixpress", "sentry.io", "schema.org", "w3.org", "googleapis", "facebook.com", "twitter.com", "instagram.com", "youtube.com", ".png", ".jpg", ".gif", ".svg", ".css", ".js", "cloudflare", "gravatar", "wordpress.org", "w.org", "google.com/recaptcha", "fonts.googleapis"}

	for _, target := range targets {
		err := chromedp.Run(ctx,
			chromedp.Navigate(target),
			chromedp.WaitReady("body"),
			chromedp.Sleep(3*time.Second),
			chromedp.OuterHTML("html", &html),
		)
		if err != nil || html == "" {
			continue
		}

		// Extract emails from rendered HTML
		emailRe := regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}`)
		emails := emailRe.FindAllString(html, -1)
		for _, e := range emails {
			lower := strings.ToLower(e)
			skip := false
			for _, b := range blacklist {
				if strings.Contains(lower, b) {
					skip = true
					break
				}
			}
			if !skip {
				if idx := strings.IndexAny(e, "()>\"' "); idx > 0 {
					e = e[:idx]
				}
				log.Printf("Browser found email: %s from %s", e, target)
				return e
			}
		}
	}

	return ""
}

// CleanUselessWebsites removes directory/listing website links from existing records
func (h *Handler) CleanUselessWebsites(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	businesses, _, err := h.DB.GetAllBusinesses(100000, 0)
	if err != nil {
		jsonError(w, "Failed to get businesses", http.StatusInternalServerError)
		return
	}

	cleaned := 0
	for _, biz := range businesses {
		if isUselessWebsite(biz.Website) {
			if err := h.DB.UpdateBusinessWebsite(biz.ID, ""); err != nil {
				log.Printf("Failed to clean website for %s: %v", biz.Name, err)
				continue
			}
			cleaned++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"cleaned": cleaned})
}

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *Handler) CampaignRouter(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/campaigns")
	path = strings.TrimSuffix(path, "/")

	if path == "" {
		if r.Method == http.MethodPost {
			h.CreateCampaign(w, r)
		} else if r.Method == http.MethodGet {
			h.ListCampaigns(w, r)
		} else {
			jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	// Handle top-level actions like "businesses"
	if path == "/businesses" || path == "businesses" {
		h.GetBusinessesForCampaign(w, r)
		return
	}

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	idStr := parts[0]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	if len(parts) == 1 {
		if r.Method == http.MethodGet {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/api/campaigns/" + idStr
			h.GetCampaign(w, r2)
		} else if r.Method == http.MethodDelete {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/api/campaigns/" + idStr
			h.DeleteCampaign(w, r2)
		} else {
			jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	action := parts[1]

	switch action {
	case "send":
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/api/campaigns/" + idStr + "/send"
		h.SendCampaign(w, r2)
	case "retry":
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/api/campaigns/" + idStr + "/send"
		h.RetryCampaign(w, r2)
	case "duplicate":
		h.DuplicateCampaign(w, r, id)
	case "stats":
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/api/campaigns/" + idStr + "/stats"
		h.GetCampaignStats(w, r2)
	case "recipients":
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/api/campaigns/" + idStr + "/recipients"
		h.GetCampaignRecipients(w, r2)
	case "track":
		if len(parts) >= 4 {
			trackType := parts[2]
			token := parts[3]
			if trackType == "open" {
				h.TrackOpenToken(w, r, id, token)
			} else if trackType == "click" {
				h.TrackClickToken(w, r, id, token)
			} else {
				http.Error(w, "Invalid track type", http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Invalid track path", http.StatusBadRequest)
		}
	default:
		jsonError(w, "Not found", http.StatusNotFound)
	}
}

func (h *Handler) TrackOpenToken(w http.ResponseWriter, r *http.Request, campaignID int, token string) {
	h.DB.UpdateRecipientOpen(token)
	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	gif, _ := hex.DecodeString("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
	w.Write(gif)
}

func (h *Handler) TrackClickToken(w http.ResponseWriter, r *http.Request, campaignID int, token string) {
	h.DB.UpdateRecipientClick(token)
	originalURL := r.URL.Query().Get("url")
	if originalURL == "" {
		originalURL = "/"
	}
	http.Redirect(w, r, originalURL, http.StatusFound)
}

func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings := h.DB.GetAllSettings()

	defaults := map[string]string{
		"smtp_host":     "",
		"smtp_port":     "587",
		"smtp_username": "",
		"smtp_password": "",
		"smtp_from":     "",
		"smtp_tls":      "true",
		"track_host":    "",
		"email_provider": "smtp",
	}
	for k, v := range defaults {
		if _, ok := settings[k]; !ok {
			settings[k] = v
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

func (h *Handler) SaveSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var settings map[string]string
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.DB.SetSettings(settings); err != nil {
		jsonError(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"saved": len(settings)})
}

func (h *Handler) TestSmtp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		To string `json:"to"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.To == "" {
		jsonError(w, "to email is required", http.StatusBadRequest)
		return
	}

	smtpHost := h.DB.GetSetting("smtp_host")
	smtpPort := h.DB.GetSetting("smtp_port")
	smtpUser := h.DB.GetSetting("smtp_username")
	smtpPass := h.DB.GetSetting("smtp_password")
	fromEmail := h.DB.GetSetting("smtp_from")
	useTLS := h.DB.GetSetting("smtp_tls") != "false"

	if smtpHost == "" || smtpPort == "" {
		jsonError(w, "SMTP host and port are required", http.StatusBadRequest)
		return
	}
	if fromEmail == "" {
		fromEmail = smtpUser
	}

	addr := smtpHost + ":" + smtpPort
	var auth smtp.Auth
	if smtpUser != "" && smtpPass != "" {
		auth = smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: Test Email from ClientList\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nThis is a test email from your ClientList Campaign Manager.\r\n\r\nIf you received this, your SMTP settings are working correctly.",
		fromEmail, req.To)

	var err error
	if useTLS {
		tlsConfig := &tls.Config{ServerName: smtpHost}
		err = sendEmail(addr, auth, fromEmail, req.To, msg, tlsConfig)
	} else {
		err = smtp.SendMail(addr, auth, fromEmail, []string{req.To}, []byte(msg))
	}

	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func (h *Handler) SettingsRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		h.GetSettings(w, r)
	} else if r.Method == http.MethodPost {
		h.SaveSettings(w, r)
	} else {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) CreateCampaign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var c models.Campaign
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if c.Name == "" || c.Subject == "" || c.Body == "" || c.SenderEmail == "" {
		jsonError(w, "name, subject, body, sender_email are required", http.StatusBadRequest)
		return
	}

	id, err := h.DB.CreateCampaign(c)
	if err != nil {
		jsonError(w, "Failed to create campaign", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

func (h *Handler) ListCampaigns(w http.ResponseWriter, r *http.Request) {
	campaigns, err := h.DB.GetCampaigns()
	if err != nil {
		jsonError(w, "Failed to get campaigns", http.StatusInternalServerError)
		return
	}
	if campaigns == nil {
		campaigns = []models.Campaign{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(campaigns)
}

func (h *Handler) GetCampaign(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/campaigns/")
	idStr = strings.TrimSuffix(idStr, "/stats")
	idStr = strings.TrimSuffix(idStr, "/send")
	idStr = strings.TrimSuffix(idStr, "/recipients")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	c, err := h.DB.GetCampaign(id)
	if err != nil {
		jsonError(w, "Campaign not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(c)
}

func (h *Handler) GetCampaignStats(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/campaigns/"), "/")
	if len(parts) < 2 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	stats, err := h.DB.GetCampaignStats(id)
	if err != nil {
		jsonError(w, "Failed to get stats", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (h *Handler) GetCampaignRecipients(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/campaigns/"), "/")
	if len(parts) < 2 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	limit := 50
	offset := 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	recipients, total, err := h.DB.GetRecipientsByCampaign(id, limit, offset)
	if err != nil {
		jsonError(w, "Failed to get recipients", http.StatusInternalServerError)
		return
	}
	if recipients == nil {
		recipients = []models.CampaignRecipient{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"recipients": recipients,
		"total":      total,
	})
}

func (h *Handler) GetBusinessesForCampaign(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limit := 500
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}

	businesses, err := h.DB.SearchBusinessesForCampaign(query, limit)
	if err != nil {
		jsonError(w, "Failed to query businesses", http.StatusInternalServerError)
		return
	}
	if businesses == nil {
		businesses = []database.CampaignBusiness{}
	}

	total := h.DB.CountBusinessesWithEmail()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"businesses": businesses,
		"total":      total,
	})
}

func (h *Handler) SendCampaign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/campaigns/"), "/")
	if len(parts) < 2 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	c, err := h.DB.GetCampaign(id)
	if err != nil {
		jsonError(w, "Campaign not found", http.StatusNotFound)
		return
	}

	if c.Status != "draft" {
		jsonError(w, "Campaign already sent", http.StatusBadRequest)
		return
	}

	var req struct {
		BusinessIDs []int  `json:"business_ids"`
		All         bool   `json:"all"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var businesses []models.Business
	if len(req.BusinessIDs) > 0 {
		businesses, err = h.DB.GetBusinessesByIDs(req.BusinessIDs)
	} else {
		businesses, err = h.DB.GetBusinessesWithEmail(10000)
	}
	if err != nil || len(businesses) == 0 {
		jsonError(w, "No businesses with emails found", http.StatusBadRequest)
		return
	}

	h.DB.UpdateCampaignStatus(id, "sending")

	var recipients []models.CampaignRecipient
	for _, biz := range businesses {
		if biz.Email == "" {
			continue
		}
		recipients = append(recipients, models.CampaignRecipient{
			BusinessID: biz.ID,
			Email:      biz.Email,
			OpenToken:  generateToken(),
			ClickToken: generateToken(),
		})
	}

	if err := h.DB.AddRecipients(id, recipients); err != nil {
		h.DB.UpdateCampaignStatus(id, "draft")
		jsonError(w, "Failed to add recipients", http.StatusInternalServerError)
		return
	}

	go h.sendCampaignEmails(id, c, recipients)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sent":    len(recipients),
		"failed":  0,
		"status":  "sending",
	})
}

func (h *Handler) RetryCampaign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/campaigns/"), "/")
	if len(parts) < 2 {
		jsonError(w, "Invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	c, err := h.DB.GetCampaign(id)
	if err != nil {
		jsonError(w, "Campaign not found", http.StatusNotFound)
		return
	}

	if c.Status != "failed" && c.Status != "sending" {
		jsonError(w, "Can only retry failed or stuck campaigns", http.StatusBadRequest)
		return
	}

	h.DB.UpdateCampaignStatus(id, "sending")

	recipients, _, err := h.DB.GetRecipientsByCampaign(id, 10000, 0)
	if err != nil || len(recipients) == 0 {
		h.DB.UpdateCampaignStatus(id, "failed")
		jsonError(w, "No recipients found for this campaign", http.StatusBadRequest)
		return
	}

	go h.sendCampaignEmails(id, c, recipients)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "sending",
	})
}

func (h *Handler) DuplicateCampaign(w http.ResponseWriter, r *http.Request, campaignID int) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	c, err := h.DB.GetCampaign(campaignID)
	if err != nil {
		jsonError(w, "Campaign not found", http.StatusNotFound)
		return
	}

	newCampaign := models.Campaign{
		Name:        c.Name + " (copy)",
		Subject:     c.Subject,
		Body:        c.Body,
		SenderEmail: c.SenderEmail,
	}

	newID, err := h.DB.CreateCampaign(newCampaign)
	if err != nil {
		jsonError(w, "Failed to duplicate campaign", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":           newID,
		"name":         newCampaign.Name,
		"subject":      newCampaign.Subject,
		"body":         newCampaign.Body,
		"sender_email": newCampaign.SenderEmail,
	})
}

func (h *Handler) sendCampaignEmails(campaignID int, c models.Campaign, recipients []models.CampaignRecipient) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Campaign %d: PANIC: %v", campaignID, r)
			h.DB.UpdateCampaignStatus(campaignID, "failed")
		}
	}()

	smtpHost := h.DB.GetSetting("smtp_host")
	smtpPort := h.DB.GetSetting("smtp_port")
	smtpUser := h.DB.GetSetting("smtp_username")
	smtpPass := h.DB.GetSetting("smtp_password")
	trackHost := h.DB.GetSetting("track_host")
	useTLS := h.DB.GetSetting("smtp_tls") != "false"
	senderEmail := c.SenderEmail
	if senderEmail == "" {
		senderEmail = h.DB.GetSetting("smtp_from")
	}
	if trackHost == "" {
		trackHost = smtpHost
	}
	trackHost = strings.TrimPrefix(trackHost, "http://")
	trackHost = strings.TrimPrefix(trackHost, "https://")
	trackHost = strings.TrimRight(trackHost, "/")

	log.Printf("Campaign %d: Starting send. Host=%s, Port=%s, TrackHost=%s, TLS=%v, Recipients=%d", campaignID, smtpHost, smtpPort, trackHost, useTLS, len(recipients))

	if smtpHost == "" || smtpPort == "" {
		log.Printf("Campaign %d: SMTP not configured, marking as sent (no actual emails sent)", campaignID)
		h.DB.UpdateCampaignStatus(campaignID, "sent")
		h.DB.UpdateCampaignStats(campaignID)
		return
	}

	addr := smtpHost + ":" + smtpPort
	var auth smtp.Auth
	if smtpUser != "" && smtpPass != "" {
		auth = smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	}

	var tlsConfig *tls.Config
	if useTLS {
		tlsConfig = &tls.Config{ServerName: smtpHost}
	}

	var sent int
	var failed int

	// Get recipients with business data for template variables
	recipientsWithBusiness, err := h.DB.GetRecipientsWithBusinessByCampaign(campaignID)
	if err != nil {
		log.Printf("Campaign %d: Failed to get recipients with business data: %v", campaignID, err)
		// Fallback to basic recipients
		for _, r := range recipients {
			trackOpenURL := fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/open/%s", trackHost, campaignID, r.OpenToken)
			trackClickURL := func(rawURL string) string {
				return fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/click/%s?url=%s", trackHost, campaignID, r.ClickToken, url.QueryEscape(rawURL))
			}

			body := c.Body
			body += fmt.Sprintf(`<img src="%s" width="1" height="1" style="display:none">`, trackOpenURL)

			re := regexp.MustCompile(`href="(http[^"]*)"`)
			body = re.ReplaceAllStringFunc(body, func(match string) string {
				urlStr := strings.TrimPrefix(match, `href="`)
				urlStr = strings.TrimSuffix(urlStr, `"`)
				return `href="` + trackClickURL(urlStr) + `"`
			})

			msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
				senderEmail, r.Email, c.Subject, body)

			var err error
			if useTLS {
				err = sendEmail(addr, auth, senderEmail, r.Email, msg, tlsConfig)
			} else {
				err = smtp.SendMail(addr, auth, senderEmail, []string{r.Email}, []byte(msg))
			}
			if err != nil {
				log.Printf("Campaign %d: Failed to send to %s: %v", campaignID, r.Email, err)
				failed++
			} else {
				log.Printf("Campaign %d: Sent to %s", campaignID, r.Email)
				sent++
			}
		}
	} else {
		for _, r := range recipientsWithBusiness {
			trackOpenURL := fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/open/%s", trackHost, campaignID, r.OpenToken)
			trackClickURL := func(rawURL string) string {
				return fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/click/%s?url=%s", trackHost, campaignID, r.ClickToken, url.QueryEscape(rawURL))
			}

			body := c.Body
			// Replace template variables
			body = strings.ReplaceAll(body, "{{name}}", r.Name)
			body = strings.ReplaceAll(body, "{{company}}", r.Name)
			body = strings.ReplaceAll(body, "{{email}}", r.Email)
			body = strings.ReplaceAll(body, "{{city}}", r.City)
			body = strings.ReplaceAll(body, "{{category}}", r.Category)
			body = strings.ReplaceAll(body, "{{country}}", r.Country)

			body += fmt.Sprintf(`<img src="%s" width="1" height="1" style="display:none">`, trackOpenURL)

			re := regexp.MustCompile(`href="(http[^"]*)"`)
			body = re.ReplaceAllStringFunc(body, func(match string) string {
				urlStr := strings.TrimPrefix(match, `href="`)
				urlStr = strings.TrimSuffix(urlStr, `"`)
				return `href="` + trackClickURL(urlStr) + `"`
			})

			// Also replace variables in subject
			subject := c.Subject
			subject = strings.ReplaceAll(subject, "{{name}}", r.Name)
			subject = strings.ReplaceAll(subject, "{{company}}", r.Name)
			subject = strings.ReplaceAll(subject, "{{email}}", r.Email)
			subject = strings.ReplaceAll(subject, "{{city}}", r.City)
			subject = strings.ReplaceAll(subject, "{{category}}", r.Category)
			subject = strings.ReplaceAll(subject, "{{country}}", r.Country)

			msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
				senderEmail, r.Email, subject, body)

			var err error
			if useTLS {
				err = sendEmail(addr, auth, senderEmail, r.Email, msg, tlsConfig)
			} else {
				err = smtp.SendMail(addr, auth, senderEmail, []string{r.Email}, []byte(msg))
			}
			if err != nil {
				log.Printf("Campaign %d: Failed to send to %s: %v", campaignID, r.Email, err)
				failed++
			} else {
				sent++
			}
		}
	}

	h.DB.UpdateCampaignStats(campaignID)
	if failed == 0 {
		h.DB.UpdateCampaignStatus(campaignID, "sent")
	} else if sent > 0 {
		h.DB.UpdateCampaignStatus(campaignID, "sent")
	} else {
		h.DB.UpdateCampaignStatus(campaignID, "failed")
	}
	log.Printf("Campaign %d: Done. Sent: %d, Failed: %d", campaignID, sent, failed)
}

func sendEmail(addr string, auth smtp.Auth, from, to, msg string, tlsConfig *tls.Config) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}

	var conn net.Conn

	// Port 465 uses implicit TLS, port 587 uses STARTTLS
	dialer := &net.Dialer{Timeout: 30 * time.Second}
	if strings.HasSuffix(addr, ":465") {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	} else {
		conn, err = dialer.Dial("tcp", addr)
	}
	if err != nil {
		return err
	}
	defer conn.Close()

	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer c.Close()

	// Try STARTTLS if not already using implicit TLS (port 465)
	if !strings.HasSuffix(addr, ":465") {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err = c.StartTLS(tlsConfig); err != nil {
				return err
			}
		}
	}

	if auth != nil {
		if err = c.Auth(auth); err != nil {
			return err
		}
	}
	if err = c.Mail(from); err != nil {
		return err
	}
	if err = c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	_, err = w.Write([]byte(msg))
	if err != nil {
		return err
	}
	w.Close()
	return c.Quit()
}

func (h *Handler) TrackOpen(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/campaigns/"), "/")
	if len(parts) < 4 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	token := parts[3]

	h.DB.UpdateRecipientOpen(token)

	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	// 1x1 transparent GIF
	gif, _ := hex.DecodeString("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
	w.Write(gif)
}

func (h *Handler) TrackClick(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/campaigns/"), "/")
	if len(parts) < 4 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	token := parts[3]

	h.DB.UpdateRecipientClick(token)

	originalURL := r.URL.Query().Get("url")
	if originalURL == "" {
		originalURL = "/"
	}
	http.Redirect(w, r, originalURL, http.StatusFound)
}

func (h *Handler) DeleteCampaign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/api/campaigns/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		jsonError(w, "Invalid campaign ID", http.StatusBadRequest)
		return
	}

	if err := h.DB.DeleteCampaign(id); err != nil {
		jsonError(w, "Failed to delete campaign", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"deleted": 1})
}
