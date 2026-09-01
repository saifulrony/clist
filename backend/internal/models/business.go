package models

type SearchRequest struct {
	Query    string `json:"query"`
	Location string `json:"location,omitempty"`
	Country  string `json:"country,omitempty"`
	Limit    int    `json:"limit"`
	Source   string `json:"source,omitempty"`
	Scrape   bool   `json:"scrape,omitempty"`
}

type Business struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Address     string  `json:"address"`
	Phone       string  `json:"phone"`
	Website     string  `json:"website"`
	Email       string  `json:"email"`
	Facebook    string  `json:"facebook"`
	Country     string  `json:"country"`
	City        string  `json:"city"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Rating      float64 `json:"rating"`
	TotalRating int     `json:"total_rating"`
	PlaceID     string  `json:"place_id"`
	Category    string  `json:"category"`
	Hours       string  `json:"opening_hours"`
	Source      string  `json:"source,omitempty"`
	CreatedAt   string  `json:"created_at"`
}

type SearchResponse struct {
	Results []Business `json:"results"`
	Total   int        `json:"total"`
	Warning string     `json:"warning,omitempty"`
}
