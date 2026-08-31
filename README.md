# Client List Generator

A full-stack application to collect business contact information from Google Places API.

## Features

- Search businesses by query, location, and country
- Collect email, phone, address, website, Facebook page
- Export results to CSV
- Google Places API integration

## Project Structure

```
client-list/
├── frontend/          # Next.js frontend
│   ├── src/
│   │   ├── app/       # Pages and layouts
│   │   ├── components/# React components
│   │   ├── lib/       # API client utilities
│   │   └── types/     # TypeScript types
│   └── package.json
└── backend/           # Go backend
    ├── cmd/server/    # Main entry point
    ├── internal/
    │   ├── api/       # HTTP handlers
    │   ├── google/    # Google Places API client
    │   └── models/    # Data models
    └── go.mod
```

## Setup

### Prerequisites

- Node.js 18+
- Go 1.21+
- Google Cloud API Key with Places API enabled

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your Google API key
go run cmd/server/main.go
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Backend (.env)

- `GOOGLE_API_KEY` - Your Google Cloud API key
- `PORT` - Server port (default: 8080)

### Frontend (.env.local)

- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:8080)

## API Endpoints

- `POST /api/search` - Search businesses
- `POST /api/export` - Export results as CSV
- `GET /api/health` - Health check
# clist
