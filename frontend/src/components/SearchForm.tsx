"use client";

import { useState } from "react";
import { SearchRequest } from "@/types";
import CountrySelect from "./CountrySelect";
import CitySelect from "./CitySelect";

const categories = [
  "restaurant", "cafe", "bar", "hotel", "gym", "dentist", "doctor",
  "pharmacy", "bank", "supermarket", "hairdresser", "beauty",
  "real_estate", "lawyer", "coworking", "bakery", "car_dealer",
  "car_repair", "cinema", "clothing", "electronics", "florist",
  "furniture", "gallery", "gas_station", "guest_house", "hospital",
  "hostel", "insurance", "museum", "parking", "pet_shop", "school",
  "theatre", "university", "accountant", "bookstore",
  "domain", "hosting", "server", "it_company", "computer_repair",
  "software_company", "internet_cafe", "telecommunications",
  "web_design", "digital_marketing", "cloud_services", "cybersecurity",
  "data_center", "tech_startup", "it_consulting", "networking"
];

interface SearchFormProps {
  onSearch: (request: SearchRequest) => void;
  isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [searchMode, setSearchMode] = useState<"category" | "keyword">("category");
  const [query, setQuery] = useState("restaurant");
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("United States");
  const [limit, setLimit] = useState(20);
  const [source, setSource] = useState<"bizdata" | "nominatim" | "geoapify" | "foursquare" | "google">("bizdata");
  const [cityWarning, setCityWarning] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<"none" | "name" | "rating">("none");
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [bulkCities, setBulkCities] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scrape, setScrape] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (source === "bizdata" && !location.trim()) {
      setCityWarning(true);
      return;
    }
    setCityWarning(false);
    const fullLocation = location ? `${location}, ${country}` : country;
    const searchQuery = searchMode === "category" ? query : keyword;
    onSearch({
      query: searchQuery,
      location: fullLocation,
      country,
      limit,
      source,
      scrape,
      minRating,
      sortBy,
      removeDuplicates,
      cities: bulkCities
        ? bulkCities.split(",").map((c) => `${c.trim()}, ${country}`)
        : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Search Businesses</h2>
          <p className="text-xs text-slate-500">Find contact information for local businesses</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setSearchMode("category")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              searchMode === "category"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              By Category
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("keyword")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              searchMode === "keyword"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              By Keyword
            </span>
          </button>
        </div>

        <div className="flex flex-col">
          <label className="label">Data Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className="select-field"
          >
            <option value="bizdata">BizData (Free - Unlimited)</option>
            <option value="nominatim">OpenStreetMap (Free - Unlimited)</option>
            <option value="geoapify">Geoapify (Free - 3,000/day)</option>
            <option value="foursquare">Foursquare (Free - Limited)</option>
            <option value="google">Google (Requires API Key)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {searchMode === "category" ? (
          <div>
            <label className="label">Business Type</label>
            <select
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="select-field"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Keyword</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g., pizza, spa, fitness center"
              required
              className="input-field"
            />
          </div>
        )}
        <CitySelect country={country} value={location} onChange={(val) => { setLocation(val); setCityWarning(false); }} />
        {cityWarning && (
          <div className="col-span-full p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 animate-slide-down">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm text-amber-700 font-medium">BizData requires a city. Please select a city before searching.</p>
          </div>
        )}
        <CountrySelect value={country} onChange={setCountry} />
        <div>
          <label className="label">Result Limit</label>
          <div className="relative">
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              min={1}
              max={500}
              className="input-field pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
              max 500
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {showAdvanced ? "Hide Advanced Filters" : "Show Advanced Filters"}
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-5 p-5 bg-slate-50 rounded-xl border border-slate-200 animate-slide-down">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="label">Minimum Rating</label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="select-field"
              >
                <option value={0}>Any Rating</option>
                <option value={3}>3+ Stars</option>
                <option value={3.5}>3.5+ Stars</option>
                <option value={4}>4+ Stars</option>
                <option value={4.5}>4.5+ Stars</option>
              </select>
            </div>
            <div>
              <label className="label">Sort Results</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "none" | "name" | "rating")}
                className="select-field"
              >
                <option value="none">Default Order</option>
                <option value="name">Name (A-Z)</option>
                <option value="rating">Rating (High to Low)</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer group p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors w-full">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={removeDuplicates}
                    onChange={(e) => setRemoveDuplicates(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-500 transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Remove Duplicates</span>
              </label>
            </div>
          </div>
          <div className="mt-5">
            <label className="label">Bulk City Search</label>
            <input
              type="text"
              value={bulkCities}
              onChange={(e) => setBulkCities(e.target.value)}
              placeholder="Enter comma-separated cities: New York, Los Angeles, Chicago"
              className="input-field"
            />
            <p className="mt-1.5 text-xs text-slate-400">Search multiple cities at once. Leave empty to search only the selected city.</p>
          </div>
          <div className="mt-5">
            <label className="flex items-center gap-3 cursor-pointer group p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors w-full">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={scrape}
                  onChange={(e) => setScrape(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:bg-emerald-500 transition-colors" />
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
              </div>
              <div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Website Scraping</span>
                <p className="text-xs text-slate-400 mt-0.5">Visit business websites to extract email, phone & social links</p>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="mt-6">
        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="loading-spinner" />
              Searching...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search Businesses
            </>
          )}
        </button>
      </div>
    </form>
  );
}
