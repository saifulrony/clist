export interface Business {
  name: string;
  address: string;
  phone: string;
  website: string;
  email: string;
  facebook: string;
  country: string;
  latitude: number;
  longitude: number;
  rating: number;
  total_rating: number;
  place_id: string;
  category?: string;
  opening_hours?: string;
}

export interface SearchRequest {
  query: string;
  location?: string;
  country?: string;
  limit: number;
  source?: "google" | "bizdata" | "nominatim" | "geoapify" | "foursquare";
  scrape?: boolean;
  minRating?: number;
  sortBy?: "name" | "rating" | "none";
  removeDuplicates?: boolean;
  cities?: string[];
}

export interface SearchResponse {
  results: Business[];
  total: number;
  warning?: string;
}
