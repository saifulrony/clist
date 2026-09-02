package models

type Campaign struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Subject      string `json:"subject"`
	Body         string `json:"body"`
	CreatedAt    string `json:"created_at"`
	Status       string `json:"status"`
	SentCount    int    `json:"sent_count"`
	OpenedCount  int    `json:"opened_count"`
	ClickedCount int    `json:"clicked_count"`
	SenderEmail  string `json:"sender_email"`
	ScheduledAt  string `json:"scheduled_at,omitempty"`
	SubjectB     string `json:"subject_b,omitempty"`
	BodyB        string `json:"body_b,omitempty"`
	IsABTest     int    `json:"is_ab_test,omitempty"`
}

type CampaignStep struct {
	ID         int    `json:"id"`
	CampaignID int    `json:"campaign_id"`
	StepNumber int    `json:"step_number"`
	WaitDays   int    `json:"wait_days"`
	DelayDays  int    `json:"delay_days,omitempty"`
	Subject    string `json:"subject"`
	Body       string `json:"body"`
	Condition  string `json:"condition"`
	CreatedAt  string `json:"created_at"`
}

type CampaignRecipient struct {
	ID             int    `json:"id"`
	CampaignID     int    `json:"campaign_id"`
	BusinessID     int    `json:"business_id"`
	Email          string `json:"email"`
	SentAt         string `json:"sent_at"`
	OpenedAt       string `json:"opened_at"`
	ClickedAt      string `json:"clicked_at"`
	OpenToken      string `json:"open_token"`
	ClickToken     string `json:"click_token"`
	Variant        string `json:"variant,omitempty"`
	CurrentStep    int    `json:"current_step,omitempty"`
	LastStepSentAt string `json:"last_step_sent_at,omitempty"`
}

type CampaignRecipientWithBusiness struct {
	ID          int    `json:"id"`
	CampaignID  int    `json:"campaign_id"`
	BusinessID  int    `json:"business_id"`
	Email       string `json:"email"`
	OpenToken   string `json:"open_token"`
	ClickToken  string `json:"click_token"`
	Name        string `json:"name"`
	Category    string `json:"category"`
	City        string `json:"city"`
	Country     string `json:"country"`
	Variant     string `json:"variant,omitempty"`
}

type CampaignSendResult struct {
	CampaignID int   `json:"campaign_id"`
	Sent       int   `json:"sent"`
	Failed     int   `json:"failed"`
	Errors     []string `json:"errors,omitempty"`
}

type CampaignStats struct {
	CampaignID int `json:"campaign_id"`
	Sent       int `json:"sent"`
	Opened     int `json:"opened"`
	Clicked    int `json:"clicked"`
	OpenRate   float64 `json:"open_rate"`
	ClickRate  float64 `json:"click_rate"`
}
