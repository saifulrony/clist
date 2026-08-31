package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"client-list-backend/internal/api"
	"client-list-backend/internal/google"
)

func main() {
	apiKey := os.Getenv("GOOGLE_API_KEY")
	if apiKey == "" {
		log.Println("WARNING: GOOGLE_API_KEY not set. Search will not work until it is provided.")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	googleClient := google.NewClient(apiKey)
	handler := api.NewHandler(googleClient)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/search", handler.Search)
	mux.HandleFunc("/api/export", handler.ExportCSV)
	mux.HandleFunc("/api/health", handler.HealthCheck)

	corsHandler := corsMiddleware(mux)

	fmt.Printf("Server starting on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, corsHandler))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
