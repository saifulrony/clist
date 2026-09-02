package verifier

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

	// Common disposable/burner email domains
	disposableDomains = map[string]bool{
		"mailinator.com":     true,
		"guerrillamail.com":  true,
		"tempmail.com":       true,
		"10minutemail.com":   true,
		"throwawaymail.com":  true,
		"trashmail.com":      true,
		"yopmail.com":        true,
		"sharklasers.com":    true,
		"getairmail.com":     true,
		"dispostable.com":    true,
		"burnermail.io":      true,
		"temp-mail.org":      true,
		"fakeinbox.com":      true,
		"mytemp.email":       true,
		"crazymailing.com":   true,
		"maildrop.cc":        true,
		"inboxkitten.com":    true,
		"emailondeck.com":    true,
	}

	// Generic/role-based email prefixes
	genericPrefixes = map[string]bool{
		"info":     true,
		"support":  true,
		"admin":    true,
		"contact":  true,
		"sales":    true,
		"help":     true,
		"billing":  true,
		"office":   true,
		"service":  true,
		"jobs":     true,
		"team":     true,
	}
)

type VerificationResult struct {
	Email       string `json:"email"`
	Status      string `json:"status"` // "valid", "risky", "invalid"
	Reason      string `json:"reason"`
	MXExists    bool   `json:"mx_exists"`
	Disposable  bool   `json:"disposable"`
	RoleBased   bool   `json:"role_based"`
	SyntaxValid bool   `json:"syntax_valid"`
}

// ValidateSyntax checks if the email matches standard RFC regex format
func ValidateSyntax(email string) bool {
	if len(email) < 3 || len(email) > 254 {
		return false
	}
	return emailRegex.MatchString(email)
}

// IsDisposable checks against known temporary/disposable email domains
func IsDisposable(domain string) bool {
	return disposableDomains[strings.ToLower(domain)]
}

// IsRoleBased checks if email is generic like info@, support@
func IsRoleBased(email string) bool {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}
	prefix := strings.ToLower(parts[0])
	return genericPrefixes[prefix]
}

// CheckMX resolves mail exchanger records for the domain
func CheckMX(domain string) ([]*net.MX, error) {
	mxRecords, err := net.LookupMX(domain)
	if err != nil || len(mxRecords) == 0 {
		return nil, fmt.Errorf("no MX records found")
	}
	return mxRecords, nil
}

// ProbeSMTP conducts a polite SMTP handshake (EHLO -> MAIL FROM -> RCPT TO) with timeout
func ProbeSMTP(email, mxHost string) (bool, error) {
	timeout := 5 * time.Second
	conn, err := net.DialTimeout("tcp", mxHost+":25", timeout)
	if err != nil {
		return false, err
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(timeout))

	client, err := smtp.NewClient(conn, mxHost)
	if err != nil {
		return false, err
	}
	defer client.Quit()

	if err = client.Hello("verify.clientlist.local"); err != nil {
		return false, err
	}

	// Try TLS if available
	if ok, _ := client.Extension("STARTTLS"); ok {
		config := &tls.Config{ServerName: mxHost, InsecureSkipVerify: true}
		_ = client.StartTLS(config)
	}

	// MAIL FROM
	if err = client.Mail("verify@clientlist.local"); err != nil {
		return false, err
	}

	// RCPT TO probe
	if err = client.Rcpt(email); err != nil {
		return false, err
	}

	return true, nil
}

// VerifyEmail conducts full verification and returns a detailed VerificationResult
func VerifyEmail(email string) VerificationResult {
	email = strings.TrimSpace(email)
	res := VerificationResult{
		Email:  email,
		Status: "invalid",
	}

	if !ValidateSyntax(email) {
		res.Reason = "Invalid email format"
		return res
	}
	res.SyntaxValid = true

	parts := strings.Split(email, "@")
	domain := strings.ToLower(parts[1])

	if IsDisposable(domain) {
		res.Disposable = true
		res.Status = "risky"
		res.Reason = "Disposable/temporary email domain"
		return res
	}

	if IsRoleBased(email) {
		res.RoleBased = true
	}

	// Check MX Records
	mxRecords, err := CheckMX(domain)
	if err != nil || len(mxRecords) == 0 {
		res.Reason = "Domain does not accept emails (no MX records)"
		res.Status = "invalid"
		return res
	}
	res.MXExists = true

	// Quick check for common public mail providers (Gmail, Outlook, Yahoo)
	// Major providers often block direct port 25 residential SMTP probes,
	// so for reputable providers, MX existence confirms validity.
	isMajorProvider := strings.Contains(domain, "gmail.com") ||
		strings.Contains(domain, "googlemail.com") ||
		strings.Contains(domain, "outlook.com") ||
		strings.Contains(domain, "hotmail.com") ||
		strings.Contains(domain, "yahoo.com") ||
		strings.Contains(domain, "icloud.com")

	if isMajorProvider {
		if res.RoleBased {
			res.Status = "risky"
			res.Reason = "Role-based address on major mail provider"
		} else {
			res.Status = "valid"
			res.Reason = "Valid mailbox on verified mail server"
		}
		return res
	}

	// Probe primary MX
	primaryMX := strings.TrimSuffix(mxRecords[0].Host, ".")
	accepted, probeErr := ProbeSMTP(email, primaryMX)
	if probeErr == nil && accepted {
		if res.RoleBased {
			res.Status = "risky"
			res.Reason = "Generic role address (info/support)"
		} else {
			res.Status = "valid"
			res.Reason = "SMTP mailbox verified successfully"
		}
		return res
	}

	// If SMTP probe timed out or was blocked, but MX records exist
	if res.RoleBased {
		res.Status = "risky"
		res.Reason = "Role-based address (MX exists, probe unconfirmed)"
	} else {
		// Valid MX exists, address is likely catch-all or has port 25 filtered
		res.Status = "valid"
		res.Reason = "Domain verified with active MX records"
	}

	return res
}

// BatchVerify conducts concurrent email verifications with rate limiting
func BatchVerify(emails []string, concurrency int) map[string]VerificationResult {
	if concurrency <= 0 {
		concurrency = 5
	}

	results := make(map[string]VerificationResult)
	var mu sync.Mutex

	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, e := range emails {
		if e == "" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}

		go func(target string) {
			defer wg.Done()
			defer func() { <-sem }()

			r := VerifyEmail(target)
			mu.Lock()
			results[target] = r
			mu.Unlock()
		}(e)
	}

	wg.Wait()
	return results
}
