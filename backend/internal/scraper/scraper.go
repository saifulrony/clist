package scraper

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"client-list-backend/internal/models"
)

var (
	phoneRegex   = regexp.MustCompile(`(?i)(?:tel[:\s]*["']?|href\s*=\s*["']tel:)([^"'\s<>]+)`)
	phoneFind    = regexp.MustCompile(`(?i)\+?[\d\s\-\(\)]{7,20}`)
	emailRegex   = regexp.MustCompile(`(?i)(?:mailto[:\s]*["']?|href\s*=\s*["']mailto:)([^"'\s<>]+)`)
	emailFind    = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
	fbRegex      = regexp.MustCompile(`(?i)(?:facebook\.com|fb\.com)/([a-zA-Z0-9._\-]+)`)
	twitterRegex = regexp.MustCompile(`(?i)(?:twitter\.com|x\.com)/([a-zA-Z0-9_]+)`)
	liRegex      = regexp.MustCompile(`(?i)linkedin\.com/(?:company|in)/([a-zA-Z0-9._\-]+)`)
	igRegex      = regexp.MustCompile(`(?i)instagram\.com/([a-zA-Z0-9._]+)`)
)

type Client struct {
	http *http.Client
}

func NewClient() *Client {
	return &Client{
		http: &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
	}
}

func (c *Client) EnrichBusinesses(businesses []models.Business) []models.Business {
	type result struct {
		index int
		biz   models.Business
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ch := make(chan result, len(businesses))

	for i, biz := range businesses {
		go func(idx int, b models.Business) {
			if b.Website != "" {
				enriched := c.scrapeWebsite(ctx, b)
				ch <- result{index: idx, biz: enriched}
			} else {
				ch <- result{index: idx, biz: b}
			}
		}(i, biz)
	}

	for i := 0; i < len(businesses); i++ {
		r := <-ch
		businesses[r.index] = r.biz
	}

	return businesses
}

func (c *Client) scrapeWebsite(ctx context.Context, biz models.Business) models.Business {
	u, err := url.Parse(biz.Website)
	if err != nil {
		return biz
	}

	// Try main page + contact + about + team paths
	paths := []string{"", "/contact", "/about", "/about-us", "/team", "/our-team", "/leadership", "/management", "/impressum"}
	var allHTML strings.Builder

	for _, path := range paths {
		if ctx.Err() != nil {
			break
		}
		target := u.Scheme + "://" + u.Host + path
		html := c.fetchPage(ctx, target)
		allHTML.WriteString(html)
		time.Sleep(100 * time.Millisecond)
	}

	html := allHTML.String()

	// Extract email
	if biz.Email == "" {
		biz.Email = extractEmail(html)
	}

	// Extract phone
	if biz.Phone == "" {
		biz.Phone = extractPhone(html)
	}

	// Extract social links
	if biz.Facebook == "" {
		if m := fbRegex.FindStringSubmatch(html); len(m) > 0 {
			biz.Facebook = "https://facebook.com/" + m[1]
		}
	}

	// Extract LinkedIn
	if biz.LinkedIn == "" {
		if m := liRegex.FindStringSubmatch(html); len(m) > 0 {
			biz.LinkedIn = "https://linkedin.com/in/" + m[1]
		}
	}

	// Extract Decision Maker
	if biz.DecisionMaker == "" {
		biz.DecisionMaker = extractDecisionMaker(html)
	}

	return biz
}

func extractDecisionMaker(html string) string {
	// Pattern 1: "John Doe - Founder & CEO" or "John Doe, Founder"
	p1 := regexp.MustCompile(`(?i)(?:^|[\n\r<>"]|\s{2,})([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})[\s,–—\-|:]+(?:is the\s+|our\s+)?(CEO|Founder|Co-Founder|President|Owner|Managing Director|Principal|Partner)(?:[\s,<\n\r"]|$)`)
	if m := p1.FindStringSubmatch(html); len(m) > 2 {
		name := strings.TrimSpace(m[1])
		role := strings.TrimSpace(m[2])
		if len(name) > 3 && len(name) < 30 && !strings.Contains(strings.ToLower(name), "copyright") {
			return fmt.Sprintf("%s (%s)", name, role)
		}
	}

	// Pattern 2: "Founder: John Doe" or "CEO & Founder - John Doe"
	p2 := regexp.MustCompile(`(?i)(?:^|[\n\r<>"]|\s{2,})(CEO|Founder|Co-Founder|President|Owner|Managing Director|Principal|Partner)[\s,–—\-|:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:[\s,<\n\r"]|$)`)
	if m := p2.FindStringSubmatch(html); len(m) > 2 {
		role := strings.TrimSpace(m[1])
		name := strings.TrimSpace(m[2])
		if len(name) > 3 && len(name) < 30 && !strings.Contains(strings.ToLower(name), "copyright") {
			return fmt.Sprintf("%s (%s)", name, role)
		}
	}

	return ""
}

func (c *Client) fetchPage(ctx context.Context, url string) string {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; ClientListBot/1.0)")
	req.Header.Set("Accept", "text/html")

	resp, err := c.http.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return ""
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 500*1024)) // 500KB max
	if err != nil {
		return ""
	}

	return string(body)
}

func extractEmail(html string) string {
	// Try mailto: links first
	if m := emailRegex.FindStringSubmatch(html); len(m) > 1 {
		email := strings.TrimSpace(m[1])
		if !isJunkEmail(email) {
			return email
		}
	}
	// Try general email patterns
	if m := emailFind.FindString(html); m != "" {
		email := strings.TrimSpace(m)
		if !isJunkEmail(email) {
			return email
		}
	}
	return ""
}

func extractPhone(html string) string {
	// Try tel: links first
	if m := phoneRegex.FindStringSubmatch(html); len(m) > 1 {
		phone := cleanPhone(m[1])
		if len(phone) >= 7 {
			return phone
		}
	}
	// Try general phone patterns in visible text
	// Look for common phone patterns near keywords
	phoneKeywords := regexp.MustCompile(`(?i)(?:phone|tel|call|contact|mobile|fax)[:\s]*([+\d\s\-().]{7,20})`)
	if m := phoneKeywords.FindStringSubmatch(html); len(m) > 1 {
		phone := cleanPhone(m[1])
		if len(phone) >= 7 {
			return phone
		}
	}
	// Fallback: find any phone-like string
	if m := phoneFind.FindString(html); m != "" {
		phone := cleanPhone(m)
		if len(phone) >= 7 {
			return phone
		}
	}
	return ""
}

func cleanPhone(s string) string {
	s = strings.TrimSpace(s)
	s = regexp.MustCompile(`[<>"']`).ReplaceAllString(s, "")
	s = strings.Trim(s, "/")
	s = strings.TrimSpace(s)
	return s
}

func isJunkEmail(email string) bool {
	lower := strings.ToLower(email)
	junk := []string{
		"example.com", "sentry.io", "wixpress.com", "w3.org",
		"schema.org", "googleapis.com", "gstatic.com",
		"cloudflare.com", "jquery", "wordpress.org",
		"localhost", "test.com", "email.com",
		"no-reply", "noreply", "donotreply",
		".png", ".jpg", ".gif", ".svg", ".webp",
	}
	for _, j := range junk {
		if strings.Contains(lower, j) {
			return true
		}
	}
	return false
}
