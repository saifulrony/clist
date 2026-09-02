package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"client-list-backend/internal/models"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	conn *sql.DB
}

func New(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *DB) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS businesses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			address TEXT,
			phone TEXT,
			website TEXT,
			email TEXT,
			facebook TEXT,
			country TEXT,
			city TEXT,
			latitude REAL,
			longitude REAL,
			rating REAL,
			total_rating INTEGER,
			place_id TEXT,
			category TEXT,
		 opening_hours TEXT,
			source TEXT,
			crawl_id TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(name, address)
		)`,
		`CREATE TABLE IF NOT EXISTS crawl_jobs (
			id TEXT PRIMARY KEY,
			query TEXT NOT NULL,
			city TEXT NOT NULL,
			country TEXT,
			source TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			total_found INTEGER DEFAULT 0,
			total_enriched INTEGER DEFAULT 0,
			error_message TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			finished_at DATETIME
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			name TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS user_saved (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			address TEXT,
			phone TEXT,
			website TEXT,
			email TEXT,
			facebook TEXT,
			country TEXT,
			latitude REAL,
			longitude REAL,
			rating REAL,
			total_rating INTEGER,
			place_id TEXT,
			category TEXT,
			opening_hours TEXT,
			source TEXT,
			tags TEXT,
			notes TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(name)`,
		`CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city)`,
		`CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category)`,
		`CREATE INDEX IF NOT EXISTS idx_businesses_source ON businesses(source)`,
		`CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status)`,
		`CREATE TABLE IF NOT EXISTS campaigns (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			subject TEXT NOT NULL,
			body TEXT NOT NULL,
			sender_email TEXT NOT NULL,
			status TEXT DEFAULT 'draft',
			sent_count INTEGER DEFAULT 0,
			opened_count INTEGER DEFAULT 0,
			clicked_count INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS campaign_recipients (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			campaign_id INTEGER NOT NULL,
			business_id INTEGER,
			email TEXT NOT NULL,
			sent_at DATETIME,
			opened_at DATETIME,
			clicked_at DATETIME,
			open_token TEXT,
			click_token TEXT,
			FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id)`,
		`CREATE INDEX IF NOT EXISTS idx_campaign_recipients_token ON campaign_recipients(open_token, click_token)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS subscriptions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			plan TEXT NOT NULL DEFAULT 'free',
			stripe_customer_id TEXT,
			stripe_subscription_id TEXT,
			status TEXT DEFAULT 'active',
			emails_limit INTEGER DEFAULT 100,
			emails_sent INTEGER DEFAULT 0,
			contacts_limit INTEGER DEFAULT 500,
			period_start DATETIME DEFAULT CURRENT_TIMESTAMP,
			period_end DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS teams (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			owner_id INTEGER NOT NULL,
			plan TEXT DEFAULT 'free',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (owner_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS team_members (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			team_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT DEFAULT 'member',
			invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			accepted_at DATETIME,
			FOREIGN KEY (team_id) REFERENCES teams(id),
			FOREIGN KEY (user_id) REFERENCES users(id),
			UNIQUE(team_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS email_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			name TEXT NOT NULL,
			subject TEXT NOT NULL,
			body TEXT NOT NULL,
			category TEXT DEFAULT 'general',
			is_public INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS landing_pages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			subheadline TEXT,
			description TEXT,
			form_fields TEXT DEFAULT '["email","name"]',
			theme TEXT DEFAULT 'default',
			settings TEXT DEFAULT '{}',
			published INTEGER DEFAULT 0,
			views INTEGER DEFAULT 0,
			submissions INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS landing_page_submissions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			page_id INTEGER NOT NULL,
			data TEXT NOT NULL,
			ip_address TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (page_id) REFERENCES landing_pages(id)
		)`,
		`CREATE TABLE IF NOT EXISTS webhooks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			url TEXT NOT NULL,
			events TEXT NOT NULL DEFAULT '["campaign.sent"]',
			secret TEXT,
			active INTEGER DEFAULT 1,
			last_triggered DATETIME,
			last_status INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)`,
		`CREATE INDEX IF NOT EXISTS idx_email_templates_user ON email_templates(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_landing_pages_user ON landing_pages(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug)`,
		`CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id)`,
	}

	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}

	// Auto-migrations for lead generation and compliance enhancements
	db.conn.Exec("ALTER TABLE businesses ADD COLUMN email_status TEXT DEFAULT 'unverified'")
	db.conn.Exec("ALTER TABLE businesses ADD COLUMN decision_maker TEXT DEFAULT ''")
	db.conn.Exec("ALTER TABLE businesses ADD COLUMN linkedin TEXT DEFAULT ''")
	db.conn.Exec("ALTER TABLE campaign_recipients ADD COLUMN unsubscribed INTEGER DEFAULT 0")
	db.conn.Exec("ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME")
	db.conn.Exec("ALTER TABLE campaigns ADD COLUMN subject_b TEXT DEFAULT ''")
	db.conn.Exec("ALTER TABLE campaigns ADD COLUMN body_b TEXT DEFAULT ''")
	db.conn.Exec("ALTER TABLE campaigns ADD COLUMN is_ab_test INTEGER DEFAULT 0")
	db.conn.Exec("ALTER TABLE campaign_recipients ADD COLUMN variant TEXT DEFAULT 'A'")
	db.conn.Exec("ALTER TABLE campaign_recipients ADD COLUMN current_step INTEGER DEFAULT 1")
	db.conn.Exec("ALTER TABLE campaign_recipients ADD COLUMN last_step_sent_at DATETIME")
	db.conn.Exec("ALTER TABLE businesses ADD COLUMN pipeline_stage TEXT DEFAULT 'lead'")
	db.conn.Exec(`CREATE TABLE IF NOT EXISTS campaign_steps (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		campaign_id INTEGER NOT NULL,
		step_number INTEGER NOT NULL,
		wait_days INTEGER NOT NULL DEFAULT 3,
		subject TEXT NOT NULL,
		body TEXT NOT NULL,
		condition TEXT DEFAULT 'no_reply',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
	)`)
	db.conn.Exec("CREATE TABLE IF NOT EXISTS unsubscribed_emails (email TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
	db.conn.Exec("INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (1, 'admin@clientlist.local', 'default', 'Administrator')")

	log.Println("Database migration complete")
	return nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) UpsertBusiness(biz models.Business, source, crawlID string) error {
	if biz.EmailStatus == "" {
		biz.EmailStatus = "unverified"
	}
	_, err := db.conn.Exec(`
		INSERT INTO businesses (name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, crawl_id, email_status, decision_maker, linkedin)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name, address) DO UPDATE SET
			phone = COALESCE(NULLIF(excluded.phone, ''), businesses.phone),
			website = COALESCE(NULLIF(excluded.website, ''), businesses.website),
			email = COALESCE(NULLIF(excluded.email, ''), businesses.email),
			facebook = COALESCE(NULLIF(excluded.facebook, ''), businesses.facebook),
			rating = CASE WHEN excluded.rating > 0 THEN excluded.rating ELSE businesses.rating END,
			total_rating = CASE WHEN excluded.total_rating > 0 THEN excluded.total_rating ELSE businesses.total_rating END,
			category = COALESCE(NULLIF(excluded.category, ''), businesses.category),
			opening_hours = COALESCE(NULLIF(excluded.opening_hours, ''), businesses.opening_hours),
			email_status = COALESCE(NULLIF(excluded.email_status, ''), businesses.email_status),
			decision_maker = COALESCE(NULLIF(excluded.decision_maker, ''), businesses.decision_maker),
			linkedin = COALESCE(NULLIF(excluded.linkedin, ''), businesses.linkedin)
	`,
		biz.Name, biz.Address, biz.Phone, biz.Website, biz.Email, biz.Facebook,
		biz.Country, extractCity(biz.Address), biz.Latitude, biz.Longitude,
		biz.Rating, biz.TotalRating, biz.PlaceID, biz.Category, biz.Hours,
		source, crawlID, biz.EmailStatus, biz.DecisionMaker, biz.LinkedIn,
	)
	return err
}

func (db *DB) UpsertBusinesses(businesses []models.Business, source, crawlID string) (int, error) {
	count := 0
	for _, biz := range businesses {
		// Filter useless directory/listing websites
		if isUselessWebsite(biz.Website) {
			biz.Website = ""
		}
		if err := db.UpsertBusiness(biz, source, crawlID); err != nil {
			log.Printf("Failed to upsert %s: %v", biz.Name, err)
			continue
		}
		count++
	}
	return count, nil
}

func (db *DB) UpdateBusinessEmail(id int, email string) error {
	_, err := db.conn.Exec("UPDATE businesses SET email = ? WHERE id = ?", email, id)
	return err
}

func (db *DB) UpdateBusinessWebsite(id int, website string) error {
	_, err := db.conn.Exec("UPDATE businesses SET website = ? WHERE id = ?", website, id)
	return err
}

func (db *DB) CreateBusiness(biz models.Business) (int64, error) {
	if biz.EmailStatus == "" {
		biz.EmailStatus = "unverified"
	}
	if biz.PipelineStage == "" {
		biz.PipelineStage = "lead"
	}
	if biz.Source == "" {
		biz.Source = "manual"
	}
	city := biz.City
	if city == "" {
		city = extractCity(biz.Address)
	}

	res, err := db.conn.Exec(`
		INSERT INTO businesses (name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, email_status, decision_maker, linkedin, pipeline_stage)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		biz.Name, biz.Address, biz.Phone, biz.Website, biz.Email, biz.Facebook,
		biz.Country, city, biz.Latitude, biz.Longitude,
		biz.Rating, biz.TotalRating, biz.PlaceID, biz.Category, biz.Hours,
		biz.Source, biz.EmailStatus, biz.DecisionMaker, biz.LinkedIn, biz.PipelineStage,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) UpdateBusiness(id int, business models.Business) error {
	_, err := db.conn.Exec(
		"UPDATE businesses SET name=?, address=?, phone=?, website=?, email=?, facebook=?, country=?, city=?, latitude=?, longitude=?, rating=?, total_rating=?, place_id=?, category=?, opening_hours=?, source=? WHERE id = ?",
		business.Name, business.Address, business.Phone, business.Website, business.Email, business.Facebook,
		business.Country, business.City, business.Latitude, business.Longitude, business.Rating, business.TotalRating,
		business.PlaceID, business.Category, business.Hours, business.Source, id,
	)
	return err
}

func (db *DB) GetBusinessByID(id int) (models.Business, error) {
	var b models.Business
	err := db.conn.QueryRow(`SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source FROM businesses WHERE id = ?`, id).Scan(
		&b.ID, &b.Name, &b.Address, &b.Phone, &b.Website, &b.Email, &b.Facebook,
		&b.Country, &b.City, &b.Latitude, &b.Longitude, &b.Rating, &b.TotalRating,
		&b.PlaceID, &b.Category, &b.Hours, &b.Source,
	)
	return b, err
}

func (db *DB) GetBusinessesByIDs(ids []int) ([]models.Business, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := fmt.Sprintf(`
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source
		FROM businesses WHERE id IN (%s)
		ORDER BY created_at DESC
	`, strings.Join(placeholders, ","))

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var businesses []models.Business
	for rows.Next() {
		var b models.Business
		var city string
		err := rows.Scan(&b.ID, &b.Name, &b.Address, &b.Phone, &b.Website, &b.Email, &b.Facebook,
			&b.Country, &city, &b.Latitude, &b.Longitude, &b.Rating, &b.TotalRating,
			&b.PlaceID, &b.Category, &b.Hours, &b.Source)
		if err != nil {
			continue
		}
		businesses = append(businesses, b)
	}
	return businesses, nil
}

func (db *DB) SearchBusinesses(query, city, category, source string, limit, offset int) ([]models.Business, int, error) {
	return db.SearchBusinessesFiltered(query, city, category, source, "", "", "", "", "", limit, offset)
}

func (db *DB) SearchBusinessesFiltered(query, city, category, source, country, hasEmail, hasPhone, hasWebsite, pipelineStage string, limit, offset int) ([]models.Business, int, error) {
	where := "WHERE 1=1"
	args := []interface{}{}

	if query != "" {
		where += " AND (name LIKE ? OR address LIKE ? OR category LIKE ?)"
		q := "%" + query + "%"
		args = append(args, q, q, q)
	}
	if city != "" {
		where += " AND city LIKE ?"
		args = append(args, "%"+city+"%")
	}
	if category != "" {
		where += " AND category LIKE ?"
		args = append(args, "%"+category+"%")
	}
	if source != "" {
		where += " AND source = ?"
		args = append(args, source)
	}
	if country != "" {
		where += " AND country LIKE ?"
		args = append(args, "%"+country+"%")
	}
	if hasEmail == "1" {
		where += " AND email IS NOT NULL AND email != ''"
	} else if hasEmail == "0" {
		where += " AND (email IS NULL OR email = '')"
	}
	if hasPhone == "1" {
		where += " AND phone IS NOT NULL AND phone != ''"
	} else if hasPhone == "0" {
		where += " AND (phone IS NULL OR phone = '')"
	}
	if hasWebsite == "1" {
		where += " AND website IS NOT NULL AND website != ''"
	} else if hasWebsite == "0" {
		where += " AND (website IS NULL OR website = '')"
	}
	if pipelineStage != "" {
		if pipelineStage == "none" {
			where += " AND (pipeline_stage IS NULL OR pipeline_stage = '' OR pipeline_stage = 'lead')"
		} else {
			where += " AND pipeline_stage = ?"
			args = append(args, pipelineStage)
		}
	}

	var total int
	countArgs := make([]interface{}, len(args))
	copy(countArgs, args)
	err := db.conn.QueryRow("SELECT COUNT(*) FROM businesses "+where, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	rows, err := db.conn.Query(`
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, created_at,
		COALESCE(email_status, 'unverified'), COALESCE(decision_maker, ''), COALESCE(linkedin, ''), COALESCE(pipeline_stage, 'lead')
		FROM businesses `+where+`
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var businesses []models.Business
	for rows.Next() {
		var b models.Business
		err := rows.Scan(&b.ID, &b.Name, &b.Address, &b.Phone, &b.Website, &b.Email, &b.Facebook,
			&b.Country, &b.City, &b.Latitude, &b.Longitude, &b.Rating, &b.TotalRating,
			&b.PlaceID, &b.Category, &b.Hours, &b.Source, &b.CreatedAt,
			&b.EmailStatus, &b.DecisionMaker, &b.LinkedIn, &b.PipelineStage)
		if err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		businesses = append(businesses, b)
	}

	return businesses, total, nil
}

func (db *DB) GetAllBusinesses(limit, offset int) ([]models.Business, int, error) {
	var total int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM businesses").Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := db.conn.Query(`
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source
		FROM businesses
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var businesses []models.Business
	for rows.Next() {
		var b models.Business
		var city string
		err := rows.Scan(&b.ID, &b.Name, &b.Address, &b.Phone, &b.Website, &b.Email, &b.Facebook,
			&b.Country, &city, &b.Latitude, &b.Longitude, &b.Rating, &b.TotalRating,
			&b.PlaceID, &b.Category, &b.Hours, &b.Source)
		if err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		businesses = append(businesses, b)
	}

	return businesses, total, nil
}

func (db *DB) GetCategories() ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT COALESCE(NULLIF(category, ''), 'uncategorized') as cat, COUNT(*) as cnt
		FROM businesses
		GROUP BY cat
		ORDER BY cnt DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var cat string
		var cnt int
		rows.Scan(&cat, &cnt)
		results = append(results, map[string]interface{}{
			"category": cat,
			"count":    cnt,
		})
	}
	return results, nil
}

func (db *DB) GetDistinctValues(column string) ([]string, error) {
	validCols := map[string]bool{"country": true, "city": true, "source": true}
	if !validCols[column] {
		return nil, fmt.Errorf("invalid column: %s", column)
	}
	rows, err := db.conn.Query(fmt.Sprintf(`
		SELECT DISTINCT COALESCE(NULLIF(%s, ''), '') as val
		FROM businesses
		WHERE %s IS NOT NULL AND %s != ''
		ORDER BY val
	`, column, column, column))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var values []string
	for rows.Next() {
		var val string
		if err := rows.Scan(&val); err == nil && val != "" {
			values = append(values, val)
		}
	}
	return values, nil
}

func (db *DB) GetStats() (map[string]interface{}, error) {
	stats := map[string]interface{}{}

	var total int
	db.conn.QueryRow("SELECT COUNT(*) FROM businesses").Scan(&total)
	stats["total_businesses"] = total

	var cities int
	db.conn.QueryRow("SELECT COUNT(DISTINCT city) FROM businesses WHERE city != ''").Scan(&cities)
	stats["total_cities"] = cities

	var sources int
	db.conn.QueryRow("SELECT COUNT(DISTINCT source) FROM businesses").Scan(&sources)
	stats["total_sources"] = sources

	rows, err := db.conn.Query("SELECT source, COUNT(*) as cnt FROM businesses GROUP BY source ORDER BY cnt DESC")
	if err == nil {
		defer rows.Close()
		sourceMap := map[string]int{}
		for rows.Next() {
			var s string
			var c int
			rows.Scan(&s, &c)
			sourceMap[s] = c
		}
		stats["by_source"] = sourceMap
	}

	return stats, nil
}

func (db *DB) CreateCrawlJob(id, query, city, country, source string) error {
	_, err := db.conn.Exec(`
		INSERT INTO crawl_jobs (id, query, city, country, source, status)
		VALUES (?, ?, ?, ?, ?, 'running')
	`, id, query, city, country, source)
	return err
}

func (db *DB) UpdateCrawlJob(id string, status string, totalFound, totalEnriched int, errMsg string) error {
	finished := ""
	if status == "done" || status == "error" {
		finished = time.Now().Format(time.RFC3339)
	}
	_, err := db.conn.Exec(`
		UPDATE crawl_jobs SET status=?, total_found=?, total_enriched=?, error_message=?, finished_at=COALESCE(NULLIF(?, ''), finished_at)
		WHERE id=?
	`, status, totalFound, totalEnriched, errMsg, finished, id)
	return err
}

func (db *DB) GetCrawlJob(id string) (map[string]interface{}, error) {
	var query, city, country, source, status, errMsg string
	var totalFound, totalEnriched int
	var createdAt, finishedAt sql.NullString

	err := db.conn.QueryRow(`
		SELECT query, city, country, source, status, total_found, total_enriched, error_message, created_at, finished_at
		FROM crawl_jobs WHERE id=?
	`, id).Scan(&query, &city, &country, &source, &status, &totalFound, &totalEnriched, &errMsg, &createdAt, &finishedAt)
	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"id":              id,
		"query":           query,
		"city":            city,
		"country":         country,
		"source":          source,
		"status":          status,
		"total_found":     totalFound,
		"total_enriched":  totalEnriched,
		"error_message":   errMsg,
		"created_at":      createdAt.String,
		"finished_at":     finishedAt.String,
	}
	return result, nil
}

func (db *DB) GetRecentCrawlJobs(limit int) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT id, query, city, country, source, status, total_found, total_enriched, created_at, finished_at
		FROM crawl_jobs ORDER BY created_at DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []map[string]interface{}
	for rows.Next() {
		var id, query, city, country, source, status string
		var totalFound, totalEnriched int
		var createdAt, finishedAt sql.NullString
		rows.Scan(&id, &query, &city, &country, &source, &status, &totalFound, &totalEnriched, &createdAt, &finishedAt)
		jobs = append(jobs, map[string]interface{}{
			"id": id, "query": query, "city": city, "country": country,
			"source": source, "status": status, "total_found": totalFound,
			"total_enriched": totalEnriched, "created_at": createdAt.String, "finished_at": finishedAt.String,
		})
	}
	return jobs, nil
}

func extractCity(address string) string {
	if address == "" {
		return ""
	}
	parts := make([]string, 0)
	for _, p := range splitAddress(address) {
		parts = append(parts, p)
	}
	if len(parts) >= 2 {
		return parts[len(parts)-2]
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return ""
}

func splitAddress(address string) []string {
	result := []string{}
	current := ""
	for _, ch := range address {
		if ch == ',' {
			if current != "" {
				result = append(result, current)
			}
			current = ""
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func (db *DB) CreateUser(email, passwordHash, name string) (int, error) {
	result, err := db.conn.Exec(
		"INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
		email, passwordHash, name,
	)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) GetUserByEmail(email string) (int, string, string, error) {
	var id int
	var passwordHash, name string
	err := db.conn.QueryRow("SELECT id, password_hash, name FROM users WHERE email = ?", email).Scan(&id, &passwordHash, &name)
	if err != nil {
		return 0, "", "", err
	}
	return id, passwordHash, name, nil
}

func (db *DB) GetUserByID(id int) (string, string, error) {
	var email, name string
	err := db.conn.QueryRow("SELECT email, name FROM users WHERE id = ?", id).Scan(&email, &name)
	if err != nil {
		return "", "", err
	}
	return email, name, nil
}

type SavedBusiness struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Address     string  `json:"address"`
	Phone       string  `json:"phone"`
	Website     string  `json:"website"`
	Email       string  `json:"email"`
	Facebook    string  `json:"facebook"`
	Country     string  `json:"country"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Rating      float64 `json:"rating"`
	TotalRating int     `json:"total_rating"`
	PlaceID     string  `json:"place_id"`
	Category    string  `json:"category"`
	Hours       string  `json:"opening_hours"`
	Source      string  `json:"source"`
	Tags        string  `json:"tags"`
	Notes       string  `json:"notes"`
	CreatedAt   string  `json:"created_at"`
}

func (db *DB) SaveBusiness(userID int, b models.Business, tags, notes string) (int, error) {
	result, err := db.conn.Exec(`
		INSERT INTO user_saved (user_id, name, address, phone, website, email, facebook, country, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, tags, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, b.Name, b.Address, b.Phone, b.Website, b.Email, b.Facebook, b.Country,
		b.Latitude, b.Longitude, b.Rating, b.TotalRating, b.PlaceID, b.Category, b.Hours, b.Source, tags, notes)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) SaveBusinesses(userID int, businesses []models.Business, tags, notes string) (int, error) {
	tx, err := db.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO user_saved (user_id, name, address, phone, website, email, facebook, country, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, tags, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()

	count := 0
	for _, b := range businesses {
		_, err := stmt.Exec(userID, b.Name, b.Address, b.Phone, b.Website, b.Email, b.Facebook, b.Country,
			b.Latitude, b.Longitude, b.Rating, b.TotalRating, b.PlaceID, b.Category, b.Hours, b.Source, tags, notes)
		if err != nil {
			continue
		}
		count++
	}

	return count, tx.Commit()
}

func (db *DB) GetUserSaved(userID int, limit, offset int) ([]SavedBusiness, int, error) {
	var total int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM user_saved WHERE user_id = ?", userID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := db.conn.Query(`
		SELECT id, name, address, phone, website, email, facebook, country, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, tags, notes, created_at
		FROM user_saved WHERE user_id = ?
		ORDER BY created_at DESC LIMIT ? OFFSET ?
	`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []SavedBusiness
	for rows.Next() {
		var s SavedBusiness
		err := rows.Scan(&s.ID, &s.Name, &s.Address, &s.Phone, &s.Website, &s.Email, &s.Facebook, &s.Country,
			&s.Latitude, &s.Longitude, &s.Rating, &s.TotalRating, &s.PlaceID, &s.Category, &s.Hours, &s.Source, &s.Tags, &s.Notes, &s.CreatedAt)
		if err != nil {
			continue
		}
		results = append(results, s)
	}

	return results, total, nil
}

func (db *DB) DeleteUserSaved(userID, savedID int) error {
	result, err := db.conn.Exec("DELETE FROM user_saved WHERE id = ? AND user_id = ?", savedID, userID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return errors.New("not found")
	}
	return nil
}

func (db *DB) DeleteBusiness(id int) error {
	_, err := db.conn.Exec("DELETE FROM businesses WHERE id = ?", id)
	return err
}

func (db *DB) DeleteBusinesses(ids []int) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := "DELETE FROM businesses WHERE id IN (" + strings.Join(placeholders, ",") + ")"
	result, err := db.conn.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

func (db *DB) DeleteBusinessesBySource(source string) (int, error) {
	result, err := db.conn.Exec("DELETE FROM businesses WHERE source = ?", source)
	if err != nil {
		return 0, err
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

func (db *DB) DeleteAllBusinesses() (int, error) {
	result, err := db.conn.Exec("DELETE FROM businesses")
	if err != nil {
		return 0, err
	}
	affected, _ := result.RowsAffected()
	return int(affected), nil
}

func (db *DB) GetBusinessesByCrawlID(crawlID string, limit, offset int) ([]models.Business, int, error) {
	var total int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM businesses WHERE crawl_id = ?", crawlID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := db.conn.Query(`
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source,
		       COALESCE(email_status, 'unverified'), COALESCE(decision_maker, ''), COALESCE(linkedin, ''), COALESCE(pipeline_stage, 'lead')
		FROM businesses WHERE crawl_id = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, crawlID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var businesses []models.Business
	for rows.Next() {
		var b models.Business
		var city string
		err := rows.Scan(&b.ID, &b.Name, &b.Address, &b.Phone, &b.Website, &b.Email, &b.Facebook,
			&b.Country, &city, &b.Latitude, &b.Longitude, &b.Rating, &b.TotalRating,
			&b.PlaceID, &b.Category, &b.Hours, &b.Source,
			&b.EmailStatus, &b.DecisionMaker, &b.LinkedIn, &b.PipelineStage)
		if err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
		b.City = city
		businesses = append(businesses, b)
	}

	return businesses, total, nil
}

// isUselessWebsite checks if a website URL is a directory/listing site
// rather than the actual business website
func isUselessWebsite(websiteURL string) bool {
	if websiteURL == "" {
		return false
	}
	lower := strings.ToLower(websiteURL)

	uselessPatterns := []string{
		"localsearch.com",
		"yellowpages.com",
		"yelp.com",
		"superpages.com",
		"manta.com",
		"citysearch.com",
		"chamberofcommerce.com",
		"bbb.org",
		"mapquest.com",
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
		"brownbook.net",
		"europages.co.uk",
		"kompass.com",
		"local.com",
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
		"bark.com",
		"homeblue.com",
		"houselogic.com",
		"modernize.com",
		"zillow.com",
		"realtor.com",
		"redfin.com",
		"trulia.com",
	}
	for _, p := range uselessPatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

func (db *DB) CreateCampaign(c models.Campaign) (int, error) {
	status := c.Status
	if status == "" {
		if c.ScheduledAt != "" {
			status = "scheduled"
		} else {
			status = "draft"
		}
	}
	result, err := db.conn.Exec(`
		INSERT INTO campaigns (name, subject, body, sender_email, status, scheduled_at, subject_b, body_b, is_ab_test)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.Name, c.Subject, c.Body, c.SenderEmail, status, c.ScheduledAt, c.SubjectB, c.BodyB, c.IsABTest)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) GetCampaigns() ([]models.Campaign, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, subject, body, sender_email, status, sent_count, opened_count, clicked_count, created_at, COALESCE(scheduled_at, ''),
		       COALESCE(subject_b, ''), COALESCE(body_b, ''), COALESCE(is_ab_test, 0)
		FROM campaigns ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var campaigns []models.Campaign
	for rows.Next() {
		var c models.Campaign
		err := rows.Scan(&c.ID, &c.Name, &c.Subject, &c.Body, &c.SenderEmail, &c.Status, &c.SentCount, &c.OpenedCount, &c.ClickedCount, &c.CreatedAt, &c.ScheduledAt,
			&c.SubjectB, &c.BodyB, &c.IsABTest)
		if err != nil {
			continue
		}
		campaigns = append(campaigns, c)
	}
	return campaigns, nil
}

func (db *DB) GetCampaign(id int) (models.Campaign, error) {
	var c models.Campaign
	err := db.conn.QueryRow(`
		SELECT id, name, subject, body, sender_email, status, sent_count, opened_count, clicked_count, created_at, COALESCE(scheduled_at, ''),
		       COALESCE(subject_b, ''), COALESCE(body_b, ''), COALESCE(is_ab_test, 0)
		FROM campaigns WHERE id = ?
	`, id).Scan(&c.ID, &c.Name, &c.Subject, &c.Body, &c.SenderEmail, &c.Status, &c.SentCount, &c.OpenedCount, &c.ClickedCount, &c.CreatedAt, &c.ScheduledAt,
		&c.SubjectB, &c.BodyB, &c.IsABTest)
	return c, err
}

func (db *DB) GetDueScheduledCampaigns() ([]models.Campaign, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, subject, body, sender_email, status, sent_count, opened_count, clicked_count, created_at, COALESCE(scheduled_at, ''),
		       COALESCE(subject_b, ''), COALESCE(body_b, ''), COALESCE(is_ab_test, 0)
		FROM campaigns 
		WHERE status = 'scheduled' AND scheduled_at != '' 
		  AND (scheduled_at <= datetime('now', 'localtime') OR scheduled_at <= CURRENT_TIMESTAMP)
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var campaigns []models.Campaign
	for rows.Next() {
		var c models.Campaign
		err := rows.Scan(&c.ID, &c.Name, &c.Subject, &c.Body, &c.SenderEmail, &c.Status, &c.SentCount, &c.OpenedCount, &c.ClickedCount, &c.CreatedAt, &c.ScheduledAt,
			&c.SubjectB, &c.BodyB, &c.IsABTest)
		if err == nil {
			campaigns = append(campaigns, c)
		}
	}
	return campaigns, nil
}

func (db *DB) UpdateBusinessPipelineStage(id int, stage string) error {
	_, err := db.conn.Exec("UPDATE businesses SET pipeline_stage = ? WHERE id = ?", stage, id)
	return err
}

func (db *DB) CreateCampaignStep(step models.CampaignStep) (models.CampaignStep, error) {
	if step.WaitDays <= 0 && step.DelayDays > 0 {
		step.WaitDays = step.DelayDays
	}
	if step.WaitDays <= 0 {
		step.WaitDays = 3
	}
	step.DelayDays = step.WaitDays
	if step.Condition == "" {
		step.Condition = "no_reply"
	}
	if step.StepNumber <= 0 {
		var count int
		db.conn.QueryRow("SELECT COUNT(*) FROM campaign_steps WHERE campaign_id = ?", step.CampaignID).Scan(&count)
		step.StepNumber = count + 1
	}

	res, err := db.conn.Exec(`
		INSERT INTO campaign_steps (campaign_id, step_number, wait_days, subject, body, condition)
		VALUES (?, ?, ?, ?, ?, ?)
	`, step.CampaignID, step.StepNumber, step.WaitDays, step.Subject, step.Body, step.Condition)
	if err != nil {
		return step, err
	}
	id, _ := res.LastInsertId()
	step.ID = int(id)
	return step, nil
}

func (db *DB) DeleteCampaignStep(stepID, campaignID int) error {
	_, err := db.conn.Exec("DELETE FROM campaign_steps WHERE id = ? AND campaign_id = ?", stepID, campaignID)
	return err
}

func (db *DB) GetCampaignSteps(campaignID int) ([]models.CampaignStep, error) {
	rows, err := db.conn.Query(`
		SELECT id, campaign_id, step_number, wait_days, subject, body, condition, created_at
		FROM campaign_steps WHERE campaign_id = ? ORDER BY step_number ASC
	`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []models.CampaignStep
	for rows.Next() {
		var s models.CampaignStep
		if err := rows.Scan(&s.ID, &s.CampaignID, &s.StepNumber, &s.WaitDays, &s.Subject, &s.Body, &s.Condition, &s.CreatedAt); err == nil {
			s.DelayDays = s.WaitDays
			steps = append(steps, s)
		}
	}
	return steps, nil
}

func (db *DB) GetABTestStats(campaignID int) (map[string]interface{}, error) {
	var sentA, openedA, clickedA, sentB, openedB, clickedB int
	db.conn.QueryRow(`
		SELECT 
			COALESCE(COUNT(CASE WHEN variant = 'A' AND sent_at IS NOT NULL THEN 1 END), 0),
			COALESCE(COUNT(CASE WHEN variant = 'A' AND (opened_at IS NOT NULL OR clicked_at IS NOT NULL) THEN 1 END), 0),
			COALESCE(COUNT(CASE WHEN variant = 'A' AND clicked_at IS NOT NULL THEN 1 END), 0),
			COALESCE(COUNT(CASE WHEN variant = 'B' AND sent_at IS NOT NULL THEN 1 END), 0),
			COALESCE(COUNT(CASE WHEN variant = 'B' AND (opened_at IS NOT NULL OR clicked_at IS NOT NULL) THEN 1 END), 0),
			COALESCE(COUNT(CASE WHEN variant = 'B' AND clicked_at IS NOT NULL THEN 1 END), 0)
		FROM campaign_recipients WHERE campaign_id = ?
	`, campaignID).Scan(&sentA, &openedA, &clickedA, &sentB, &openedB, &clickedB)

	openRateA := 0.0
	if sentA > 0 {
		openRateA = float64(openedA) / float64(sentA) * 100
	}
	openRateB := 0.0
	if sentB > 0 {
		openRateB = float64(openedB) / float64(sentB) * 100
	}

	winner := "Tie / Ongoing"
	if sentA > 0 || sentB > 0 {
		if openRateA > openRateB {
			winner = "Variant A is leading"
		} else if openRateB > openRateA {
			winner = "Variant B is leading"
		}
	}

	return map[string]interface{}{
		"variant_a": map[string]interface{}{
			"sent": sentA, "opened": openedA, "clicked": clickedA, "open_rate": openRateA,
		},
		"variant_b": map[string]interface{}{
			"sent": sentB, "opened": openedB, "clicked": clickedB, "open_rate": openRateB,
		},
		"winner": winner,
	}, nil
}

func (db *DB) UpdateCampaignStatus(id int, status string) error {
	_, err := db.conn.Exec("UPDATE campaigns SET status = ? WHERE id = ?", status, id)
	return err
}

func (db *DB) UpdateCampaignStats(id int) error {
	_, err := db.conn.Exec(`
		UPDATE campaigns SET
			sent_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND sent_at IS NOT NULL),
			opened_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND (opened_at IS NOT NULL OR clicked_at IS NOT NULL)),
			clicked_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND clicked_at IS NOT NULL)
		WHERE id = ?
	`, id, id, id, id)
	return err
}

func (db *DB) UpdateRecipientSent(id int) error {
	_, err := db.conn.Exec("UPDATE campaign_recipients SET sent_at = CURRENT_TIMESTAMP, last_step_sent_at = CURRENT_TIMESTAMP, current_step = 1 WHERE id = ?", id)
	return err
}

func (db *DB) UpdateRecipientStepSent(id int, stepNumber int) error {
	_, err := db.conn.Exec("UPDATE campaign_recipients SET last_step_sent_at = CURRENT_TIMESTAMP, current_step = ? WHERE id = ?", stepNumber, id)
	return err
}

func (db *DB) GetRolling24HourSentCount() (int, error) {
	var count int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM campaign_recipients WHERE sent_at >= datetime('now', '-24 hours')").Scan(&count)
	return count, err
}

type DueFollowUpRecipient struct {
	RecipientID   int
	CampaignID    int
	BusinessID    int
	Email         string
	OpenToken     string
	ClickToken    string
	CurrentStep   int
	StepID        int
	StepNumber    int
	WaitDays      int
	Subject       string
	Body          string
	Condition     string
	CampaignName  string
	SenderEmail   string
	BizName       string
	BizCategory   string
	BizCity       string
	BizCountry    string
}

func (db *DB) GetDueFollowUpRecipients() ([]DueFollowUpRecipient, error) {
	rows, err := db.conn.Query(`
		SELECT r.id, r.campaign_id, r.business_id, r.email, r.open_token, r.click_token, r.current_step,
		       s.id, s.step_number, s.wait_days, s.subject, s.body, s.condition,
		       c.name, c.sender_email,
		       COALESCE(b.name, ''), COALESCE(b.category, ''), COALESCE(b.city, ''), COALESCE(b.country, '')
		FROM campaign_recipients r
		JOIN campaigns c ON c.id = r.campaign_id
		JOIN campaign_steps s ON s.campaign_id = r.campaign_id AND s.step_number = (r.current_step + 1)
		LEFT JOIN businesses b ON b.id = r.business_id
		WHERE r.sent_at IS NOT NULL
		  AND r.last_step_sent_at IS NOT NULL
		  AND datetime(r.last_step_sent_at, '+' || s.wait_days || ' days') <= datetime('now')
		  AND (s.condition != 'no_click' OR r.clicked_at IS NULL)
		LIMIT 100
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []DueFollowUpRecipient
	for rows.Next() {
		var item DueFollowUpRecipient
		if err := rows.Scan(
			&item.RecipientID, &item.CampaignID, &item.BusinessID, &item.Email, &item.OpenToken, &item.ClickToken, &item.CurrentStep,
			&item.StepID, &item.StepNumber, &item.WaitDays, &item.Subject, &item.Body, &item.Condition,
			&item.CampaignName, &item.SenderEmail,
			&item.BizName, &item.BizCategory, &item.BizCity, &item.BizCountry,
		); err == nil {
			list = append(list, item)
		}
	}
	return list, nil
}

func (db *DB) DeleteCampaign(id int) error {
	_, err := db.conn.Exec("DELETE FROM campaign_recipients WHERE campaign_id = ?", id)
	if err != nil {
		return err
	}
	_, err = db.conn.Exec("DELETE FROM campaigns WHERE id = ?", id)
	return err
}

func (db *DB) AddRecipients(campaignID int, recipients []models.CampaignRecipient) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO campaign_recipients (campaign_id, business_id, email, open_token, click_token, variant)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range recipients {
		variant := r.Variant
		if variant == "" {
			variant = "A"
		}
		_, err := stmt.Exec(campaignID, r.BusinessID, r.Email, r.OpenToken, r.ClickToken, variant)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (db *DB) GetRecipientsByCampaign(campaignID int, limit, offset int) ([]models.CampaignRecipient, int, error) {
	var total int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?", campaignID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := db.conn.Query(`
		SELECT id, campaign_id, business_id, email,
		       COALESCE(sent_at, ''), COALESCE(opened_at, ''), COALESCE(clicked_at, ''),
		       COALESCE(open_token, ''), COALESCE(click_token, ''), COALESCE(variant, 'A')
		FROM campaign_recipients WHERE campaign_id = ?
		ORDER BY id DESC LIMIT ? OFFSET ?
	`, campaignID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var recipients []models.CampaignRecipient
	for rows.Next() {
		var r models.CampaignRecipient
		err := rows.Scan(&r.ID, &r.CampaignID, &r.BusinessID, &r.Email, &r.SentAt, &r.OpenedAt, &r.ClickedAt, &r.OpenToken, &r.ClickToken, &r.Variant)
		if err != nil {
			log.Printf("Scan recipient error: %v", err)
			continue
		}
		recipients = append(recipients, r)
	}

	return recipients, total, nil
}

func (db *DB) GetRecipientsWithBusinessByCampaign(campaignID int) ([]models.CampaignRecipientWithBusiness, error) {
	rows, err := db.conn.Query(`
		SELECT cr.id, cr.campaign_id, cr.business_id, cr.email, cr.open_token, cr.click_token,
			   COALESCE(b.name, '') as name, COALESCE(b.category, '') as category, COALESCE(b.city, '') as city, COALESCE(b.country, '') as country,
			   COALESCE(cr.variant, 'A') as variant
		FROM campaign_recipients cr
		LEFT JOIN businesses b ON cr.business_id = b.id
		WHERE cr.campaign_id = ?
	`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipients []models.CampaignRecipientWithBusiness
	for rows.Next() {
		var r models.CampaignRecipientWithBusiness
		err := rows.Scan(&r.ID, &r.CampaignID, &r.BusinessID, &r.Email, &r.OpenToken, &r.ClickToken, &r.Name, &r.Category, &r.City, &r.Country, &r.Variant)
		if err != nil {
			continue
		}
		recipients = append(recipients, r)
	}

	return recipients, nil
}

func (db *DB) UpdateRecipientOpen(token string) error {
	_, err := db.conn.Exec("UPDATE campaign_recipients SET opened_at = CURRENT_TIMESTAMP WHERE open_token = ? AND opened_at IS NULL", token)
	return err
}

func (db *DB) UpdateRecipientClick(token string) error {
	_, err := db.conn.Exec(`
		UPDATE campaign_recipients 
		SET clicked_at = CURRENT_TIMESTAMP,
		    opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP)
		WHERE click_token = ? AND clicked_at IS NULL
	`, token)
	return err
}

func (db *DB) GetCampaignStats(campaignID int) (models.CampaignStats, error) {
	var stats models.CampaignStats
	err := db.conn.QueryRow(`
		SELECT
			COUNT(*) as sent,
			SUM(CASE WHEN opened_at IS NOT NULL OR clicked_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
			SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
		FROM campaign_recipients WHERE campaign_id = ?
	`, campaignID).Scan(&stats.Sent, &stats.Opened, &stats.Clicked)
	if err != nil {
		return stats, err
	}

	if stats.Sent > 0 {
		stats.OpenRate = float64(stats.Opened) / float64(stats.Sent) * 100
		stats.ClickRate = float64(stats.Clicked) / float64(stats.Sent) * 100
	}
	stats.CampaignID = campaignID
	return stats, nil
}

func (db *DB) GetBusinessesWithEmail(limit int) ([]models.Business, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source
		FROM businesses WHERE email IS NOT NULL AND email != ''
		ORDER BY created_at DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var businesses []models.Business
	for rows.Next() {
		var b models.Business
		err := rows.Scan(&b.ID, &b.Name, &b.Address, &b.Phone, &b.Website, &b.Email, &b.Facebook,
			&b.Country, &b.City, &b.Latitude, &b.Longitude, &b.Rating, &b.TotalRating,
			&b.PlaceID, &b.Category, &b.Hours, &b.Source)
		if err != nil {
			continue
		}
		businesses = append(businesses, b)
	}
	return businesses, nil
}

type CampaignBusiness struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Website  string `json:"website"`
	Category string `json:"category"`
	City     string `json:"city"`
	Country  string `json:"country"`
	Source   string `json:"source"`
}

func (db *DB) SearchBusinessesForCampaign(query string, limit int) ([]CampaignBusiness, error) {
	where := "WHERE email IS NOT NULL AND email != ''"
	args := []interface{}{}
	if query != "" {
		where += " AND (name LIKE ? OR email LIKE ? OR category LIKE ?)"
		q := "%" + query + "%"
		args = append(args, q, q, q)
	}
	args = append(args, limit)

	rows, err := db.conn.Query(`
		SELECT id, name, email, phone, website, category, city, country, source
		FROM businesses `+where+`
		ORDER BY created_at DESC
		LIMIT ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var businesses []CampaignBusiness
	for rows.Next() {
		var b CampaignBusiness
		if err := rows.Scan(&b.ID, &b.Name, &b.Email, &b.Phone, &b.Website, &b.Category, &b.City, &b.Country, &b.Source); err != nil {
			continue
		}
		businesses = append(businesses, b)
	}
	return businesses, nil
}

func (db *DB) CountBusinessesWithEmail() int {
	var total int
	db.conn.QueryRow("SELECT COUNT(*) FROM businesses WHERE email IS NOT NULL AND email != ''").Scan(&total)
	return total
}

func (db *DB) GetSetting(key string) string {
	var value string
	err := db.conn.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err != nil {
		return ""
	}
	return value
}

func (db *DB) GetAllSettings() map[string]string {
	settings := map[string]string{}
	rows, err := db.conn.Query("SELECT key, value FROM settings")
	if err != nil {
		return settings
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			settings[k] = v
		}
	}
	return settings
}

func (db *DB) SetSetting(key, value string) error {
	_, err := db.conn.Exec(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, key, value)
	return err
}

func (db *DB) SetSettings(settings map[string]string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for k, v := range settings {
		if _, err := stmt.Exec(k, v); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// === Subscriptions ===

func (db *DB) GetSubscription(userID int) (map[string]interface{}, error) {
	row := db.conn.QueryRow("SELECT id, user_id, plan, stripe_customer_id, stripe_subscription_id, status, emails_limit, emails_sent, contacts_limit, period_start, period_end FROM subscriptions WHERE user_id = ?", userID)
	var id, uid, emailsLimit, emailsSent, contactsLimit int
	var plan, stripeCustomer, stripeSub, status string
	var periodStart, periodEnd sql.NullString
	err := row.Scan(&id, &uid, &plan, &stripeCustomer, &stripeSub, &status, &emailsLimit, &emailsSent, &contactsLimit, &periodStart, &periodEnd)
	if err != nil {
		return map[string]interface{}{
			"plan": "free", "status": "active", "emails_limit": 100, "emails_sent": 0, "contacts_limit": 500,
		}, nil
	}
	sub := map[string]interface{}{
		"id": id, "user_id": uid, "plan": plan, "stripe_customer_id": stripeCustomer,
		"stripe_subscription_id": stripeSub, "status": status, "emails_limit": emailsLimit,
		"emails_sent": emailsSent, "contacts_limit": contactsLimit,
	}
	if periodStart.Valid {
		sub["period_start"] = periodStart.String
	}
	if periodEnd.Valid {
		sub["period_end"] = periodEnd.String
	}
	return sub, nil
}

func (db *DB) CreateOrUpdateSubscription(userID int, plan, stripeCustomer, stripeSub string, emailsLimit, contactsLimit int) error {
	db.conn.Exec("DELETE FROM subscriptions WHERE user_id = ?", userID)
	_, err := db.conn.Exec(`
		INSERT INTO subscriptions (user_id, plan, stripe_customer_id, stripe_subscription_id, status, emails_limit, contacts_limit, period_start, period_end)
		VALUES (?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, datetime(CURRENT_TIMESTAMP, '+1 month'))
	`, userID, plan, stripeCustomer, stripeSub, emailsLimit, contactsLimit)
	return err
}

func (db *DB) IncrementEmailsSent(userID int) error {
	_, err := db.conn.Exec("UPDATE subscriptions SET emails_sent = emails_sent + 1 WHERE user_id = ?", userID)
	return err
}

func (db *DB) CanSendEmail(userID int) bool {
	var emailsSent, emailsLimit int
	err := db.conn.QueryRow("SELECT COALESCE(emails_sent, 0), COALESCE(emails_limit, 100) FROM subscriptions WHERE user_id = ?", userID).Scan(&emailsSent, &emailsLimit)
	if err != nil {
		return true
	}
	return emailsSent < emailsLimit
}

// === Teams ===

func (db *DB) CreateTeam(name string, ownerID int) (int, error) {
	result, err := db.conn.Exec("INSERT INTO teams (name, owner_id) VALUES (?, ?)", name, ownerID)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	_, err = db.conn.Exec("INSERT INTO team_members (team_id, user_id, role, accepted_at) VALUES (?, ?, 'owner', CURRENT_TIMESTAMP)", id, ownerID)
	return int(id), err
}

func (db *DB) GetTeamsForUser(userID int) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT t.id, t.name, t.owner_id, t.plan, tm.role
		FROM teams t JOIN team_members tm ON t.id = tm.team_id
		WHERE tm.user_id = ? AND tm.accepted_at IS NOT NULL
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var teams []map[string]interface{}
	for rows.Next() {
		var id, ownerID int
		var name, plan, role string
		rows.Scan(&id, &name, &ownerID, &plan, &role)
		teams = append(teams, map[string]interface{}{
			"id": id, "name": name, "owner_id": ownerID, "plan": plan, "role": role,
		})
	}
	return teams, nil
}

func (db *DB) GetTeamMembers(teamID int) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT u.id, u.name, u.email, tm.role, tm.invited_at, tm.accepted_at
		FROM team_members tm JOIN users u ON tm.user_id = u.id
		WHERE tm.team_id = ?
	`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var members []map[string]interface{}
	for rows.Next() {
		var id int
		var name, email, role string
		var invitedAt, acceptedAt sql.NullString
		rows.Scan(&id, &name, &email, &role, &invitedAt, &acceptedAt)
		m := map[string]interface{}{
			"id": id, "name": name, "email": email, "role": role,
		}
		if acceptedAt.Valid {
			m["status"] = "active"
		} else {
			m["status"] = "invited"
		}
		members = append(members, m)
	}
	return members, nil
}

func (db *DB) InviteTeamMember(teamID int, email string) (int, error) {
	var userID int
	err := db.conn.QueryRow("SELECT id FROM users WHERE email = ?", email).Scan(&userID)
	if err != nil {
		return 0, fmt.Errorf("user not found with email %s", email)
	}
	result, err := db.conn.Exec(`
		INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')
		ON CONFLICT(team_id, user_id) DO NOTHING
	`, teamID, userID)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) RemoveTeamMember(teamID, userID int) error {
	_, err := db.conn.Exec("DELETE FROM team_members WHERE team_id = ? AND user_id = ? AND role != 'owner'", teamID, userID)
	return err
}

func (db *DB) GetUserTeamID(userID int) int {
	var teamID int
	db.conn.QueryRow("SELECT team_id FROM team_members WHERE user_id = ? AND accepted_at IS NOT NULL LIMIT 1", userID).Scan(&teamID)
	return teamID
}

// === Email Templates ===

func (db *DB) GetEmailTemplates(userID int) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, subject, body, category, is_public, created_at
		FROM email_templates WHERE user_id = ? OR is_public = 1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var templates []map[string]interface{}
	for rows.Next() {
		var id, isPublic int
		var name, subject, body, category, createdAt string
		rows.Scan(&id, &name, &subject, &body, &category, &isPublic, &createdAt)
		templates = append(templates, map[string]interface{}{
			"id": id, "name": name, "subject": subject, "body": body,
			"category": category, "is_public": isPublic, "created_at": createdAt,
		})
	}
	return templates, nil
}

func (db *DB) CreateEmailTemplate(userID int, name, subject, body, category string, isPublic bool) (int, error) {
	public := 0
	if isPublic {
		public = 1
	}
	result, err := db.conn.Exec(`
		INSERT INTO email_templates (user_id, name, subject, body, category, is_public) VALUES (?, ?, ?, ?, ?, ?)
	`, userID, name, subject, body, category, public)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) UpdateEmailTemplate(id, userID int, name, subject, body, category string) error {
	_, err := db.conn.Exec(`
		UPDATE email_templates SET name=?, subject=?, body=?, category=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=? AND user_id=?
	`, name, subject, body, category, id, userID)
	return err
}

func (db *DB) DeleteEmailTemplate(id, userID int) error {
	_, err := db.conn.Exec("DELETE FROM email_templates WHERE id=? AND user_id=?", id, userID)
	return err
}

func (db *DB) GetEmailTemplateByID(id int) (map[string]interface{}, error) {
	var isPublic int
	var name, subject, body, category, createdAt string
	err := db.conn.QueryRow(`
		SELECT id, name, subject, body, category, is_public, created_at
		FROM email_templates WHERE id = ?
	`, id).Scan(&id, &name, &subject, &body, &category, &isPublic, &createdAt)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id": id, "name": name, "subject": subject, "body": body,
		"category": category, "is_public": isPublic, "created_at": createdAt,
	}, nil
}

// === Landing Pages ===

func (db *DB) GetLandingPages(userID int) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT id, title, slug, subheadline, theme, published, views, submissions, created_at
		FROM landing_pages WHERE user_id = ? ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pages []map[string]interface{}
	for rows.Next() {
		var id, published, views, submissions int
		var title, slug, theme, createdAt string
		var subheadline sql.NullString
		rows.Scan(&id, &title, &slug, &subheadline, &theme, &published, &views, &submissions, &createdAt)
		p := map[string]interface{}{
			"id": id, "title": title, "slug": slug, "theme": theme,
			"published": published, "views": views, "submissions": submissions, "created_at": createdAt,
		}
		if subheadline.Valid {
			p["subheadline"] = subheadline.String
		}
		pages = append(pages, p)
	}
	return pages, nil
}

func (db *DB) GetLandingPageBySlug(slug string) (map[string]interface{}, error) {
	var id, userID, published, views, submissions int
	var title, slugVal, theme, createdAt string
	var subheadline, description, formFields, settings sql.NullString
	err := db.conn.QueryRow(`
		SELECT id, user_id, title, slug, subheadline, description, form_fields, theme, settings, published, views, submissions, created_at
		FROM landing_pages WHERE slug = ?
	`, slug).Scan(&id, &userID, &title, &slugVal, &subheadline, &description, &formFields, &theme, &settings, &published, &views, &submissions, &createdAt)
	if err != nil {
		return nil, err
	}
	p := map[string]interface{}{
		"id": id, "user_id": userID, "title": title, "slug": slugVal, "theme": theme,
		"published": published, "views": views, "submissions": submissions, "created_at": createdAt,
	}
	if subheadline.Valid {
		p["subheadline"] = subheadline.String
	}
	if description.Valid {
		p["description"] = description.String
	}
	if formFields.Valid {
		p["form_fields"] = formFields.String
	}
	if settings.Valid {
		p["settings"] = settings.String
	}
	return p, nil
}

func (db *DB) CreateLandingPage(userID int, title, slug, subheadline, description, formFields, theme, settings string) (int, error) {
	result, err := db.conn.Exec(`
		INSERT INTO landing_pages (user_id, title, slug, subheadline, description, form_fields, theme, settings)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, title, slug, subheadline, description, formFields, theme, settings)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) UpdateLandingPage(id, userID int, title, subheadline, description, formFields, theme, settings string, published bool) error {
	pub := 0
	if published {
		pub = 1
	}
	_, err := db.conn.Exec(`
		UPDATE landing_pages SET title=?, subheadline=?, description=?, form_fields=?, theme=?, settings=?, published=?, updated_at=CURRENT_TIMESTAMP
		WHERE id=? AND user_id=?
	`, title, subheadline, description, formFields, theme, settings, pub, id, userID)
	return err
}

func (db *DB) DeleteLandingPage(id, userID int) error {
	_, err := db.conn.Exec("DELETE FROM landing_pages WHERE id=? AND user_id=?", id, userID)
	return err
}

func (db *DB) SetLandingPageStatus(id int, status string) error {
	pub := 0
	if status == "published" {
		pub = 1
	}
	_, err := db.conn.Exec("UPDATE landing_pages SET published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", pub, id)
	return err
}

func (db *DB) IncrementLandingPageViews(slug string) error {
	_, err := db.conn.Exec("UPDATE landing_pages SET views = views + 1 WHERE slug = ?", slug)
	return err
}

func (db *DB) AddLandingPageSubmission(pageID int, data, ipAddress string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.Exec("INSERT INTO landing_page_submissions (page_id, data, ip_address) VALUES (?, ?, ?)", pageID, data, ipAddress)
	if err != nil {
		return err
	}
	_, err = tx.Exec("UPDATE landing_pages SET submissions = submissions + 1 WHERE id = ?", pageID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (db *DB) GetLandingPageSubmissions(pageID, userID int) ([]map[string]interface{}, error) {
	var check int
	err := db.conn.QueryRow("SELECT user_id FROM landing_pages WHERE id = ?", pageID).Scan(&check)
	if err != nil || check != userID {
		return nil, fmt.Errorf("not found")
	}
	rows, err := db.conn.Query("SELECT id, data, ip_address, created_at FROM landing_page_submissions WHERE page_id = ? ORDER BY created_at DESC", pageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var subs []map[string]interface{}
	for rows.Next() {
		var id int
		var data, ipAddress, createdAt string
		rows.Scan(&id, &data, &ipAddress, &createdAt)
		subs = append(subs, map[string]interface{}{
			"id": id, "data": data, "ip_address": ipAddress, "created_at": createdAt,
		})
	}
	return subs, nil
}

// === Webhooks ===

func (db *DB) GetWebhooks(userID int) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, url, events, secret, active, last_triggered, last_status, created_at
		FROM webhooks WHERE user_id = ? ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hooks []map[string]interface{}
	for rows.Next() {
		var id, active int
		var name, url, events string
		var secret sql.NullString
		var lastTriggered sql.NullString
		var lastStatus sql.NullInt64
		var createdAt string
		rows.Scan(&id, &name, &url, &events, &secret, &active, &lastTriggered, &lastStatus, &createdAt)
		h := map[string]interface{}{
			"id": id, "name": name, "url": url, "events": events,
			"active": active, "created_at": createdAt,
		}
		if secret.Valid {
			h["secret"] = secret.String
		}
		if lastTriggered.Valid {
			h["last_triggered"] = lastTriggered.String
		}
		if lastStatus.Valid {
			h["last_status"] = lastStatus.Int64
		}
		hooks = append(hooks, h)
	}
	return hooks, nil
}

func (db *DB) CreateWebhook(userID int, name, url, events, secret string) (int, error) {
	result, err := db.conn.Exec(`
		INSERT INTO webhooks (user_id, name, url, events, secret) VALUES (?, ?, ?, ?, ?)
	`, userID, name, url, events, secret)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) UpdateWebhook(id, userID int, name, url, events string, active bool) error {
	act := 0
	if active {
		act = 1
	}
	_, err := db.conn.Exec(`
		UPDATE webhooks SET name=?, url=?, events=?, active=? WHERE id=? AND user_id=?
	`, name, url, events, act, id, userID)
	return err
}

func (db *DB) DeleteWebhook(id, userID int) error {
	_, err := db.conn.Exec("DELETE FROM webhooks WHERE id=? AND user_id=?", id, userID)
	return err
}

func (db *DB) GetWebhookByID(id, userID int) (map[string]interface{}, error) {
	var name, url, events string
	var secret sql.NullString
	err := db.conn.QueryRow("SELECT name, url, events, secret FROM webhooks WHERE id = ? AND user_id = ?", id, userID).Scan(&name, &url, &events, &secret)
	if err != nil {
		return nil, err
	}
	res := map[string]interface{}{
		"id": id, "name": name, "url": url, "events": events,
	}
	if secret.Valid {
		res["secret"] = secret.String
	}
	return res, nil
}

func (db *DB) GetActiveWebhooksForEvent(userID int, event string) ([]map[string]interface{}, error) {
	rows, err := db.conn.Query(`
		SELECT id, url, secret FROM webhooks WHERE user_id = ? AND active = 1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hooks []map[string]interface{}
	for rows.Next() {
		var id int
		var url string
		var secret sql.NullString
		rows.Scan(&id, &url, &secret)
		h := map[string]interface{}{"id": id, "url": url}
		if secret.Valid {
			h["secret"] = secret.String
		}
		hooks = append(hooks, h)
	}
	return hooks, nil
}

func (db *DB) UpdateWebhookStatus(id int, status int) error {
	_, err := db.conn.Exec("UPDATE webhooks SET last_triggered = CURRENT_TIMESTAMP, last_status = ? WHERE id = ?", status, id)
	return err
}

// === Email Verification & Compliance ===

func (db *DB) UpdateBusinessEmailStatus(id int, status string) error {
	_, err := db.conn.Exec("UPDATE businesses SET email_status = ? WHERE id = ?", status, id)
	return err
}

func (db *DB) BatchUpdateBusinessEmailStatus(statuses map[int]string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("UPDATE businesses SET email_status = ? WHERE id = ?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for id, status := range statuses {
		if _, err := stmt.Exec(status, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (db *DB) UpdateBusinessDecisionMaker(id int, decisionMaker, linkedin string) error {
	_, err := db.conn.Exec("UPDATE businesses SET decision_maker = ?, linkedin = ? WHERE id = ?", decisionMaker, linkedin, id)
	return err
}

func (db *DB) GetBusinessesWithUnverifiedEmail(limit int) ([]models.Business, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := db.conn.Query(`
		SELECT id, name, email FROM businesses
		WHERE email IS NOT NULL AND email != '' AND (email_status IS NULL OR email_status = 'unverified')
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var businesses []models.Business
	for rows.Next() {
		var b models.Business
		if err := rows.Scan(&b.ID, &b.Name, &b.Email); err == nil {
			businesses = append(businesses, b)
		}
	}
	return businesses, nil
}

func (db *DB) IsEmailUnsubscribed(email string) bool {
	var count int
	clean := strings.ToLower(strings.TrimSpace(email))
	db.conn.QueryRow("SELECT COUNT(*) FROM unsubscribed_emails WHERE LOWER(email) = ?", clean).Scan(&count)
	return count > 0
}

func (db *DB) UnsubscribeEmail(email string) error {
	clean := strings.ToLower(strings.TrimSpace(email))
	_, err := db.conn.Exec("INSERT OR IGNORE INTO unsubscribed_emails (email) VALUES (?)", clean)
	return err
}

func (db *DB) GetEmailByToken(token string) string {
	var email string
	db.conn.QueryRow("SELECT email FROM campaign_recipients WHERE open_token = ? OR click_token = ?", token, token).Scan(&email)
	return email
}
