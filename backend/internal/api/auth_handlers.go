package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"client-list-backend/internal/auth"
	"client-list-backend/internal/database"
	"client-list-backend/internal/models"
)

type AuthHandler struct {
	DB *database.DB
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string `json:"token"`
	User  struct {
		ID    int    `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"user"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)

	if req.Email == "" || req.Password == "" || req.Name == "" {
		jsonError(w, "Email, password, and name are required", http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		jsonError(w, "Password must be at least 6 characters", http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		jsonError(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	userID, err := h.DB.CreateUser(req.Email, hash, req.Name)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			jsonError(w, "Email already registered", http.StatusConflict)
			return
		}
		jsonError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	token, err := auth.GenerateToken(userID, req.Email, req.Name)
	if err != nil {
		jsonError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	resp := authResponse{Token: token}
	resp.User.ID = userID
	resp.User.Email = req.Email
	resp.User.Name = req.Name

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if req.Email == "" || req.Password == "" {
		jsonError(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	userID, hash, name, err := h.DB.GetUserByEmail(req.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			jsonError(w, "Invalid email or password", http.StatusUnauthorized)
			return
		}
		jsonError(w, "Failed to find user", http.StatusInternalServerError)
		return
	}

	if !auth.CheckPassword(req.Password, hash) {
		jsonError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	token, err := auth.GenerateToken(userID, req.Email, name)
	if err != nil {
		jsonError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	resp := authResponse{Token: token}
	resp.User.ID = userID
	resp.User.Email = req.Email
	resp.User.Name = name

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, _, _, err := h.getUserFromRequest(r)
	if err != nil {
		jsonError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	email, name, err := h.DB.GetUserByID(userID)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":    userID,
		"email": email,
		"name":  name,
	})
}

type saveRequest struct {
	Businesses []models.Business `json:"businesses"`
	Tags       string            `json:"tags"`
	Notes      string            `json:"notes"`
}

func (h *AuthHandler) SaveBusinesses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, _, _, err := h.getUserFromRequest(r)
	if err != nil {
		jsonError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req saveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Businesses) == 0 {
		jsonError(w, "No businesses to save", http.StatusBadRequest)
		return
	}

	count, err := h.DB.SaveBusinesses(userID, req.Businesses, req.Tags, req.Notes)
	if err != nil {
		jsonError(w, "Failed to save businesses", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"saved": count,
	})
}

func (h *AuthHandler) GetSaved(w http.ResponseWriter, r *http.Request) {
	userID, _, _, err := h.getUserFromRequest(r)
	if err != nil {
		jsonError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 20
	offset := 0
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if offsetStr != "" {
		fmt.Sscanf(offsetStr, "%d", &offset)
	}

	results, total, err := h.DB.GetUserSaved(userID, limit, offset)
	if err != nil {
		jsonError(w, "Failed to get saved businesses", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
		"total":   total,
		"limit":   limit,
		"offset":  offset,
	})
}

func (h *AuthHandler) DeleteSaved(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		jsonError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, _, _, err := h.getUserFromRequest(r)
	if err != nil {
		jsonError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		jsonError(w, "id is required", http.StatusBadRequest)
		return
	}

	var savedID int
	fmt.Sscanf(idStr, "%d", &savedID)

	if err := h.DB.DeleteUserSaved(userID, savedID); err != nil {
		jsonError(w, "Not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

func (h *AuthHandler) getUserFromRequest(r *http.Request) (int, string, string, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return 0, "", "", auth.ErrUnauthorized
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := auth.ValidateToken(tokenStr)
	if err != nil {
		return 0, "", "", err
	}

	return claims.UserID, claims.Email, claims.Name, nil
}
