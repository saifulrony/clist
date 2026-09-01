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
	}

	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}

	log.Println("Database migration complete")
	return nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) UpsertBusiness(biz models.Business, source, crawlID string) error {
	_, err := db.conn.Exec(`
		INSERT INTO businesses (name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, crawl_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name, address) DO UPDATE SET
			phone = COALESCE(NULLIF(excluded.phone, ''), businesses.phone),
			website = COALESCE(NULLIF(excluded.website, ''), businesses.website),
			email = COALESCE(NULLIF(excluded.email, ''), businesses.email),
			facebook = COALESCE(NULLIF(excluded.facebook, ''), businesses.facebook),
			rating = CASE WHEN excluded.rating > 0 THEN excluded.rating ELSE businesses.rating END,
			total_rating = CASE WHEN excluded.total_rating > 0 THEN excluded.total_rating ELSE businesses.total_rating END,
			category = COALESCE(NULLIF(excluded.category, ''), businesses.category),
			opening_hours = COALESCE(NULLIF(excluded.opening_hours, ''), businesses.opening_hours)
	`,
		biz.Name, biz.Address, biz.Phone, biz.Website, biz.Email, biz.Facebook,
		biz.Country, extractCity(biz.Address), biz.Latitude, biz.Longitude,
		biz.Rating, biz.TotalRating, biz.PlaceID, biz.Category, biz.Hours,
		source, crawlID,
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
	return db.SearchBusinessesFiltered(query, city, category, source, "", "", "", "", limit, offset)
}

func (db *DB) SearchBusinessesFiltered(query, city, category, source, country, hasEmail, hasPhone, hasWebsite string, limit, offset int) ([]models.Business, int, error) {
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

	var total int
	countArgs := make([]interface{}, len(args))
	copy(countArgs, args)
	err := db.conn.QueryRow("SELECT COUNT(*) FROM businesses "+where, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	rows, err := db.conn.Query(`
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source, created_at
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
			&b.PlaceID, &b.Category, &b.Hours, &b.Source, &b.CreatedAt)
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
		SELECT id, name, address, phone, website, email, facebook, country, city, latitude, longitude, rating, total_rating, place_id, category, opening_hours, source
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
			&b.PlaceID, &b.Category, &b.Hours, &b.Source)
		if err != nil {
			log.Printf("Scan error: %v", err)
			continue
		}
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
	result, err := db.conn.Exec(`
		INSERT INTO campaigns (name, subject, body, sender_email, status)
		VALUES (?, ?, ?, ?, 'draft')
	`, c.Name, c.Subject, c.Body, c.SenderEmail)
	if err != nil {
		return 0, err
	}
	id, _ := result.LastInsertId()
	return int(id), nil
}

func (db *DB) GetCampaigns() ([]models.Campaign, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, subject, body, sender_email, status, sent_count, opened_count, clicked_count, created_at
		FROM campaigns ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var campaigns []models.Campaign
	for rows.Next() {
		var c models.Campaign
		err := rows.Scan(&c.ID, &c.Name, &c.Subject, &c.Body, &c.SenderEmail, &c.Status, &c.SentCount, &c.OpenedCount, &c.ClickedCount, &c.CreatedAt)
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
		SELECT id, name, subject, body, sender_email, status, sent_count, opened_count, clicked_count, created_at
		FROM campaigns WHERE id = ?
	`, id).Scan(&c.ID, &c.Name, &c.Subject, &c.Body, &c.SenderEmail, &c.Status, &c.SentCount, &c.OpenedCount, &c.ClickedCount, &c.CreatedAt)
	return c, err
}

func (db *DB) UpdateCampaignStatus(id int, status string) error {
	_, err := db.conn.Exec("UPDATE campaigns SET status = ? WHERE id = ?", status, id)
	return err
}

func (db *DB) UpdateCampaignStats(id int) error {
	_, err := db.conn.Exec(`
		UPDATE campaigns SET
			sent_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ?),
			opened_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND opened_at IS NOT NULL),
			clicked_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = ? AND clicked_at IS NOT NULL)
		WHERE id = ?
	`, id, id, id, id)
	return err
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
		INSERT INTO campaign_recipients (campaign_id, business_id, email, open_token, click_token)
		VALUES (?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range recipients {
		_, err := stmt.Exec(campaignID, r.BusinessID, r.Email, r.OpenToken, r.ClickToken)
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
		SELECT id, campaign_id, business_id, email, sent_at, opened_at, clicked_at, open_token, click_token
		FROM campaign_recipients WHERE campaign_id = ?
		ORDER BY sent_at DESC LIMIT ? OFFSET ?
	`, campaignID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var recipients []models.CampaignRecipient
	for rows.Next() {
		var r models.CampaignRecipient
		err := rows.Scan(&r.ID, &r.CampaignID, &r.BusinessID, &r.Email, &r.SentAt, &r.OpenedAt, &r.ClickedAt, &r.OpenToken, &r.ClickToken)
		if err != nil {
			continue
		}
		recipients = append(recipients, r)
	}

	return recipients, total, nil
}

func (db *DB) GetRecipientsWithBusinessByCampaign(campaignID int) ([]models.CampaignRecipientWithBusiness, error) {
	rows, err := db.conn.Query(`
		SELECT cr.id, cr.campaign_id, cr.business_id, cr.email, cr.open_token, cr.click_token,
			   COALESCE(b.name, '') as name, COALESCE(b.category, '') as category, COALESCE(b.city, '') as city, COALESCE(b.country, '') as country
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
		err := rows.Scan(&r.ID, &r.CampaignID, &r.BusinessID, &r.Email, &r.OpenToken, &r.ClickToken, &r.Name, &r.Category, &r.City, &r.Country)
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
	_, err := db.conn.Exec("UPDATE campaign_recipients SET clicked_at = CURRENT_TIMESTAMP WHERE click_token = ? AND clicked_at IS NULL", token)
	return err
}

func (db *DB) GetCampaignStats(campaignID int) (models.CampaignStats, error) {
	var stats models.CampaignStats
	err := db.conn.QueryRow(`
		SELECT
			COUNT(*) as sent,
			SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
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
