package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"client-list-backend/internal/google"
	"client-list-backend/internal/models"
)

type Handler struct {
	GoogleClient *google.Client
}

func NewHandler(gc *google.Client) *Handler {
	return &Handler{GoogleClient: gc}
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		http.Error(w, "Query is required", http.StatusBadRequest)
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

	resp := models.SearchResponse{
		Results: businesses,
		Total:   len(businesses),
		Warning: warning,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		http.Error(w, "Query is required", http.StatusBadRequest)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
