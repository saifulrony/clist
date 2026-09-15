package api

import (
	"bytes"
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
	"path/filepath"
	"regexp"
	mathrand "math/rand"
	"strconv"
	"strings"
	"sync"
	"time"

	"client-list-backend/internal/crawler"
	"client-list-backend/internal/database"
	"client-list-backend/internal/google"
	"client-list-backend/internal/models"
	"client-list-backend/internal/scraper"
	"client-list-backend/internal/verifier"

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
	pipelineStage := r.URL.Query().Get("pipeline_stage")
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

	businesses, total, err := h.DB.SearchBusinessesFiltered(query, city, category, source, country, hasEmail, hasPhone, hasWebsite, pipelineStage, limit, offset)
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

func (h *Handler) CreateBusiness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.Business
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		jsonError(w, "Business name is required", http.StatusBadRequest)
		return
	}

	id, err := h.DB.CreateBusiness(req)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to create business: %v", err), http.StatusInternalServerError)
		return
	}

	business, err := h.DB.GetBusinessByID(int(id))
	if err != nil {
		business = req
		business.ID = int(id)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"id":       id,
		"business": business,
	})
}

func (h *Handler) ImportBusinessesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Businesses []models.Business `json:"businesses"`
		Source     string            `json:"source"`
		Category   string            `json:"category"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if len(req.Businesses) == 0 {
		jsonError(w, "No businesses provided to import", http.StatusBadRequest)
		return
	}

	source := req.Source
	if source == "" {
		source = "csv_import"
	}

	for i := range req.Businesses {
		req.Businesses[i].Name = strings.TrimSpace(req.Businesses[i].Name)
		if req.Businesses[i].Name == "" {
			req.Businesses[i].Name = "Unnamed Lead"
		}
		if req.Businesses[i].Source == "" {
			req.Businesses[i].Source = source
		}
		if req.Businesses[i].Category == "" && req.Category != "" {
			req.Businesses[i].Category = req.Category
		}
		if req.Businesses[i].EmailStatus == "" {
			req.Businesses[i].EmailStatus = "unverified"
		}
		if req.Businesses[i].PipelineStage == "" {
			req.Businesses[i].PipelineStage = "lead"
		}
		if req.Businesses[i].Email != "" {
			if clean, ok := cleanRecipientEmail(req.Businesses[i].Email); ok {
				req.Businesses[i].Email = clean
			}
		}
	}

	saved, err := h.DB.UpsertBusinesses(req.Businesses, source, "")
	if err != nil {
		log.Printf("ImportBusinesses error: %v", err)
		jsonError(w, "Failed to save businesses: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully imported %d businesses into database (source: %s)", saved, source)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"saved":   saved,
		"total":   len(req.Businesses),
		"source":  source,
	})
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

// CampaignSSEHub manages real-time Server-Sent Event (SSE) client subscriptions
type CampaignSSEHub struct {
	sync.RWMutex
	clients map[chan []byte]bool
}

var GlobalCampaignSSEHub = &CampaignSSEHub{
	clients: make(map[chan []byte]bool),
}

func (hub *CampaignSSEHub) Subscribe() chan []byte {
	hub.Lock()
	defer hub.Unlock()
	ch := make(chan []byte, 32)
	hub.clients[ch] = true
	return ch
}

func (hub *CampaignSSEHub) Unsubscribe(ch chan []byte) {
	hub.Lock()
	defer hub.Unlock()
	if _, ok := hub.clients[ch]; ok {
		delete(hub.clients, ch)
		close(ch)
	}
}

func (hub *CampaignSSEHub) Broadcast(msg []byte) {
	hub.RLock()
	defer hub.RUnlock()
	for ch := range hub.clients {
		select {
		case ch <- msg:
		default:
		}
	}
}

// BroadcastCampaignChange notifies all connected clients only when an actual database change occurs
func BroadcastCampaignChange(eventType string, campaignID int) {
	payload, _ := json.Marshal(map[string]interface{}{
		"event":       eventType,
		"campaign_id": campaignID,
		"timestamp":   time.Now().Unix(),
	})
	GlobalCampaignSSEHub.Broadcast(payload)
}

func (h *Handler) CampaignStreamHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	ch := GlobalCampaignSSEHub.Subscribe()
	defer GlobalCampaignSSEHub.Unsubscribe(ch)

	// Send initial ping so client knows connection is open
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: change\ndata: %s\n\n", string(msg))
			flusher.Flush()
		}
	}
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

	// Real-time SSE stream route: only pushes when actual data changes
	if path == "/stream" || path == "stream" {
		h.CampaignStreamHandler(w, r)
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
	case "steps":
		h.CampaignStepsHandler(w, r)
	case "ab-stats":
		h.CampaignABStatsHandler(w, r)
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
	log.Printf("Tracking pixel OPEN triggered: campaign=%d, token=%s", campaignID, token)
	if err := h.DB.UpdateRecipientOpen(token); err != nil {
		log.Printf("UpdateRecipientOpen error: %v", err)
	}
	h.DB.UpdateCampaignStats(campaignID)
	BroadcastCampaignChange("email_opened", campaignID)

	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	gif, _ := hex.DecodeString("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")
	w.Write(gif)
}

func (h *Handler) TrackClickToken(w http.ResponseWriter, r *http.Request, campaignID int, token string) {
	log.Printf("Tracking link CLICK triggered: campaign=%d, token=%s", campaignID, token)
	if err := h.DB.UpdateRecipientClick(token); err != nil {
		log.Printf("UpdateRecipientClick error: %v", err)
	}
	h.DB.UpdateCampaignStats(campaignID)
	BroadcastCampaignChange("email_clicked", campaignID)

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
		To      string `json:"to"`
		Subject string `json:"subject"`
		HTML    string `json:"html"`
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
		jsonError(w, "SMTP host and port are required. Please configure SMTP in Settings.", http.StatusBadRequest)
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

	subject := req.Subject
	if subject == "" {
		subject = "Test Email from ClientList"
	} else if !strings.HasPrefix(subject, "[TEST]") {
		subject = "[TEST] " + subject
	}

	var msg string
	if req.HTML != "" {
		msg = fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
			fromEmail, req.To, subject, req.HTML)
	} else {
		msg = fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nThis is a test email from your ClientList Campaign Manager.\r\n\r\nIf you received this, your SMTP settings are working correctly.",
			fromEmail, req.To, subject)
	}

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
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Test email sent successfully to " + req.To})
}

func (h *Handler) StartCampaignScheduler() {
	ticker := time.NewTicker(20 * time.Second)
	log.Println("Campaign Scheduler worker initialized (checking every 20s)")
	for range ticker.C {
		dueCampaigns, err := h.DB.GetDueScheduledCampaigns()
		if err == nil && len(dueCampaigns) > 0 {
			for _, c := range dueCampaigns {
				log.Printf("Scheduler: Triggering scheduled campaign %d ('%s')", c.ID, c.Name)
				h.DB.UpdateCampaignStatus(c.ID, "sending")
				BroadcastCampaignChange("campaign_triggered", c.ID)

				recipients, _, err := h.DB.GetRecipientsByCampaign(c.ID, 10000, 0)
				if err != nil || len(recipients) == 0 {
					log.Printf("Scheduler: Campaign %d has no recipients, marking failed", c.ID)
					h.DB.UpdateCampaignStatus(c.ID, "failed")
					BroadcastCampaignChange("campaign_failed", c.ID)
					continue
				}

				go h.sendCampaignEmails(c.ID, c, recipients)
			}
		}

		// Process automated follow-up sequence steps
		h.processDueFollowUpSteps()
	}
}

func (h *Handler) processDueFollowUpSteps() {
	dueRecipients, err := h.DB.GetDueFollowUpRecipients()
	if err != nil || len(dueRecipients) == 0 {
		return
	}

	smtpHost := h.DB.GetSetting("smtp_host")
	smtpPort := h.DB.GetSetting("smtp_port")
	smtpUser := h.DB.GetSetting("smtp_username")
	smtpPass := h.DB.GetSetting("smtp_password")
	trackHost := h.DB.GetSetting("track_host")
	useTLS := h.DB.GetSetting("smtp_tls") != "false"
	configuredFrom := h.DB.GetSetting("smtp_from")

	if smtpHost == "" || smtpPort == "" {
		return
	}

	if trackHost == "" {
		trackHost = smtpHost
	}
	trackHost = strings.TrimPrefix(trackHost, "http://")
	trackHost = strings.TrimPrefix(trackHost, "https://")
	trackHost = strings.TrimRight(trackHost, "/")

	addr := smtpHost + ":" + smtpPort
	var auth smtp.Auth
	if smtpUser != "" && smtpPass != "" {
		auth = smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	}
	var tlsConfig *tls.Config
	if useTLS {
		tlsConfig = &tls.Config{ServerName: smtpHost}
	}

	for _, item := range dueRecipients {
		cleanTo, ok := cleanRecipientEmail(item.Email)
		if !ok {
			log.Printf("Follow-up step: Skipping invalid recipient email format: %s", item.Email)
			continue
		}
		item.Email = cleanTo

		if h.DB.IsEmailUnsubscribed(item.Email) {
			continue
		}

		envelopeSender := smtpUser
		if envelopeSender == "" {
			envelopeSender = configuredFrom
		}
		if envelopeSender == "" {
			envelopeSender = item.SenderEmail
		}
		fromHeader := item.SenderEmail
		if fromHeader == "" {
			fromHeader = envelopeSender
		}

		trackOpenURL := fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/open/%s", trackHost, item.CampaignID, item.OpenToken)
		trackClickURL := func(rawURL string) string {
			return fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/click/%s?url=%s", trackHost, item.CampaignID, item.ClickToken, url.QueryEscape(rawURL))
		}
		unsubURL := fmt.Sprintf("http://%s:18001/api/campaigns/unsubscribe?token=%s", trackHost, item.OpenToken)

		recipientName := item.BizName
		if recipientName == "" {
			recipientName = strings.Split(item.Email, "@")[0]
		}

		body := item.Body
		body = strings.ReplaceAll(body, "{{name}}", recipientName)
		body = strings.ReplaceAll(body, "{{company}}", recipientName)
		body = strings.ReplaceAll(body, "{{email}}", item.Email)
		body = strings.ReplaceAll(body, "{{city}}", item.BizCity)
		body = strings.ReplaceAll(body, "{{category}}", item.BizCategory)
		body = strings.ReplaceAll(body, "{{country}}", item.BizCountry)
		body = strings.ReplaceAll(body, "{{unsubscribe_link}}", unsubURL)
		body = parseSpintax(body)
		body += fmt.Sprintf(`<img src="%s" width="1" height="1" style="display:none">`, trackOpenURL)

		re := regexp.MustCompile(`href="(http[^"]*)"`)
		body = re.ReplaceAllStringFunc(body, func(match string) string {
			urlStr := strings.TrimPrefix(match, `href="`)
			urlStr = strings.TrimSuffix(urlStr, `"`)
			return `href="` + trackClickURL(urlStr) + `"`
		})

		subject := item.Subject
		subject = strings.ReplaceAll(subject, "{{name}}", recipientName)
		subject = strings.ReplaceAll(subject, "{{company}}", recipientName)
		subject = strings.ReplaceAll(subject, "{{email}}", item.Email)
		subject = strings.ReplaceAll(subject, "{{city}}", item.BizCity)
		subject = strings.ReplaceAll(subject, "{{category}}", item.BizCategory)
		subject = strings.ReplaceAll(subject, "{{country}}", item.BizCountry)
		subject = parseSpintax(subject)

		msg := fmt.Sprintf("From: %s\r\nReply-To: %s\r\nTo: %s\r\nSubject: %s\r\nList-Unsubscribe: <%s>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
			fromHeader, fromHeader, item.Email, subject, unsubURL, body)

		var err error
		if useTLS {
			err = sendEmail(addr, auth, envelopeSender, item.Email, msg, tlsConfig)
		} else {
			err = smtp.SendMail(addr, auth, envelopeSender, []string{item.Email}, []byte(msg))
		}

		if err != nil {
			log.Printf("Follow-up sequence: Failed step %d to %s for campaign %d: %v", item.StepNumber, item.Email, item.CampaignID, err)
		} else {
			log.Printf("Follow-up sequence: Successfully sent step %d to %s for campaign %d", item.StepNumber, item.Email, item.CampaignID)
			h.DB.UpdateRecipientStepSent(item.RecipientID, item.StepNumber)
			h.DB.UpdateCampaignStats(item.CampaignID)
		}
		time.Sleep(1 * time.Second)
	}
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
	BroadcastCampaignChange("campaign_created", id)

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

	if c.Status != "draft" && c.Status != "scheduled" && c.Status != "failed" {
		jsonError(w, "Campaign has already been sent or is currently delivering", http.StatusBadRequest)
		return
	}

	var req struct {
		BusinessIDs []int `json:"business_ids"`
		Emails      []struct {
			Email string `json:"email"`
			Name  string `json:"name"`
		} `json:"emails"`
		All bool `json:"all"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var recipients []models.CampaignRecipient

	if len(req.Emails) > 0 {
		for _, em := range req.Emails {
			cleanEmail := strings.TrimSpace(em.Email)
			if cleanEmail == "" {
				continue
			}
			recipients = append(recipients, models.CampaignRecipient{
				BusinessID: 0,
				Email:      cleanEmail,
				OpenToken:  generateToken(),
				ClickToken: generateToken(),
			})
		}
	} else if len(req.BusinessIDs) > 0 {
		businesses, err := h.DB.GetBusinessesByIDs(req.BusinessIDs)
		if err != nil {
			jsonError(w, "Failed to fetch selected businesses", http.StatusInternalServerError)
			return
		}
		for _, biz := range businesses {
			if strings.TrimSpace(biz.Email) == "" {
				continue
			}
			recipients = append(recipients, models.CampaignRecipient{
				BusinessID: biz.ID,
				Email:      strings.TrimSpace(biz.Email),
				OpenToken:  generateToken(),
				ClickToken: generateToken(),
			})
		}
	} else if req.All {
		businesses, err := h.DB.GetBusinessesWithEmail(10000)
		if err != nil {
			jsonError(w, "Failed to fetch businesses from database", http.StatusInternalServerError)
			return
		}
		for _, biz := range businesses {
			if strings.TrimSpace(biz.Email) == "" {
				continue
			}
			variant := "A"
			if c.IsABTest == 1 && len(recipients)%2 == 1 {
				variant = "B"
			}
			recipients = append(recipients, models.CampaignRecipient{
				CampaignID: id,
				BusinessID: biz.ID,
				Email:      strings.TrimSpace(biz.Email),
				OpenToken:  generateToken(),
				ClickToken: generateToken(),
				Variant:    variant,
			})
		}
	} else {
		jsonError(w, "No recipients selected. Please choose recipients before sending.", http.StatusBadRequest)
		return
	}

	if len(recipients) == 0 {
		jsonError(w, "No valid email addresses found among selected recipients.", http.StatusBadRequest)
		return
	}

	if c.Status == "scheduled" || (c.ScheduledAt != "" && c.Status != "failed") {
		h.DB.UpdateCampaignStatus(id, "scheduled")
		if err := h.DB.AddRecipients(id, recipients); err != nil {
			h.DB.UpdateCampaignStatus(id, "draft")
			jsonError(w, "Failed to add recipients", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		BroadcastCampaignChange("campaign_scheduled", id)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"queued":  len(recipients),
			"status":  "scheduled",
			"message": fmt.Sprintf("Campaign scheduled for %s: %d recipient(s) queued", c.ScheduledAt, len(recipients)),
		})
		return
	}

	h.DB.UpdateCampaignStatus(id, "sending")
	BroadcastCampaignChange("campaign_sending", id)

	if err := h.DB.AddRecipients(id, recipients); err != nil {
		h.DB.UpdateCampaignStatus(id, "draft")
		jsonError(w, "Failed to add recipients", http.StatusInternalServerError)
		return
	}

	go h.sendCampaignEmails(id, c, recipients)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"queued":  len(recipients),
		"status":  "sending",
		"message": fmt.Sprintf("Campaign started: %d recipient(s) queued for delivery", len(recipients)),
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
	BroadcastCampaignChange("campaign_retrying", id)

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
	BroadcastCampaignChange("campaign_created", newID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":           newID,
		"name":         newCampaign.Name,
		"subject":      newCampaign.Subject,
		"body":         newCampaign.Body,
		"sender_email": newCampaign.SenderEmail,
	})
}

func cleanRecipientEmail(raw string) (string, bool) {
	email := strings.TrimSpace(raw)
	if strings.Contains(email, "%") {
		if unescaped, err := url.QueryUnescape(email); err == nil {
			email = strings.TrimSpace(unescaped)
		}
	}
	email = strings.Trim(email, `"'<>()[]{},;:/\ `)
	if !verifier.ValidateSyntax(email) {
		return "", false
	}
	lower := strings.ToLower(email)
	for _, ext := range []string{".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", "@2x", "@3x"} {
		if strings.Contains(lower, ext) {
			return "", false
		}
	}
	return email, true
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
	configuredFrom := h.DB.GetSetting("smtp_from")

	// Envelope sender for SMTP connection (must match authenticated account on Gmail/Office365/SES)
	envelopeSender := smtpUser
	if envelopeSender == "" {
		envelopeSender = configuredFrom
	}
	if envelopeSender == "" {
		envelopeSender = c.SenderEmail
	}

	fromHeader := c.SenderEmail
	if fromHeader == "" {
		fromHeader = envelopeSender
	}
	replyToHeader := c.SenderEmail
	if replyToHeader == "" {
		replyToHeader = envelopeSender
	}

	if trackHost == "" {
		trackHost = smtpHost
	}
	trackHost = strings.TrimPrefix(trackHost, "http://")
	trackHost = strings.TrimPrefix(trackHost, "https://")
	trackHost = strings.TrimRight(trackHost, "/")

	log.Printf("Campaign %d: Starting send. Host=%s, Port=%s, EnvelopeSender=%s, From=%s, Recipients=%d", campaignID, smtpHost, smtpPort, envelopeSender, fromHeader, len(recipients))

	if smtpHost == "" || smtpPort == "" {
		log.Printf("Campaign %d: SMTP not configured, marking as failed", campaignID)
		h.DB.UpdateCampaignStatus(campaignID, "failed")
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

	dailyLimit := 0
	if val := h.DB.GetSetting("smtp_daily_limit"); val != "" {
		if l, err := strconv.Atoi(val); err == nil && l > 0 {
			dailyLimit = l
		}
	}

	// Get recipients with business data for template variables
	recipientsWithBusiness, err := h.DB.GetRecipientsWithBusinessByCampaign(campaignID)
	if err != nil || len(recipientsWithBusiness) == 0 {
		log.Printf("Campaign %d: Fallback to basic recipient list", campaignID)
		for _, r := range recipients {
			cleanTo, ok := cleanRecipientEmail(r.Email)
			if !ok {
				log.Printf("Campaign %d: Skipping invalid recipient email format: %s", campaignID, r.Email)
				continue
			}
			r.Email = cleanTo

			if h.DB.IsEmailUnsubscribed(r.Email) {
				log.Printf("Campaign %d: Skipping unsubscribed recipient %s", campaignID, r.Email)
				continue
			}

			if dailyLimit > 0 {
				sentToday, _ := h.DB.GetRolling24HourSentCount()
				if sentToday >= dailyLimit {
					log.Printf("Campaign %d: Hit daily sending limit (%d/24h). Pausing.", campaignID, dailyLimit)
					h.DB.UpdateCampaignStatus(campaignID, "paused")
					return
				}
			}

			trackOpenURL := fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/open/%s", trackHost, campaignID, r.OpenToken)
			trackClickURL := func(rawURL string) string {
				return fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/click/%s?url=%s", trackHost, campaignID, r.ClickToken, url.QueryEscape(rawURL))
			}
			unsubURL := fmt.Sprintf("http://%s:18001/api/campaigns/unsubscribe?token=%s", trackHost, r.OpenToken)

			body := c.Body
			body = parseSpintax(body)
			body = strings.ReplaceAll(body, "{{unsubscribe_link}}", unsubURL)
			body += fmt.Sprintf(`<img src="%s" width="1" height="1" style="display:none">`, trackOpenURL)

			re := regexp.MustCompile(`href="(http[^"]*)"`)
			body = re.ReplaceAllStringFunc(body, func(match string) string {
				urlStr := strings.TrimPrefix(match, `href="`)
				urlStr = strings.TrimSuffix(urlStr, `"`)
				return `href="` + trackClickURL(urlStr) + `"`
			})

			subject := parseSpintax(c.Subject)

			msg := fmt.Sprintf("From: %s\r\nReply-To: %s\r\nTo: %s\r\nSubject: %s\r\nList-Unsubscribe: <%s>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
				fromHeader, replyToHeader, r.Email, subject, unsubURL, body)

			var err error
			if useTLS {
				err = sendEmail(addr, auth, envelopeSender, r.Email, msg, tlsConfig)
			} else {
				err = smtp.SendMail(addr, auth, envelopeSender, []string{r.Email}, []byte(msg))
			}
			if err != nil {
				log.Printf("Campaign %d: Failed to send to %s: %v", campaignID, r.Email, err)
				failed++
			} else {
				sent++
				h.DB.UpdateRecipientSent(r.ID)
				log.Printf("Campaign %d: Sent successfully to %s", campaignID, r.Email)
			}
			h.DB.UpdateCampaignStats(campaignID)
			time.Sleep(time.Duration(1200+mathrand.Intn(1500)) * time.Millisecond)
		}
	} else {
		for _, r := range recipientsWithBusiness {
			cleanTo, ok := cleanRecipientEmail(r.Email)
			if !ok {
				log.Printf("Campaign %d: Skipping invalid recipient email format: %s", campaignID, r.Email)
				continue
			}
			r.Email = cleanTo

			if h.DB.IsEmailUnsubscribed(r.Email) {
				log.Printf("Campaign %d: Skipping unsubscribed recipient %s", campaignID, r.Email)
				continue
			}

			if dailyLimit > 0 {
				sentToday, _ := h.DB.GetRolling24HourSentCount()
				if sentToday >= dailyLimit {
					log.Printf("Campaign %d: Hit daily sending limit (%d/24h). Pausing.", campaignID, dailyLimit)
					h.DB.UpdateCampaignStatus(campaignID, "paused")
					return
				}
			}

			trackOpenURL := fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/open/%s", trackHost, campaignID, r.OpenToken)
			trackClickURL := func(rawURL string) string {
				return fmt.Sprintf("http://%s:18001/api/campaigns/%d/track/click/%s?url=%s", trackHost, campaignID, r.ClickToken, url.QueryEscape(rawURL))
			}
			unsubURL := fmt.Sprintf("http://%s:18001/api/campaigns/unsubscribe?token=%s", trackHost, r.OpenToken)

			recipientName := r.Name
			if recipientName == "" {
				recipientName = strings.Split(r.Email, "@")[0]
			}

			body := c.Body
			subject := c.Subject
			if c.IsABTest == 1 && r.Variant == "B" {
				if c.BodyB != "" {
					body = c.BodyB
				}
				if c.SubjectB != "" {
					subject = c.SubjectB
				}
			}

			// Replace template variables
			body = strings.ReplaceAll(body, "{{name}}", recipientName)
			body = strings.ReplaceAll(body, "{{company}}", recipientName)
			body = strings.ReplaceAll(body, "{{email}}", r.Email)
			body = strings.ReplaceAll(body, "{{city}}", r.City)
			body = strings.ReplaceAll(body, "{{category}}", r.Category)
			body = strings.ReplaceAll(body, "{{country}}", r.Country)
			body = strings.ReplaceAll(body, "{{unsubscribe_link}}", unsubURL)

			// Resolve Spintax
			body = parseSpintax(body)

			body += fmt.Sprintf(`<img src="%s" width="1" height="1" style="display:none">`, trackOpenURL)

			re := regexp.MustCompile(`href="(http[^"]*)"`)
			body = re.ReplaceAllStringFunc(body, func(match string) string {
				urlStr := strings.TrimPrefix(match, `href="`)
				urlStr = strings.TrimSuffix(urlStr, `"`)
				return `href="` + trackClickURL(urlStr) + `"`
			})

			subject = strings.ReplaceAll(subject, "{{name}}", recipientName)
			subject = strings.ReplaceAll(subject, "{{company}}", recipientName)
			subject = strings.ReplaceAll(subject, "{{email}}", r.Email)
			subject = strings.ReplaceAll(subject, "{{city}}", r.City)
			subject = strings.ReplaceAll(subject, "{{category}}", r.Category)
			subject = strings.ReplaceAll(subject, "{{country}}", r.Country)
			subject = parseSpintax(subject)

			msg := fmt.Sprintf("From: %s\r\nReply-To: %s\r\nTo: %s\r\nSubject: %s\r\nList-Unsubscribe: <%s>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
				fromHeader, replyToHeader, r.Email, subject, unsubURL, body)

			var err error
			if useTLS {
				err = sendEmail(addr, auth, envelopeSender, r.Email, msg, tlsConfig)
			} else {
				err = smtp.SendMail(addr, auth, envelopeSender, []string{r.Email}, []byte(msg))
			}
			if err != nil {
				log.Printf("Campaign %d: Failed to send to %s: %v", campaignID, r.Email, err)
				failed++
			} else {
				sent++
				h.DB.UpdateRecipientSent(r.ID)
				log.Printf("Campaign %d: Sent successfully to %s", campaignID, r.Email)
			}
			h.DB.UpdateCampaignStats(campaignID)
			BroadcastCampaignChange("email_sent", campaignID)

			// Smart Delivery throttling with configurable jitter to protect sender reputation
			minDelaySec := 1
			if val := h.DB.GetSetting("smtp_min_delay"); val != "" {
				if d, err := strconv.Atoi(val); err == nil && d > 0 {
					minDelaySec = d
				}
			}
			maxDelaySec := minDelaySec + 2
			if val := h.DB.GetSetting("smtp_max_delay"); val != "" {
				if d, err := strconv.Atoi(val); err == nil && d >= minDelaySec {
					maxDelaySec = d
				}
			}
			diff := maxDelaySec - minDelaySec
			if diff <= 0 {
				diff = 1
			}
			delayMs := minDelaySec*1000 + mathrand.Intn(diff*1000+1)
			time.Sleep(time.Duration(delayMs) * time.Millisecond)
		}
	}

	h.DB.UpdateCampaignStats(campaignID)
	if sent > 0 && failed == 0 {
		h.DB.UpdateCampaignStatus(campaignID, "sent")
	} else if sent > 0 && failed > 0 {
		h.DB.UpdateCampaignStatus(campaignID, "partial")
	} else {
		h.DB.UpdateCampaignStatus(campaignID, "failed")
	}
	BroadcastCampaignChange("campaign_completed", campaignID)
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
	BroadcastCampaignChange("campaign_deleted", id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"deleted": 1})
}

// === Subscription Handlers ===

func (h *Handler) GetSubscription(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	if userID == 0 {
		userID = 1
	}
	sub, err := h.DB.GetSubscription(userID)
	if err != nil || sub == nil {
		sub = map[string]interface{}{
			"plan":           "free",
			"status":         "active",
			"emails_limit":   100,
			"contacts_limit": 500,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sub)
}

func (h *Handler) GetPricing(w http.ResponseWriter, r *http.Request) {
	plans := []map[string]interface{}{
		{"id": "free", "name": "Free", "price": 0, "emails": 100, "contacts": 500, "features": []string{"5 sources", "Basic export", "1 user"}},
		{"id": "starter", "name": "Starter", "price": 29, "emails": 2000, "contacts": 5000, "features": []string{"All sources", "CSV export", "Email tracking", "3 users"}},
		{"id": "pro", "name": "Professional", "price": 79, "emails": 10000, "contacts": 50000, "features": []string{"Everything in Starter", "API access", "Webhooks", "Landing pages", "10 users"}},
		{"id": "agency", "name": "Agency", "price": 199, "emails": 50000, "contacts": 200000, "features": []string{"Everything in Pro", "White label", "Unlimited users", "Priority support", "Custom integrations"}},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(plans)
}

func (h *Handler) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	if userID == 0 {
		userID = 1
	}
	var req struct {
		Plan     string `json:"plan"`
		Interval string `json:"interval"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Plan == "" {
		req.Plan = "pro"
	}

	limits := map[string][2]int{
		"free":    {100, 500},
		"starter": {2000, 5000},
		"pro":     {10000, 50000},
		"agency":  {50000, 200000},
	}
	if l, ok := limits[req.Plan]; ok {
		h.DB.CreateOrUpdateSubscription(userID, req.Plan, "active", "", l[0], l[1])
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"checkout_url": "",
		"plan":         req.Plan,
		"status":       "active",
		"message":      fmt.Sprintf("Successfully upgraded to %s plan!", strings.ToUpper(req.Plan)),
	})
}

func (h *Handler) getUserID(r *http.Request) int {
	if id := r.Context().Value("user_id"); id != nil {
		return id.(int)
	}
	return 0
}

// === Team Handlers ===

func (h *Handler) GetTeams(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	if userID == 0 {
		jsonError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	teams, _ := h.DB.GetTeamsForUser(userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(teams)
}

func (h *Handler) CreateTeamHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	if userID == 0 {
		jsonError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" {
		jsonError(w, "Team name required", http.StatusBadRequest)
		return
	}
	id, err := h.DB.CreateTeam(req.Name, userID)
	if err != nil {
		jsonError(w, "Failed to create team", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "name": req.Name})
}

func (h *Handler) GetTeamMembersHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	teamID := h.DB.GetUserTeamID(userID)
	if teamID == 0 {
		jsonError(w, "No team found", http.StatusNotFound)
		return
	}
	members, _ := h.DB.GetTeamMembers(teamID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

func (h *Handler) InviteTeamMemberHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	teamID := h.DB.GetUserTeamID(userID)
	if teamID == 0 {
		jsonError(w, "No team found", http.StatusNotFound)
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Email == "" {
		jsonError(w, "Email required", http.StatusBadRequest)
		return
	}
	_, err := h.DB.InviteTeamMember(teamID, req.Email)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"invited": true})
}

func (h *Handler) RemoveTeamMemberHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	teamID := h.DB.GetUserTeamID(userID)
	if teamID == 0 {
		jsonError(w, "No team found", http.StatusNotFound)
		return
	}
	var req struct {
		UserID int `json:"user_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	h.DB.RemoveTeamMember(teamID, req.UserID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"removed": true})
}

// === Email Template Handlers ===

func (h *Handler) GetTemplates(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	templates, _ := h.DB.GetEmailTemplates(userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(templates)
}

func (h *Handler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	var req struct {
		Name     string `json:"name"`
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		Category string `json:"category"`
		IsPublic bool   `json:"is_public"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" || req.Subject == "" || req.Body == "" {
		jsonError(w, "Name, subject, and body required", http.StatusBadRequest)
		return
	}
	if req.Category == "" {
		req.Category = "general"
	}
	id, err := h.DB.CreateEmailTemplate(userID, req.Name, req.Subject, req.Body, req.Category, req.IsPublic)
	if err != nil {
		jsonError(w, "Failed to create template", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id})
}

func (h *Handler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	var req struct {
		ID       int    `json:"id"`
		Name     string `json:"name"`
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		Category string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == 0 {
		jsonError(w, "Valid ID required", http.StatusBadRequest)
		return
	}
	if req.Category == "" {
		req.Category = "general"
	}
	err := h.DB.UpdateEmailTemplate(req.ID, userID, req.Name, req.Subject, req.Body, req.Category)
	if err != nil {
		jsonError(w, "Failed to update template", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"updated": true, "id": req.ID})
}

func (h *Handler) DeleteTemplateHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	idStr := strings.TrimPrefix(r.URL.Path, "/api/templates/")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		jsonError(w, "Invalid template ID", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodDelete {
		h.DB.DeleteEmailTemplate(id, userID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"deleted": true})
		return
	}

	// GET single template by ID
	t, err := h.DB.GetEmailTemplateByID(id)
	if err != nil || t == nil {
		jsonError(w, "Template not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}

// === Landing Page Handlers ===

func (h *Handler) GetLandingPagesHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	pages, _ := h.DB.GetLandingPages(userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pages)
}

func (h *Handler) CreateLandingPageHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	var req struct {
		Title       string `json:"title"`
		Slug        string `json:"slug"`
		Subheadline string `json:"subheadline"`
		Description string `json:"description"`
		FormFields  string `json:"form_fields"`
		Theme       string `json:"theme"`
		Settings    string `json:"settings"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Title == "" || req.Slug == "" {
		jsonError(w, "Title and slug required", http.StatusBadRequest)
		return
	}
	if req.FormFields == "" {
		req.FormFields = `["email","name"]`
	}
	if req.Theme == "" {
		req.Theme = "default"
	}
	if req.Settings == "" {
		req.Settings = "{}"
	}
	id, err := h.DB.CreateLandingPage(userID, req.Title, req.Slug, req.Subheadline, req.Description, req.FormFields, req.Theme, req.Settings)
	if err != nil {
		jsonError(w, "Failed to create (slug may exist)", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "slug": req.Slug})
}

func (h *Handler) GetLandingPagePublic(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimPrefix(r.URL.Path, "/lp/")
	isSubmit := strings.HasSuffix(raw, "/submit")
	slug := strings.TrimSuffix(raw, "/submit")
	if isSubmit && r.Method == http.MethodPost {
		h.SubmitLandingPage(w, r, slug)
		return
	}
	page, err := h.DB.GetLandingPageBySlug(slug)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	h.DB.IncrementLandingPageViews(slug)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(page)
}

func (h *Handler) SubmitLandingPage(w http.ResponseWriter, r *http.Request, slug string) {
	page, err := h.DB.GetLandingPageBySlug(slug)
	if err != nil || page["published"] != 1 {
		jsonError(w, "Page not found", http.StatusNotFound)
		return
	}
	body, _ := io.ReadAll(r.Body)
	ip := r.RemoteAddr
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		ip = fwd
	}
	h.DB.AddLandingPageSubmission(page["id"].(int), string(body), ip)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func (h *Handler) GetLandingPageSubmissionsHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	idStr := strings.TrimPrefix(r.URL.Path, "/api/landing-pages/")
	if strings.HasSuffix(idStr, "/submissions") {
		idStr = strings.TrimSuffix(idStr, "/submissions")
		id, _ := strconv.Atoi(idStr)
		subs, err := h.DB.GetLandingPageSubmissions(id, userID)
		if err != nil {
			jsonError(w, "Not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(subs)
		return
	}

	id, _ := strconv.Atoi(idStr)
	if r.Method == http.MethodPost {
		var req struct {
			Status string `json:"status"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Status != "" {
			h.DB.SetLandingPageStatus(id, req.Status)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "status": req.Status})
			return
		}
	} else if r.Method == http.MethodDelete {
		h.DB.DeleteLandingPage(id, userID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"deleted": true})
		return
	}

	jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
}

// === Webhook Handlers ===

func (h *Handler) GetWebhooksHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	hooks, _ := h.DB.GetWebhooks(userID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(hooks)
}

func (h *Handler) CreateWebhookHandler(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	var req struct {
		Name   string `json:"name"`
		URL    string `json:"url"`
		Events string `json:"events"`
		Secret string `json:"secret"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Name == "" || req.URL == "" {
		jsonError(w, "Name and URL required", http.StatusBadRequest)
		return
	}
	if req.Events == "" {
		req.Events = `["campaign.sent"]`
	}
	if req.Secret == "" {
		b := make([]byte, 16)
		rand.Read(b)
		req.Secret = fmt.Sprintf("%x", b)
	}
	id, err := h.DB.CreateWebhook(userID, req.Name, req.URL, req.Events, req.Secret)
	if err != nil {
		jsonError(w, "Failed to create webhook", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "secret": req.Secret})
}

func (h *Handler) WebhookDetailRouter(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	idStr := strings.TrimPrefix(r.URL.Path, "/api/webhooks/")
	isTest := strings.HasSuffix(idStr, "/test")
	idStr = strings.TrimSuffix(idStr, "/test")
	id, _ := strconv.Atoi(idStr)

	if isTest && r.Method == http.MethodPost {
		webhook, err := h.DB.GetWebhookByID(id, userID)
		if err != nil {
			jsonError(w, "Webhook not found", http.StatusNotFound)
			return
		}
		targetURL, _ := webhook["url"].(string)
		secret, _ := webhook["secret"].(string)

		testPayload := map[string]interface{}{
			"event":     "test.ping",
			"message":   "This is a test webhook payload from ClientList!",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"test":      true,
			"data": map[string]interface{}{
				"campaign_id": 101,
				"lead_email":  "john.doe@example.com",
				"company":     "Acme Studio",
				"action":      "link_clicked",
			},
		}

		body, _ := json.Marshal(testPayload)
		req, err := http.NewRequest("POST", targetURL, bytes.NewReader(body))
		if err != nil {
			jsonError(w, "Invalid webhook URL", http.StatusBadRequest)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Webhook-Event", "test.ping")
		if secret != "" {
			req.Header.Set("X-Webhook-Secret", secret)
		}

		client := &http.Client{Timeout: 8 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":     resp.StatusCode >= 200 && resp.StatusCode < 300,
			"status_code": resp.StatusCode,
			"message":     fmt.Sprintf("Delivered! Target responded with HTTP %d", resp.StatusCode),
		})
		return
	}

	if r.Method == http.MethodDelete {
		h.DB.DeleteWebhook(id, userID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"deleted": true})
		return
	}

	jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (h *Handler) FireWebhooks(userID int, event string, payload map[string]interface{}) {
	hooks, err := h.DB.GetActiveWebhooksForEvent(userID, event)
	if err != nil {
		return
	}
	body, _ := json.Marshal(payload)
	for _, hook := range hooks {
		go func(url string, secret string, hookID int) {
			req, _ := http.NewRequest("POST", url, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Webhook-Event", event)
			if secret != "" {
				req.Header.Set("X-Webhook-Secret", secret)
			}
			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			status := 0
			if resp != nil {
				status = resp.StatusCode
			}
			if err != nil {
				status = 0
			}
			h.DB.UpdateWebhookStatus(hookID, status)
		}(hook["url"].(string), hook["secret"].(string), hook["id"].(int))
	}
}

// === Spintax Parser ===

var spintaxRegex = regexp.MustCompile(`\{([^{}]+)\}`)

func parseSpintax(text string) string {
	for spintaxRegex.MatchString(text) {
		text = spintaxRegex.ReplaceAllStringFunc(text, func(match string) string {
			inner := strings.Trim(match, "{}")
			parts := strings.Split(inner, "|")
			if len(parts) == 0 {
				return ""
			}
			return parts[mathrand.Intn(len(parts))]
		})
	}
	return text
}

// === Email Verification Handlers ===

func (h *Handler) VerifyEmails(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		BusinessIDs []int `json:"business_ids"`
		Limit       int   `json:"limit"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var businesses []models.Business
	var err error

	if len(req.BusinessIDs) > 0 {
		businesses, err = h.DB.GetBusinessesByIDs(req.BusinessIDs)
	} else {
		limit := req.Limit
		if limit <= 0 {
			limit = 50
		}
		businesses, err = h.DB.GetBusinessesWithUnverifiedEmail(limit)
	}

	if err != nil {
		jsonError(w, "Failed to fetch businesses", http.StatusInternalServerError)
		return
	}

	emails := make([]string, 0, len(businesses))
	for _, b := range businesses {
		if b.Email != "" {
			emails = append(emails, b.Email)
		}
	}

	// Run concurrent verification
	results := verifier.BatchVerify(emails, 10)

	// Update database statuses
	statusMap := make(map[int]string)
	validCount, riskyCount, invalidCount := 0, 0, 0

	for _, b := range businesses {
		if res, ok := results[b.Email]; ok {
			statusMap[b.ID] = res.Status
			switch res.Status {
			case "valid":
				validCount++
			case "risky":
				riskyCount++
			case "invalid":
				invalidCount++
			}
		}
	}

	h.DB.BatchUpdateBusinessEmailStatus(statusMap)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_verified": len(statusMap),
		"valid":          validCount,
		"risky":          riskyCount,
		"invalid":        invalidCount,
		"results":        results,
	})
}

func (h *Handler) VerifySingleEmail(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	if email == "" {
		jsonError(w, "Email parameter required", http.StatusBadRequest)
		return
	}
	result := verifier.VerifyEmail(email)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// === Unsubscribe & Compliance ===

func (h *Handler) UnsubscribeHandler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	email := r.URL.Query().Get("email")

	if token != "" {
		resolved := h.DB.GetEmailByToken(token)
		if resolved != "" {
			email = resolved
		}
	}

	if email != "" {
		h.DB.UnsubscribeEmail(email)
		log.Printf("Unsubscribed recipient: %s", email)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unsubscribed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); text-align: center; max-width: 440px; }
    h2 { color: #0f172a; margin-top: 0; }
    p { color: #64748b; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
    <h2>Unsubscribed Successfully</h2>
    <p>You have been safely removed from this contact list and will not receive further campaign messages.</p>
  </div>
</body>
</html>`)
}

// === Webhook Handlers for Stripe and Lemon Squeezy ===

func (h *Handler) StripeWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	log.Println("Received Stripe webhook payload")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"received": true}`))
}

func (h *Handler) LemonSqueezyWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	log.Println("Received Lemon Squeezy webhook payload")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"received": true}`))
}

// === Media & Image Uploads ===

func (h *Handler) UploadImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 10 MB limit
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		jsonError(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "Missing file field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
		".webp": true, ".svg": true, ".bmp": true, ".ico": true,
	}
	if !allowed[ext] {
		jsonError(w, "Invalid file format. Allowed: JPG, PNG, GIF, WEBP, SVG", http.StatusBadRequest)
		return
	}

	uploadDir := "/home/saiful/Projects/client-list/backend/uploads"
	os.MkdirAll(uploadDir, 0755)

	cleanBase := strings.TrimSuffix(header.Filename, ext)
	cleanBase = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, cleanBase)
	if len(cleanBase) > 24 {
		cleanBase = cleanBase[:24]
	}

	filename := fmt.Sprintf("%s_%d%s", cleanBase, time.Now().UnixNano()/1000000, ext)
	dstPath := filepath.Join(uploadDir, filename)

	dst, err := os.Create(dstPath)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to save file: %v", err), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		jsonError(w, fmt.Sprintf("Failed to write file: %v", err), http.StatusInternalServerError)
		return
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "192.168.10.203:18001"
	}

	relURL := "/uploads/" + filename
	fullURL := fmt.Sprintf("%s://%s%s", scheme, host, relURL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"url":       fullURL,
		"image_url": fullURL,
		"rel_url":   relURL,
		"filename":  filename,
		"size":      header.Size,
	})
}

func (h *Handler) GetMediaLibrary(w http.ResponseWriter, r *http.Request) {
	uploadDir := "/home/saiful/Projects/client-list/backend/uploads"
	os.MkdirAll(uploadDir, 0755)

	files, err := os.ReadDir(uploadDir)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to read media directory: %v", err), http.StatusInternalServerError)
		return
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "192.168.10.203:18001"
	}

	type MediaItem struct {
		Name string `json:"name"`
		URL  string `json:"url"`
		Type string `json:"type"`
		Size int64  `json:"size"`
	}

	var media []MediaItem
	for i := len(files) - 1; i >= 0; i-- {
		f := files[i]
		if f.IsDir() {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}
		relURL := "/uploads/" + f.Name()
		fullURL := fmt.Sprintf("%s://%s%s", scheme, host, relURL)
		media = append(media, MediaItem{
			Name: f.Name(),
			URL:  fullURL,
			Type: "image",
			Size: info.Size(),
		})
	}

	if media == nil {
		media = []MediaItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"media": media,
	})
}

// === Domain DNS & Deliverability Health Checker ===

func (h *Handler) CheckDNSHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Domain string `json:"domain"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	domain := strings.TrimSpace(req.Domain)
	if domain == "" {
		jsonError(w, "Domain is required", http.StatusBadRequest)
		return
	}
	if idx := strings.Index(domain, "@"); idx != -1 {
		domain = domain[idx+1:]
	}
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimRight(domain, "/")

	// 1. MX Check
	mxRecords, err := net.LookupMX(domain)
	hasMX := err == nil && len(mxRecords) > 0
	var mxList []string
	for _, mx := range mxRecords {
		mxList = append(mxList, mx.Host)
	}

	// 2. SPF Check
	txtRecords, _ := net.LookupTXT(domain)
	hasSPF := false
	spfRecord := ""
	for _, txt := range txtRecords {
		if strings.HasPrefix(strings.ToLower(txt), "v=spf1") {
			hasSPF = true
			spfRecord = txt
			break
		}
	}

	// 3. DMARC Check
	dmarcRecords, _ := net.LookupTXT("_dmarc." + domain)
	hasDMARC := false
	dmarcRecord := ""
	dmarcPolicy := "none"
	for _, txt := range dmarcRecords {
		if strings.HasPrefix(strings.ToUpper(txt), "V=DMARC1") {
			hasDMARC = true
			dmarcRecord = txt
			if strings.Contains(txt, "p=reject") {
				dmarcPolicy = "reject"
			} else if strings.Contains(txt, "p=quarantine") {
				dmarcPolicy = "quarantine"
			}
			break
		}
	}

	// 4. DKIM Check on standard selectors
	hasDKIM := false
	dkimSelector := ""
	selectors := []string{"google", "default", "k1", "s1", "mail", "mandrill", "smtp"}
	for _, sel := range selectors {
		dkimTxt, _ := net.LookupTXT(sel + "._domainkey." + domain)
		for _, txt := range dkimTxt {
			if strings.Contains(txt, "v=DKIM1") || strings.Contains(txt, "p=") {
				hasDKIM = true
				dkimSelector = sel
				break
			}
		}
		if hasDKIM {
			break
		}
	}

	score := 0
	if hasMX {
		score += 25
	}
	if hasSPF {
		score += 30
	}
	if hasDKIM {
		score += 25
	}
	if hasDMARC {
		score += 20
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"domain": domain,
		"score":  score,
		"mx": map[string]interface{}{
			"valid":   hasMX,
			"records": mxList,
		},
		"spf": map[string]interface{}{
			"valid":  hasSPF,
			"record": spfRecord,
			"advice": "Add a TXT record for @ with value: v=spf1 include:_spf.google.com ~all (or your provider's SPF)",
		},
		"dkim": map[string]interface{}{
			"valid":    hasDKIM,
			"selector": dkimSelector,
			"advice":   "Generate a 2048-bit DKIM key in your email provider and add selector._domainkey TXT record",
		},
		"dmarc": map[string]interface{}{
			"valid":  hasDMARC,
			"policy": dmarcPolicy,
			"record": dmarcRecord,
			"advice": "Add a TXT record for _dmarc with value: v=DMARC1; p=quarantine; rua=mailto:dmarc@" + domain,
		},
	})
}

// === AI Cold Email Copywriter ===

func (h *Handler) GenerateAICopyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Niche string `json:"niche"`
		Offer string `json:"offer"`
		Tone  string `json:"tone"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	niche := strings.TrimSpace(req.Niche)
	if niche == "" {
		niche = "Business Owners"
	}
	offer := strings.TrimSpace(req.Offer)
	if offer == "" {
		offer = "Free Growth & Pipeline Audit"
	}
	tone := strings.TrimSpace(req.Tone)
	if tone == "" {
		tone = "Direct & Conversational"
	}

	variants := []map[string]interface{}{
		{
			"id":        "variant_1",
			"framework": "PAS (Problem-Agitate-Solve)",
			"subject":   fmt.Sprintf("Quick question regarding {{company}}'s customer pipeline"),
			"preheader": "Noticed 3 high-impact opportunities for {{name}}...",
			"body": fmt.Sprintf(`<p>Hi {{name}},</p>
<p>I noticed {{company}} has established great local presence in {{city}}, but most %s teams we consult struggle with inconsistent inbound leads without burning budget on ads.</p>
<p>We developed a tailored system that delivers <strong>%s</strong>, generating 12+ qualified discovery calls in the first month for similar businesses.</p>
<p>Would you be open to a 3-minute video breakdown of how you can implement this at {{company}}?</p>
<p>Best regards,<br>{{name}}</p>
<p style="font-size: 11px; color: #94a3b8; margin-top: 24px;">Prefer not to hear from us? <a href="{{unsubscribe_link}}" style="color: #94a3b8;">Unsubscribe here</a>.</p>`, niche, offer),
		},
		{
			"id":        "variant_2",
			"framework": "Pattern Interrupt & Value First",
			"subject":   fmt.Sprintf("Idea for {{company}} (%s)", offer),
			"preheader": "Zero pitch — just 3 growth levers we spotted for your team",
			"body": fmt.Sprintf(`<p>Hey {{name}},</p>
<p>I know your inbox gets bombarded with generic pitches, so I'll keep this extremely direct.</p>
<p>I reviewed {{company}}'s online presence and mapped out 3 specific areas where %s businesses are losing qualified opportunities.</p>
<p>We specifically built: <strong>%s</strong> to resolve this bottleneck.</p>
<p>Are you opposed to me emailing over a quick screenshot walkthrough of what we found?</p>
<p>Cheers,<br>{{name}}</p>
<p style="font-size: 11px; color: #94a3b8; margin-top: 24px;"><a href="{{unsubscribe_link}}" style="color: #94a3b8;">Opt out</a></p>`, niche, offer),
		},
		{
			"id":        "variant_3",
			"framework": "Social Proof & Casual Invite",
			"subject":   "Case study: 2.8x ROI for {{company}}?",
			"preheader": "How a peer scaled qualified bookings without extra staff",
			"body": fmt.Sprintf(`<p>Hi {{name}},</p>
<p>Hope you're having a productive week in {{city}}!</p>
<p>Reaching out because we just helped another %s team add significant revenue using <strong>%s</strong>.</p>
<p>Given {{company}}'s position in the market, this exact playbook would align with your current quarterly growth goals.</p>
<p>Do you have 5 minutes this Thursday or Friday afternoon for a quick chat?</p>
<p>Warm regards,<br>{{name}}</p>
<p style="font-size: 11px; color: #94a3b8; margin-top: 24px;"><a href="{{unsubscribe_link}}" style="color: #94a3b8;">Unsubscribe</a></p>`, niche, offer),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"niche":    niche,
		"offer":    offer,
		"tone":     tone,
		"variants": variants,
	})
}

// === Lead Pipeline Staging ===

func (h *Handler) UpdateBusinessPipelineStageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ID    int    `json:"id"`
		Stage string `json:"stage"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.ID <= 0 || req.Stage == "" {
		jsonError(w, "ID and stage are required", http.StatusBadRequest)
		return
	}
	err := h.DB.UpdateBusinessPipelineStage(req.ID, req.Stage)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": req.ID, "stage": req.Stage, "success": true})
}

// === Campaign Sequences & Steps ===

func (h *Handler) CampaignStepsHandler(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/campaigns/")
	idStr = strings.TrimSuffix(idStr, "/steps")
	campaignID, _ := strconv.Atoi(idStr)

	if r.Method == http.MethodGet {
		steps, err := h.DB.GetCampaignSteps(campaignID)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if steps == nil {
			steps = []models.CampaignStep{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(steps)
		return
	}

	if r.Method == http.MethodPost {
		var step models.CampaignStep
		json.NewDecoder(r.Body).Decode(&step)
		step.CampaignID = campaignID
		createdStep, err := h.DB.CreateCampaignStep(step)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(createdStep)
		return
	}

	if r.Method == http.MethodDelete {
		stepIDStr := r.URL.Query().Get("step_id")
		if stepIDStr == "" {
			parts := strings.Split(strings.TrimRight(r.URL.Path, "/"), "/")
			stepIDStr = parts[len(parts)-1]
		}
		stepID, _ := strconv.Atoi(stepIDStr)
		if stepID > 0 {
			if err := h.DB.DeleteCampaignStep(stepID, campaignID); err != nil {
				jsonError(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
			return
		}
		jsonError(w, "Invalid step ID", http.StatusBadRequest)
		return
	}

	jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
}

// === Campaign A/B Stats ===

func (h *Handler) CampaignABStatsHandler(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/campaigns/")
	idStr = strings.TrimSuffix(idStr, "/ab-stats")
	campaignID, _ := strconv.Atoi(idStr)

	stats, err := h.DB.GetABTestStats(campaignID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}
