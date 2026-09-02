package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"client-list-backend/internal/api"
	"client-list-backend/internal/crawler"
	"client-list-backend/internal/database"
	"client-list-backend/internal/google"
	"client-list-backend/internal/scraper"
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

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/home/saiful/Projects/client-list/backend/data/businesses.db"
	}

	// Initialize database
	db, err := database.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize clients
	googleClient := google.NewClient(apiKey)
	scraperClient := scraper.NewClient()
	crawlerClient := crawler.New(scraperClient, googleClient)
	handler := api.NewHandler(googleClient, scraperClient, crawlerClient, db)
	authHandler := &api.AuthHandler{DB: db}

	mux := http.NewServeMux()

	// Auth endpoints
	mux.HandleFunc("/api/auth/register", authHandler.Register)
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	mux.HandleFunc("/api/auth/me", authHandler.Me)
	mux.HandleFunc("/api/user/save", authHandler.SaveBusinesses)
	mux.HandleFunc("/api/user/saved", authHandler.GetSaved)
	mux.HandleFunc("/api/user/saved/delete", authHandler.DeleteSaved)

	// Existing endpoints
	mux.HandleFunc("/api/search", handler.Search)
	mux.HandleFunc("/api/scrape", handler.Scrape)
	mux.HandleFunc("/api/export", handler.ExportCSV)
	mux.HandleFunc("/api/health", handler.HealthCheck)

	// Crawl endpoints
	mux.HandleFunc("/api/crawl", handler.StartCrawl)
	mux.HandleFunc("/api/crawl/status", handler.CrawlStatus)
	mux.HandleFunc("/api/crawl/results", handler.CrawlResults)
	mux.HandleFunc("/api/crawl/job-results", handler.CrawlJobResults)
	mux.HandleFunc("/api/crawl/search", handler.CrawlSearch)
	mux.HandleFunc("/api/crawl/jobs", handler.CrawlJobs)
	mux.HandleFunc("/api/crawl/stats", handler.CrawlStats)
	mux.HandleFunc("/api/crawl/categories", handler.CrawlCategories)
	mux.HandleFunc("/api/crawl/filters", handler.CrawlFilters)

	// Extension endpoints
	mux.HandleFunc("/api/extension/import", handler.ExtensionImport)
	mux.HandleFunc("/api/business/delete", handler.DeleteBusiness)
	mux.HandleFunc("/api/business/delete-batch", handler.DeleteBusinesses)
	mux.HandleFunc("/api/business/enrich-emails", handler.EnrichEmails)
	mux.HandleFunc("/api/business/clean-websites", handler.CleanUselessWebsites)
	mux.HandleFunc("/api/business/create", handler.CreateBusiness)
	mux.HandleFunc("/api/business/update", handler.UpdateBusiness)
	mux.HandleFunc("/api/business/verify-emails", handler.VerifyEmails)
	mux.HandleFunc("/api/business/verify-email", handler.VerifySingleEmail)
	mux.HandleFunc("/api/business/pipeline", handler.UpdateBusinessPipelineStageHandler)

	// Campaign endpoints
	mux.HandleFunc("/api/campaigns/unsubscribe", handler.UnsubscribeHandler)
	mux.HandleFunc("/api/campaigns", handler.CampaignRouter)
	mux.HandleFunc("/api/campaigns/", handler.CampaignRouter)

	// Payment Webhooks
	mux.HandleFunc("/api/webhooks/stripe", handler.StripeWebhook)
	mux.HandleFunc("/api/webhooks/lemonsqueezy", handler.LemonSqueezyWebhook)

	// Settings endpoints
	mux.HandleFunc("/api/settings", handler.SettingsRouter)
	mux.HandleFunc("/api/settings/test-smtp", handler.TestSmtp)
	mux.HandleFunc("/api/settings/check-dns", handler.CheckDNSHandler)

	// AI Copywriter endpoint
	mux.HandleFunc("/api/ai/generate-email", handler.GenerateAICopyHandler)

	// Subscription endpoints
	mux.HandleFunc("/api/subscription", handler.GetSubscription)
	mux.HandleFunc("/api/pricing", handler.GetPricing)
	mux.HandleFunc("/api/checkout", handler.CreateCheckout)

	// Team endpoints
	mux.HandleFunc("/api/teams", handler.GetTeams)
	mux.HandleFunc("/api/teams/create", handler.CreateTeamHandler)
	mux.HandleFunc("/api/teams/members", handler.GetTeamMembersHandler)
	mux.HandleFunc("/api/teams/members/invite", handler.InviteTeamMemberHandler)
	mux.HandleFunc("/api/teams/members/remove", handler.RemoveTeamMemberHandler)

	// Template endpoints
	mux.HandleFunc("/api/templates", handler.GetTemplates)
	mux.HandleFunc("/api/templates/create", handler.CreateTemplate)
	mux.HandleFunc("/api/templates/update", handler.UpdateTemplate)
	mux.HandleFunc("/api/templates/send-test", handler.TestSmtp)
	mux.HandleFunc("/api/templates/", handler.DeleteTemplateHandler)

	// Landing page endpoints
	mux.HandleFunc("/api/landing-pages", handler.GetLandingPagesHandler)
	mux.HandleFunc("/api/landing-pages/create", handler.CreateLandingPageHandler)
	mux.HandleFunc("/api/landing-pages/", handler.GetLandingPageSubmissionsHandler)
	mux.HandleFunc("/lp/", handler.GetLandingPagePublic)

	// Webhook endpoints
	mux.HandleFunc("/api/webhooks", handler.GetWebhooksHandler)
	mux.HandleFunc("/api/webhooks/create", handler.CreateWebhookHandler)
	mux.HandleFunc("/api/webhooks/", handler.WebhookDetailRouter)

	// Media & Upload endpoints
	mux.HandleFunc("/api/upload", handler.UploadImage)
	mux.HandleFunc("/api/media", handler.GetMediaLibrary)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("/home/saiful/Projects/client-list/backend/uploads"))))
	mux.Handle("/plan/", http.StripPrefix("/plan/", http.FileServer(http.Dir("/home/saiful/Projects/client-list/plan"))))

	// Background Workers
	go handler.StartCampaignScheduler()

	corsHandler := corsMiddleware(mux)

	fmt.Printf("Server starting on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, corsHandler))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
