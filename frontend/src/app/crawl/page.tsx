"use client";

import React, { useState, useEffect, useCallback, Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import CitySelect from "@/components/CitySelect";
import CountrySelect from "@/components/CountrySelect";
import { STARTER_TEMPLATES, StarterTemplate } from "@/app/templates/starterTemplates";
import { compileToEmailHtml } from "@/app/templates/emailCompiler";
import VisualWysiwygEditor from "./VisualWysiwygEditor";

const CRAWL_SOURCES = [
  { id: "bizdata", name: "BizData (Free - Unlimited)", icon: "💰" },
  { id: "nominatim", name: "OpenStreetMap (Free - Unlimited)", icon: "🌍" },
  { id: "geoapify", name: "Geoapify (Free - 3,000/day)", icon: "📍" },
  { id: "foursquare", name: "Foursquare (Free - Limited)", icon: "🎯" },
  { id: "yellowpages", name: "Yellow Pages (Scraping)", icon: "📒" },
  { id: "yelp", name: "Yelp (Scraping)", icon: "🍽️" },
  { id: "google", name: "Google Places (Key)", icon: "🗺️" },
];

const CATEGORIES = [
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

const LOAD_MORE_STEPS = [20, 50, 100];

const OSM_UNSUPPORTED = ["hosting", "it_company", "web_design"];

interface CrawlJob {
  id: string;
  query: string;
  city: string;
  country: string;
  source: string;
  status: string;
  total_found: number;
  total_enriched: number;
  created_at: string;
  finished_at: string;
}

interface CrawlStats {
  total_businesses: number;
  total_cities: number;
  total_sources: number;
  by_source: Record<string, number>;
}

type Page = "dashboard" | "crawl" | "database" | "jobs" | "campaign" | "templates" | "landing-pages" | "webhooks" | "settings";

export default function CrawlPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading...</div>}>
      <CrawlPage />
    </Suspense>
  );
}

function CrawlPage() {
  const { user, token, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Page) || "dashboard";
  const [query, setQuery] = useState(searchParams.get("q") || "restaurant");
  const [keyword, setKeyword] = useState("");
  const [searchMode, setSearchMode] = useState<"category" | "keyword">("category");
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [country, setCountry] = useState(searchParams.get("country") || "United States");
  const [source, setSource] = useState(searchParams.get("source") || "bizdata");
  const [limit, setLimit] = useState(20);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<"none" | "name" | "rating">("none");
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [scrape, setScrape] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cityWarning, setCityWarning] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [currentJob, setCurrentJob] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<Page>(initialTab);
  const [apiBase, setApiBase] = useState(() => {
    if (typeof window !== "undefined") return `http://${window.location.hostname}:18001`;
    return "";
  });
  const [ready, setReady] = useState(false);
  const [jobResults, setJobResults] = useState<any[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [bulkCities, setBulkCities] = useState("");
  const [allResults, setAllResults] = useState<any[]>([]);
  const [displayResults, setDisplayResults] = useState<any[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      const currentUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/crawl";
      router.push(`/auth?redirect=${encodeURIComponent(currentUrl)}`);
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updatePage = (page: Page) => {
    if (page === "templates" || page === "landing-pages" || page === "webhooks") {
      window.location.href = `/${page}`;
      return;
    }
    setActivePage(page);
    setSidebarOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", page);
    window.history.replaceState({}, "", url.toString());
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/crawl/stats`);
      const data = await res.json();
      setStats(data);
    } catch {}
  }, [apiBase]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/crawl/categories`);
      const data = await res.json();
      setCategories(data || []);
    } catch {}
  }, [apiBase]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/crawl/jobs`);
      const data = await res.json();
      setJobs(data || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    if (ready && apiBase) {
      fetchStats();
      fetchJobs();
      fetchCategories();
    }
  }, [ready, apiBase, fetchStats, fetchJobs, fetchCategories]);

  useEffect(() => {
    if (!currentJob) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/api/crawl/status?id=${currentJob}`);
        const data = await res.json();
        setJobStatus(data);
        if (data.status === "done" || data.status === "error") {
          setIsCrawling(false);
          if (data.status === "done" && currentJob) {
            const rRes = await fetch(`${apiBase}/api/crawl/job-results?id=${currentJob}&limit=500`);
            const rData = await rRes.json();
            const newResults = rData.results || [];
            setJobResults(newResults);
            setAllResults(prev => {
              const existing = new Set(prev.map((b: any) => `${b.name}|${b.address}`));
              const unique = newResults.filter((b: any) => !existing.has(`${b.name}|${b.address}`));
              return [...prev, ...unique];
            });
          }
          setCurrentJob(null);
          fetchStats();
          fetchJobs();
          fetchCategories();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [currentJob, fetchStats, fetchJobs, fetchCategories, apiBase]);

  useEffect(() => {
    const start = (currentPage - 1) * pageSize;
    setDisplayResults(allResults.slice(start, start + pageSize));
  }, [allResults, currentPage, pageSize]);

  const totalPages = Math.ceil(allResults.length / pageSize);

  const handleExport = () => {
    if (allResults.length === 0) return;
    setExporting(true);
    try {
      const headers = ["Name", "Category", "Address", "Phone", "Email", "Website", "Facebook", "Rating", "Hours"];
      const rows = allResults.map((b: any) => [
        b.name || "",
        b.category || "",
        b.address || "",
        b.phone || "",
        b.email || "",
        b.website || "",
        b.facebook || "",
        b.rating || "",
        b.opening_hours || "",
      ]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crawl-${query}-${city || "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!user || !token || allResults.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/user/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businesses: allResults }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`Saved ${data.saved} businesses to your account!`);
    } catch (err: any) {
      alert("Save failed: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleCrawl = async () => {
    if (!city.trim() && !bulkCities.trim()) {
      setError("City is required for all crawl sources");
      return;
    }
    if (source === "bizdata" && !city.trim()) {
      setCityWarning(true);
      return;
    }
    setCityWarning(false);
    setError(null);
    setIsCrawling(true);
    setJobStatus(null);
    setJobResults([]);
    setAllResults([]);
    setDisplayResults([]);
    setCurrentPage(1);

    const searchQuery = searchMode === "category" ? query : keyword;
    const citiesToCrawl = bulkCities.trim()
      ? bulkCities.split(",").map(c => c.trim()).filter(c => c)
      : [city.trim()];

    try {
      for (const crawlCity of citiesToCrawl) {
        const res = await fetch(`${apiBase}/api/crawl`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            city: crawlCity,
            country,
            source,
            limit,
            scrape,
            minRating,
            sortBy,
            removeDuplicates,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || `Failed to start crawl for ${crawlCity}`);
          setIsCrawling(false);
          return;
        }
        setCurrentJob(data.job_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start crawl");
      setIsCrawling(false);
    }
  };

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>,
    },
    {
      id: "crawl",
      label: "New Crawl",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
    },
    {
      id: "database",
      label: "Database",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
    },
    {
      id: "jobs",
      label: "History",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      id: "campaign",
      label: "Campaign",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
    },
    {
      id: "templates",
      label: "Templates",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
    },
    {
      id: "landing-pages",
      label: "Landing Pages",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>,
    },
    {
      id: "webhooks",
      label: "Webhooks",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.318a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" /></svg>,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
  ];

  const totalBySource = stats ? Object.entries(stats.by_source || {}).sort((a, b) => b[1] - a[1]) : [];
  const recentJobs = jobs.slice(0, 5);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Checking authentication...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="card max-w-md w-full p-8 text-center space-y-4 animate-fade-in shadow-xl bg-white border border-slate-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
            🔒
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Authentication Required</h2>
            <p className="text-xs text-slate-500 mt-1">
              Please sign in to access the leads database and outreach workspace.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href={`/auth?redirect=${typeof window !== "undefined" ? encodeURIComponent(window.location.pathname + window.location.search) : "/crawl"}`}
              className="btn-primary w-full py-2.5 text-center text-xs font-bold"
            >
              Sign In to Continue →
            </Link>
            <Link
              href="/"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 py-1"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-200 lg:translate-x-0 ${sidebarMinimized ? "w-16" : "w-64"} ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            {!sidebarMinimized && (
              <div>
                <div className="text-sm font-bold text-slate-900">ClientList</div>
                <div className="text-[10px] text-slate-400">Directory Crawler</div>
              </div>
            )}
          </Link>
          <button
            onClick={() => setSidebarMinimized(!sidebarMinimized)}
            className="hidden lg:flex p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title={sidebarMinimized ? "Expand sidebar" : "Minimize sidebar"}
          >
            <svg className={`w-4 h-4 transition-transform ${sidebarMinimized ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => updatePage(item.id)}
              title={sidebarMinimized ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activePage === item.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              } ${sidebarMinimized ? "justify-center px-2" : ""}`}
            >
              {item.icon}
              {!sidebarMinimized && item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100 space-y-1">
          <Link href="/extension" title={sidebarMinimized ? "Browser Extension" : undefined} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors ${sidebarMinimized ? "justify-center px-2" : ""}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg>
            {!sidebarMinimized && "Browser Extension"}
          </Link>
          <Link href="/" title={sidebarMinimized ? "Back to Search" : undefined} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors ${sidebarMinimized ? "justify-center px-2" : ""}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
            {!sidebarMinimized && "Back to Search"}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-30">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            </button>

            <div className="flex-1" />

            {/* User Dropdown */}
            {user ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium text-slate-700">{user.name}</span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 animate-slide-down">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <div className="text-sm font-medium text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </div>
                    <Link href="/my-data" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" style={{ textDecoration: 'none' }}>
                      My Data
                    </Link>
                    <Link href="/" className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" style={{ textDecoration: 'none' }}>
                      Search Page
                    </Link>
                    <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth" className="btn-primary flex items-center gap-2 text-sm" style={{ textDecoration: 'none' }}>
                Sign In
              </Link>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 animate-slide-down">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Dashboard */}
          {activePage === "dashboard" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
                <p className="text-sm text-slate-500">Overview of your crawled business data</p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{stats?.total_businesses?.toLocaleString() || 0}</div>
                      <div className="text-xs text-slate-500">Total Businesses</div>
                    </div>
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{stats?.total_cities || 0}</div>
                      <div className="text-xs text-slate-500">Cities</div>
                    </div>
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{stats?.total_sources || 0}</div>
                      <div className="text-xs text-slate-500">Sources</div>
                    </div>
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{jobs.length}</div>
                      <div className="text-xs text-slate-500">Crawl Jobs</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Data by Source */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">Data by Source</h3>
                  {totalBySource.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-4">No data yet</div>
                  ) : (
                    <div className="space-y-3">
                      {totalBySource.map(([src, count]) => {
                        const pct = stats ? Math.round((count / stats.total_businesses) * 100) : 0;
                        return (
                          <div key={src}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-slate-600 capitalize">{src.replace(/_/g, " ")}</span>
                              <span className="font-semibold text-slate-900">{count.toLocaleString()}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                              <div className="bg-blue-500 rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top Categories */}
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">Top Categories</h3>
                  {categories.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-4">No data yet</div>
                  ) : (
                    <div className="space-y-2">
                      {categories.slice(0, 8).map((c) => (
                        <div key={c.category} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                          <span className="text-slate-600 capitalize">{c.category.replace(/_/g, " ")}</span>
                          <span className="font-semibold text-slate-900">{c.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Jobs */}
                <div className="card p-5 lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-900">Recent Crawl Jobs</h3>
                    {jobs.length > 5 && (
                      <button onClick={() => updatePage("jobs")} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        View All →
                      </button>
                    )}
                  </div>
                  {recentJobs.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-4">No crawl jobs yet</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 font-medium text-slate-500">Query</th>
                            <th className="text-left py-2 font-medium text-slate-500">City</th>
                            <th className="text-left py-2 font-medium text-slate-500">Source</th>
                            <th className="text-left py-2 font-medium text-slate-500">Status</th>
                            <th className="text-right py-2 font-medium text-slate-500">Found</th>
                            <th className="text-right py-2 font-medium text-slate-500">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentJobs.map((job) => (
                            <tr key={job.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-2.5 font-medium text-slate-900">{job.query}</td>
                              <td className="py-2.5 text-slate-600">{job.city}</td>
                              <td className="py-2.5 text-slate-600 capitalize">{job.source.replace(/_/g, " ")}</td>
                              <td className="py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  job.status === "done" ? "bg-green-100 text-green-700" :
                                  job.status === "error" ? "bg-red-100 text-red-700" :
                                  "bg-blue-100 text-blue-700"
                                }`}>
                                  {job.status}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-medium text-slate-900">{job.total_found}</td>
                              <td className="py-2.5 text-right text-slate-500">{job.created_at ? new Date(job.created_at).toLocaleDateString() : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* New Crawl */}
          {activePage === "crawl" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">New Crawl</h2>
                <p className="text-sm text-slate-500">Scrape business listings from popular directories</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="card p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Search & Crawl</h2>
                        <p className="text-xs text-slate-500">Find businesses and scrape contact info</p>
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
                          onChange={(e) => setSource(e.target.value)}
                          className="select-field"
                        >
                          {CRAWL_SOURCES.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        {(source === "yellowpages" || source === "yelp") && (
                          <p className="mt-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            These sites block server scraping. Use the <a href="/extension" className="underline font-medium">Chrome Extension</a> to extract data from these sources.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {searchMode === "category" ? (
                        <div>
                          <label className="label">Business Type</label>
                          <select value={query} onChange={(e) => setQuery(e.target.value)} className="select-field">
                            {CATEGORIES.map((cat) => (
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
                      <CitySelect country={country} value={city} onChange={(val) => { setCity(val); setCityWarning(false); }} />
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

                    {source === "nominatim" && OSM_UNSUPPORTED.includes(searchMode === "category" ? query : keyword) && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-start gap-2">
                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          <strong>{(searchMode === "category" ? query : keyword).replace(/_/g, " ")}</strong> is not tracked by OpenStreetMap. Try <strong>BizData</strong> or <strong>Google Places</strong> instead.
                        </span>
                      </div>
                    )}

                    <div className="mt-6">
                      <button
                        onClick={handleCrawl}
                        disabled={isCrawling || (!city.trim() && !bulkCities.trim())}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {isCrawling ? (
                          <>
                            <div className="loading-spinner" />
                            Crawling...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Start Crawl
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="card p-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Crawl Progress</h3>
                    {isCrawling && jobStatus ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm text-slate-600">Crawling in progress...</span>
                        </div>
                        <div className="text-sm text-slate-500">
                          Found: <span className="font-semibold text-blue-600">{jobStatus.total_found || 0}</span> businesses
                        </div>
                        <div className="text-sm text-slate-500">
                          Enriched: <span className="font-semibold text-green-600">{jobStatus.total_enriched || 0}</span> businesses
                        </div>
                      </div>
                    ) : jobStatus?.status === "done" ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <span className="text-sm font-medium text-green-700">Crawl Complete</span>
                        </div>
                        <div className="text-sm text-slate-500">
                          Found: <span className="font-semibold">{jobStatus.total_found || 0}</span> businesses
                        </div>
                        <div className="text-sm text-slate-500">
                          Enriched: <span className="font-semibold">{jobStatus.total_enriched || 0}</span> businesses
                        </div>
                      </div>
                    ) : jobStatus?.status === "error" ? (
                      <div className="text-sm text-red-600">{jobStatus.error || "Crawl failed"}</div>
                    ) : (
                      <div className="text-sm text-slate-400 text-center py-4">Start a crawl to see progress</div>
                    )}
                  </div>
                </div>
              </div>

              {jobResults.length > 0 && (
                <div className="card overflow-hidden animate-fade-in">
                  <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-green-50 to-white">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">
                            Crawl Results
                            <span className="text-sm font-normal text-slate-500 ml-2">({allResults.length} total)</span>
                          </h2>
                          <p className="text-xs text-slate-500">
                            Page {currentPage} of {totalPages} &middot; Showing {displayResults.length} of {allResults.length}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                          {LOAD_MORE_STEPS.map((size) => (
                            <button
                              key={size}
                              onClick={() => { setPageSize(size); setCurrentPage(1); }}
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                pageSize === size
                                  ? "bg-blue-500 text-white shadow-sm"
                                  : "text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                        {user && (
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            {saving ? "Saving..." : "Save"}
                          </button>
                        )}
                        <button
                          onClick={handleExport}
                          disabled={exporting}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {exporting ? "Exporting..." : "Export CSV"}
                        </button>
                        <button onClick={() => updatePage("database")} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                          View in Database →
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-4 py-3 font-medium text-slate-600">#</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Address</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Website</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayResults.map((biz: any, i: number) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-400 font-medium">{(currentPage - 1) * pageSize + i + 1}</td>
                            <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">{biz.name}</td>
                            <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{biz.address || "-"}</td>
                            <td className="px-4 py-3 text-slate-600">{biz.phone || "-"}</td>
                            <td className="px-4 py-3 text-slate-600">{biz.email || "-"}</td>
                            <td className="px-4 py-3 max-w-[150px] truncate">
                              {biz.website ? (
                                <a href={biz.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  {biz.website.replace(/^https?:\/\//, "").slice(0, 30)}
                                </a>
                              ) : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          Prev
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                          .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                            if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("ellipsis");
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, i) =>
                            item === "ellipsis" ? (
                              <span key={`e${i}`} className="px-2 text-slate-400">...</span>
                            ) : (
                              <button
                                key={item}
                                onClick={() => setCurrentPage(item as number)}
                                className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                                  currentPage === item
                                    ? "bg-blue-500 text-white shadow-sm"
                                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {item}
                              </button>
                            )
                          )}
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Database */}
          {activePage === "database" && (
            <DatabaseTab apiBase={apiBase} />
          )}

          {/* History */}
          {activePage === "jobs" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Crawl History</h2>
                <p className="text-sm text-slate-500">View all past crawl jobs</p>
              </div>
              <div className="card overflow-hidden">
                {jobs.length === 0 ? (
                  <div className="p-12 text-center text-sm text-slate-400">No crawl jobs yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Query</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">City</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Source</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Found</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Enriched</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{job.query}</td>
                            <td className="px-4 py-3 text-slate-600">{job.city}</td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{job.source.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                job.status === "done" ? "bg-green-100 text-green-700" :
                                job.status === "error" ? "bg-red-100 text-red-700" :
                                "bg-blue-100 text-blue-700"
                              }`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900">{job.total_found}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{job.total_enriched}</td>
                            <td className="px-4 py-3 text-slate-500">{job.created_at ? new Date(job.created_at).toLocaleDateString() : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Campaign */}
          {activePage === "campaign" && (
            <CampaignTab apiBase={apiBase} />
          )}

          {/* Settings */}
          {activePage === "settings" && (
            <SettingsTab apiBase={apiBase} />
          )}
        </main>
      </div>
    </div>
  );
}

const EXPORT_FIELDS = [
  { key: "name", label: "Name", default: true },
  { key: "category", label: "Category", default: true },
  { key: "address", label: "Address", default: true },
  { key: "phone", label: "Phone", default: true },
  { key: "email", label: "Email", default: true },
  { key: "email_status", label: "Email Status", default: true },
  { key: "decision_maker", label: "Decision Maker", default: true },
  { key: "linkedin", label: "LinkedIn", default: true },
  { key: "website", label: "Website", default: true },
  { key: "facebook", label: "Facebook", default: false },
  { key: "country", label: "Country", default: false },
  { key: "city", label: "City", default: false },
  { key: "rating", label: "Rating", default: false },
  { key: "total_rating", label: "Total Ratings", default: false },
  { key: "opening_hours", label: "Hours", default: false },
  { key: "source", label: "Source", default: false },
  { key: "created_at", label: "Collected", default: false },
];

function DatabaseTab({ apiBase }: { apiBase: string }) {
  const searchParams = useSearchParams();
  const router = typeof window !== "undefined" ? window.history : null;

  const [businesses, setBusinesses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [country, setCountry] = useState(searchParams.get("country") || "");
  const [countries, setCountries] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState(searchParams.get("city") || "");
  const [cities, setCities] = useState<string[]>([]);
  const [hasEmail, setHasEmail] = useState(searchParams.get("has_email") || "");
  const [hasPhone, setHasPhone] = useState(searchParams.get("has_phone") || "");
  const [hasWebsite, setHasWebsite] = useState(searchParams.get("has_website") || "");
  const [pipelineStage, setPipelineStage] = useState(searchParams.get("pipeline_stage") || "");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFields, setExportFields] = useState<Set<string>>(
    new Set(EXPORT_FIELDS.filter((f) => f.default).map((f) => f.key))
  );
  const [exporting, setExporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusiness, setEditBusiness] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newBusiness, setNewBusiness] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    city: "",
    country: "United States",
    category: "",
    pipeline_stage: "lead",
    decision_maker: "",
    linkedin: "",
    rating: 0,
    hours: "",
  });
  const catRef = useRef<HTMLDivElement>(null);
  const limit = 50;

  // Sync filters to URL
  const updateURL = useCallback((filters: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.set("tab", "database");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [searchParams]);

  const fetchCategories = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/crawl/categories`);
      const data = await res.json();
      setCategories(data || []);
    } catch {}
  }, [apiBase]);

  const fetchFilters = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/crawl/filters`);
      const data = await res.json();
      setCountries(data.countries || []);
      setCities(data.cities || []);
    } catch {}
  }, [apiBase]);

  const fetchData = useCallback(async () => {
    if (!apiBase) return;
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (search) params.set("q", search);
      if (category) params.set("category", category);
      if (country) params.set("country", country);
      if (filterCity) params.set("city", filterCity);
      if (hasEmail) params.set("has_email", hasEmail);
      if (hasPhone) params.set("has_phone", hasPhone);
      if (hasWebsite) params.set("has_website", hasWebsite);
      if (pipelineStage) params.set("pipeline_stage", pipelineStage);
      const url = `${apiBase}/api/crawl/search?${params}`;
      const res = await fetch(url);
      const data = await res.json();
      setBusinesses(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Database fetch error:", e);
    }
  }, [apiBase, page, search, category, country, filterCity, hasEmail, hasPhone, hasWebsite, pipelineStage]);

  useEffect(() => {
    fetchCategories();
    fetchFilters();
  }, [fetchCategories, fetchFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, category, search, country, filterCity, hasEmail, hasPhone, hasWebsite, pipelineStage]);

  const deleteBusiness = async (id: number) => {
    if (!confirm("Delete this business?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/business/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      fetchData();
    } catch (e) {
      alert("Failed to delete. Is the backend running on port 18001?");
    } finally {
      setDeleting(false);
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} businesses?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/business/delete-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) throw new Error("Delete failed");
      setSelected(new Set());
      fetchData();
    } catch (e) {
      alert("Failed to delete. Is the backend running on port 18001?");
    } finally {
      setDeleting(false);
    }
  };

  const deleteAll = async () => {
    const msg = category ? `Delete ALL ${category.replace(/_/g, " ")} businesses?` : "Delete ALL businesses? This cannot be undone.";
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      const body: any = category ? { source: category } : { all: true };
      const res = await fetch(`${apiBase}/api/business/delete-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Delete failed");
      setSelected(new Set());
      fetchData();
    } catch (e) {
      alert("Failed to delete. Is the backend running on port 18001?");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selected.size === businesses.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(businesses.map((b) => b.id)));
    }
  };

  const enrichEmails = async (all: boolean) => {
    const msg = all ? "Enrich emails for ALL businesses with websites? This visits each website." : `Enrich emails for ${selected.size} selected businesses?`;
    if (!confirm(msg)) return;
    setEnriching(true);
    try {
      const body = all ? { all: true } : { ids: Array.from(selected) };
      const res = await fetch(`${apiBase}/api/business/enrich-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Enrich failed");
      const data = await res.json();
      alert(`Done! Found ${data.results?.filter((r: any) => r.email).length || 0} emails out of ${data.enriched} checked.`);
      fetchData();
    } catch (e) {
      alert("Failed to enrich. Is the backend running?");
    } finally {
      setEnriching(false);
    }
  };

  const verifyEmails = async (all: boolean) => {
    const selectedIds = Array.from(selected);
    const msg = all || selectedIds.length === 0
      ? "Verify emails for unverified businesses? This checks MX records and performs an SMTP handshake probe."
      : `Verify emails for ${selectedIds.length} selected businesses?`;
    if (!confirm(msg)) return;

    setVerifying(true);
    try {
      const body = all || selectedIds.length === 0 ? { limit: 100 } : { business_ids: selectedIds };
      const res = await fetch(`${apiBase}/api/business/verify-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Email Verification Complete!\n\n• ${data.total_verified} Processed\n• ${data.valid} Valid\n• ${data.risky} Risky\n• ${data.invalid} Invalid`);
        fetchData();
      } else {
        alert("Failed to verify emails");
      }
    } catch (e) {
      alert("Verification connection failed");
    } finally {
      setVerifying(false);
    }
  };

  const verifySingleEmail = async (id: number, email: string) => {
    try {
      const res = await fetch(`${apiBase}/api/business/verify-email?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        alert(`Email: ${email}\nStatus: ${data.status.toUpperCase()}\nReason: ${data.reason}\nMX DNS: ${data.mx_exists ? "Found" : "None"}\nDisposable: ${data.disposable ? "Yes" : "No"}`);
        fetchData();
      }
    } catch (e) {
      alert("Verification check failed");
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newBusiness.name?.trim()) {
      alert("Business / Lead name is required");
      return;
    }
    setSavingNew(true);
    try {
      const res = await fetch(`${apiBase}/api/business/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBusiness),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create business");
      }
      fetchData();
      setAddOpen(false);
      setNewBusiness({
        name: "",
        address: "",
        phone: "",
        email: "",
        website: "",
        city: "",
        country: "United States",
        category: "",
        pipeline_stage: "lead",
        decision_maker: "",
        linkedin: "",
        rating: 0,
        hours: "",
      });
      alert("New business lead added to database successfully!");
    } catch (e: any) {
      alert(e.message || "Failed to create business");
    } finally {
      setSavingNew(false);
    }
  };

  const handleUpdate = async () => {
    if (!editBusiness || !editBusiness.id) return;
    try {
      const res = await fetch(`${apiBase}/api/business/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editBusiness),
      });
      if (!res.ok) throw new Error("Update failed");
      const data = await res.json();
      fetchData();
      setEditOpen(false);
      setEditBusiness(null);
      alert("Business updated successfully!");
    } catch (e) {
      alert("Failed to update. Is the backend running?");
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const totalAll = categories.reduce((sum, c) => sum + c.count, 0);
  const selectedLabel = category ? category.replace(/_/g, " ") : "All Categories";
  const activeFilters = [country && `Country: ${country}`, filterCity && `City: ${filterCity}`, hasEmail === "1" && "Has Email", hasPhone === "1" && "Has Phone", hasWebsite === "1" && "Has Website", pipelineStage && `Stage: ${pipelineStage}`].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Database</h2>
          <p className="text-sm text-slate-500">Browse and filter all collected businesses</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="btn-primary py-2 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer self-start sm:self-auto hover:-translate-y-0.5 transition-all"
        >
          <span className="text-base leading-none">＋</span>
          <span>Add New Lead</span>
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 flex-shrink-0">
                {category ? (
                  <span className="capitalize">{category.replace(/_/g, " ")}</span>
                ) : (
                  "All Businesses"
                )}
                <span className="text-xs sm:text-sm font-normal text-slate-500 ml-2">({total.toLocaleString()})</span>
              </h2>
              <div className="flex-1" />
              <div className="flex items-center gap-2">
                {/* Category Dropdown */}
                <div ref={catRef} className="relative">
                  <button
                    onClick={() => setCatOpen(!catOpen)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 transition-colors min-w-[140px]"
                  >
                    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                    <span className="truncate capitalize">{selectedLabel}</span>
                    <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${catOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  {catOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 animate-slide-down max-h-[320px] overflow-y-auto">
                      <button
                        onClick={() => { setCategory(""); setPage(0); setCatOpen(false); updateURL({ category: "" }); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                          category === "" ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>All Categories</span>
                        <span className="text-xs text-slate-400">{totalAll.toLocaleString()}</span>
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c.category}
                          onClick={() => { setCategory(c.category); setPage(0); setCatOpen(false); updateURL({ category: c.category }); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between capitalize ${
                            category === c.category ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <span className="truncate">{c.category.replace(/_/g, " ")}</span>
                          <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{c.count.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search */}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); updateURL({ q: e.target.value }); }}
                  placeholder="Search..."
                  className="input-field w-full sm:w-48"
                />
              </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Filters:</span>

              {/* Country */}
              <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); updateURL({ country: e.target.value }); }} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
                <option value="">All Countries</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* City */}
              <select value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setPage(0); updateURL({ city: e.target.value }); }} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
                <option value="">All Cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Has Email */}
              <select value={hasEmail} onChange={(e) => { setHasEmail(e.target.value); setPage(0); updateURL({ has_email: e.target.value }); }} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
                <option value="">Email: Any</option>
                <option value="1">Has Email</option>
                <option value="0">No Email</option>
              </select>

              {/* Has Phone */}
              <select value={hasPhone} onChange={(e) => { setHasPhone(e.target.value); setPage(0); updateURL({ has_phone: e.target.value }); }} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
                <option value="">Phone: Any</option>
                <option value="1">Has Phone</option>
                <option value="0">No Phone</option>
              </select>

              {/* Has Website */}
              <select value={hasWebsite} onChange={(e) => { setHasWebsite(e.target.value); setPage(0); updateURL({ has_website: e.target.value }); }} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
                <option value="">Website: Any</option>
                <option value="1">Has Website</option>
                <option value="0">No Website</option>
              </select>

              {/* Pipeline Stage */}
              <select
                value={pipelineStage}
                onChange={(e) => { setPipelineStage(e.target.value); setPage(0); updateURL({ pipeline_stage: e.target.value }); }}
                className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium"
              >
                <option value="">Pipeline: All</option>
                <option value="hot_lead">🔥 Hot Lead</option>
                <option value="meeting_booked">📅 Meeting Booked</option>
                <option value="replied">💬 Replied</option>
                <option value="contacted">📞 Contacted</option>
                <option value="lead">🌱 New Lead</option>
              </select>

              {activeFilters.length > 0 && (
                <button
                  onClick={() => { setCountry(""); setFilterCity(""); setHasEmail(""); setHasPhone(""); setHasWebsite(""); setPipelineStage(""); setPage(0); updateURL({ country: "", city: "", has_email: "", has_phone: "", has_website: "", pipeline_stage: "" }); }}
                  className="px-2 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 border border-red-200"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>
        {businesses.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-sm text-slate-400">No data yet. Start a crawl to collect businesses.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={businesses.length > 0 && selected.size === businesses.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Address</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Email & Verification</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Decision Maker</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Website & Social</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Collected</th>
                    <th className="w-10 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((biz, i) => (
                    <tr key={biz.id || i} className={`border-b border-slate-100 transition-colors ${selected.has(biz.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(biz.id)}
                          onChange={() => toggleSelect(biz.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{biz.name}</td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{biz.category?.replace(/_/g, " ") || "-"}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{biz.address || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{biz.phone || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {biz.email ? (
                          <div className="space-y-1">
                            <div className="font-mono text-xs text-slate-900">{biz.email}</div>
                            <div className="flex items-center gap-1.5">
                              {biz.email_status === "valid" && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-green-100 text-green-700">
                                  ✓ Valid
                                </span>
                              )}
                              {biz.email_status === "risky" && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                                  ⚠️ Risky
                                </span>
                              )}
                              {biz.email_status === "invalid" && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                  ✕ Invalid
                                </span>
                              )}
                              {(!biz.email_status || biz.email_status === "unverified") && (
                                <button
                                  onClick={() => verifySingleEmail(biz.id, biz.email)}
                                  className="text-[10px] text-blue-600 hover:underline font-semibold"
                                >
                                  Verify
                                </button>
                              )}
                            </div>
                          </div>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {biz.decision_maker ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-xs text-slate-800">👤 {biz.decision_maker}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[170px] truncate">
                        <div className="space-y-0.5">
                          {biz.website && (
                            <div>
                              <a href={biz.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                {biz.website.replace(/^https?:\/\//, "").slice(0, 25)}
                              </a>
                            </div>
                          )}
                          {biz.linkedin && (
                            <div>
                              <a href={biz.linkedin} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-700 font-bold hover:underline inline-flex items-center gap-0.5">
                                LinkedIn ↗
                              </a>
                            </div>
                          )}
                          {!biz.website && !biz.linkedin && "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{biz.source || "-"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{biz.created_at ? new Date(biz.created_at).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={biz.pipeline_stage || ""}
                          onChange={async (e) => {
                            const stage = e.target.value;
                            try {
                              await fetch(`${apiBase}/api/business/pipeline`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: biz.id, stage }),
                              });
                              biz.pipeline_stage = stage;
                            } catch (err) {}
                          }}
                          className={`text-xs font-semibold rounded-lg px-2 py-1 border outline-none cursor-pointer ${
                            biz.pipeline_stage === "hot_lead" ? "bg-red-100 text-red-700 border-red-200"
                            : biz.pipeline_stage === "meeting_booked" ? "bg-blue-100 text-blue-700 border-blue-200"
                            : biz.pipeline_stage === "replied" ? "bg-green-100 text-green-700 border-green-200"
                            : biz.pipeline_stage === "contacted" ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          <option value="">— No Stage</option>
                          <option value="contacted">📞 Contacted</option>
                          <option value="replied">💬 Replied</option>
                          <option value="hot_lead">🔥 Hot Lead</option>
                          <option value="meeting_booked">📅 Meeting Booked</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setEditBusiness(biz); setEditOpen(true); }}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors mr-1"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 012 1l4.59 4.59a2 2 0 010 2.82l-6.17 6.17a2 2 0 01-2.82 0L4 12.82a2 2 0 010-2.82L11 4zM8.41 6.59L19.59 17.58M8.41 17.59L19.59 6.58" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteBusiness(biz.id)}
                          disabled={deleting}
                          className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">
                  Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total.toLocaleString()}
                </span>
                {selected.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    disabled={deleting}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete {selected.size}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selected.size > 0 ? (
                  <button
                    onClick={() => enrichEmails(false)}
                    disabled={enriching}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 border border-purple-200"
                  >
                    {enriching ? "Enriching..." : `Find Emails (${selected.size})`}
                  </button>
                ) : (
                  <button
                    onClick={() => enrichEmails(true)}
                    disabled={enriching || total === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-40 border border-purple-200"
                  >
                    {enriching ? "Enriching..." : "Find Emails (All)"}
                  </button>
                )}
                {selected.size > 0 ? (
                  <button
                    onClick={() => verifyEmails(false)}
                    disabled={verifying}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 border border-blue-200 flex items-center gap-1.5 transition-all shadow-xs"
                    title="Verify selected emails with MX and SMTP probe"
                  >
                    <span>🛡️</span>
                    <span>{verifying ? "Verifying..." : `Verify (${selected.size})`}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => verifyEmails(true)}
                    disabled={verifying || total === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 border border-blue-200 flex items-center gap-1.5 transition-all shadow-xs"
                    title="Verify unverified emails in database"
                  >
                    <span>🛡️</span>
                    <span>{verifying ? "Verifying..." : "Verify Emails"}</span>
                  </button>
                )}
                <button
                  onClick={() => setExportOpen(true)}
                  disabled={total === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-40 border border-green-200 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export CSV
                </button>
                <button
                  onClick={deleteAll}
                  disabled={deleting || total === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete All
                </button>
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= total}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Export Modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExportOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Export CSV</h3>
              <button onClick={() => setExportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Select which fields to include in the CSV file:</p>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {EXPORT_FIELDS.map((field) => (
                <label key={field.key} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportFields.has(field.key)}
                    onChange={(e) => {
                      const next = new Set(exportFields);
                      if (e.target.checked) next.add(field.key);
                      else next.delete(field.key);
                      setExportFields(next);
                    }}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="text-sm text-slate-700">{field.label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center mt-6">
              <button
                onClick={() => setExportFields(new Set(EXPORT_FIELDS.map((f) => f.key)))}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Select All
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setExportOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setExporting(true);
                    const fields = EXPORT_FIELDS.filter((f) => exportFields.has(f.key));
                    const headers = fields.map((f) => f.label);
                    const getVal = (biz: any, key: string) => {
                      const v = biz[key];
                      if (v === undefined || v === null) return "";
                      if (key === "rating") return Number(v).toFixed(1);
                      if (key === "created_at") return v ? new Date(v).toLocaleDateString() : "";
                      return String(v);
                    };
                    const rows = businesses.map((biz) => fields.map((f) => getVal(biz, f.key)));
                    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `database-export.csv`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    setExporting(false);
                    setExportOpen(false);
                  }}
                  disabled={exportFields.size === 0 || exporting}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
                >
                  {exporting ? "Exporting..." : `Export ${businesses.length} rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && editBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setEditOpen(false); setEditBusiness(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit Business</h3>
              <button onClick={() => { setEditOpen(false); setEditBusiness(null); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input type="text" value={editBusiness.name || ""} onChange={(e) => setEditBusiness({ ...editBusiness, name: e.target.value })} className="input-field w-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <input type="text" value={editBusiness.address || ""} onChange={(e) => setEditBusiness({ ...editBusiness, address: e.target.value })} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="text" value={editBusiness.phone || ""} onChange={(e) => setEditBusiness({ ...editBusiness, phone: e.target.value })} className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="text" value={editBusiness.email || ""} onChange={(e) => setEditBusiness({ ...editBusiness, email: e.target.value })} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                  <input type="text" value={editBusiness.website || ""} onChange={(e) => setEditBusiness({ ...editBusiness, website: e.target.value })} className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Facebook</label>
                  <input type="text" value={editBusiness.facebook || ""} onChange={(e) => setEditBusiness({ ...editBusiness, facebook: e.target.value })} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input type="text" value={editBusiness.category || ""} onChange={(e) => setEditBusiness({ ...editBusiness, category: e.target.value })} className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                  <input type="text" value={editBusiness.country || ""} onChange={(e) => setEditBusiness({ ...editBusiness, country: e.target.value })} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input type="text" value={editBusiness.city || ""} onChange={(e) => setEditBusiness({ ...editBusiness, city: e.target.value })} className="input-field w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rating</label>
                  <input type="number" step="0.1" value={editBusiness.rating || ""} onChange={(e) => setEditBusiness({ ...editBusiness, rating: parseFloat(e.target.value) || 0 })} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                  <input type="text" value={editBusiness.source || ""} onChange={(e) => setEditBusiness({ ...editBusiness, source: e.target.value })} className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hours</label>
                <input type="text" value={editBusiness.hours || ""} onChange={(e) => setEditBusiness({ ...editBusiness, hours: e.target.value })} className="input-field w-full" />
              </div>
              <button
                onClick={handleUpdate}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Lead Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto animate-slide-down" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>➕</span>
                  <span>Add New Lead to Database</span>
                </h3>
                <p className="text-xs text-slate-500">Manually insert a business record into your CRM</p>
              </div>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business / Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Downtown Dental Care"
                  value={newBusiness.name}
                  onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })}
                  className="input-field w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="contact@company.com"
                    value={newBusiness.email}
                    onChange={(e) => setNewBusiness({ ...newBusiness, email: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+1 555-0199"
                    value={newBusiness.phone}
                    onChange={(e) => setNewBusiness({ ...newBusiness, phone: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Website URL</label>
                  <input
                    type="text"
                    placeholder="https://company.com"
                    value={newBusiness.website}
                    onChange={(e) => setNewBusiness({ ...newBusiness, website: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category / Niche</label>
                  <input
                    type="text"
                    placeholder="e.g., dentist, restaurant"
                    value={newBusiness.category}
                    onChange={(e) => setNewBusiness({ ...newBusiness, category: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    placeholder="e.g., New York"
                    value={newBusiness.city}
                    onChange={(e) => setNewBusiness({ ...newBusiness, city: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                  <input
                    type="text"
                    placeholder="United States"
                    value={newBusiness.country}
                    onChange={(e) => setNewBusiness({ ...newBusiness, country: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
                <input
                  type="text"
                  placeholder="123 Main St, Suite 400"
                  value={newBusiness.address}
                  onChange={(e) => setNewBusiness({ ...newBusiness, address: e.target.value })}
                  className="input-field w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pipeline Stage</label>
                  <select
                    value={newBusiness.pipeline_stage}
                    onChange={(e) => setNewBusiness({ ...newBusiness, pipeline_stage: e.target.value })}
                    className="input-field w-full cursor-pointer"
                  >
                    <option value="lead">🌱 New Lead</option>
                    <option value="contacted">📞 Contacted</option>
                    <option value="replied">💬 Replied</option>
                    <option value="hot_lead">🔥 Hot Lead</option>
                    <option value="meeting_booked">📅 Meeting Booked</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Decision Maker</label>
                  <input
                    type="text"
                    placeholder="e.g., Dr. Sarah Jenkins"
                    value={newBusiness.decision_maker}
                    onChange={(e) => setNewBusiness({ ...newBusiness, decision_maker: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">LinkedIn Profile</label>
                  <input
                    type="text"
                    placeholder="https://linkedin.com/in/..."
                    value={newBusiness.linkedin}
                    onChange={(e) => setNewBusiness({ ...newBusiness, linkedin: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rating (0 - 5)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    placeholder="4.8"
                    value={newBusiness.rating || ""}
                    onChange={(e) => setNewBusiness({ ...newBusiness, rating: parseFloat(e.target.value) || 0 })}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={savingNew}
                  className="btn-primary py-2 px-5 text-xs font-bold shadow-md shadow-blue-500/25 cursor-pointer disabled:opacity-50"
                >
                  {savingNew ? "Saving Lead..." : "Save to Database"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignTab({ apiBase }: { apiBase: string }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", subject: "", body: "", sender_email: "" });
  const [stats, setStats] = useState<any>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [scheduleType, setScheduleType] = useState<"now" | "later">("now");
  const [scheduledDateTime, setScheduledDateTime] = useState<string>("");

  // Recipient selection state
  const [recipientTab, setRecipientTab] = useState<"database" | "import">("database");
  const [dbSearch, setDbSearch] = useState("");
  const [dbLoading, setDbLoading] = useState(false);
  const [allBusinesses, setAllBusinesses] = useState<any[]>([]);
  const [totalWithEmail, setTotalWithEmail] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Manual email import state
  const [importEmails, setImportEmails] = useState("");
  const [importedList, setImportedList] = useState<{ email: string; name: string }[]>([]);

  // Step tracking: 1 = select recipients, 2 = compose campaign
  const [step, setStep] = useState<1 | 2>(1);
  const [savedTemplates, setSavedTemplates] = useState<any[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [starterCategory, setStarterCategory] = useState<string>("all");
  const [starterSearch, setStarterSearch] = useState<string>("");
  const [previewTemplateData, setPreviewTemplateData] = useState<{ title: string; subject: string; html: string; onApply?: () => void } | null>(null);
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null);
  const [bodyViewMode, setBodyViewMode] = useState<"visual" | "html">("visual");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [bodyBViewMode, setBodyBViewMode] = useState<"visual" | "html">("visual");

  const STARTER_CATEGORIES = [
    { id: "all", label: "All Presets", icon: "✨", desc: "Browse all pre-designed email templates" },
    { id: "outreach", label: "Cold Outreach", icon: "🎯", desc: "High-converting B2B cold outreach & sales emails" },
    { id: "promotion", label: "Promotions & Sales", icon: "🏷️", desc: "Product launches, discount offers & flash deals" },
    { id: "newsletter", label: "Newsletters", icon: "📰", desc: "Company updates, roundups & product blogs" },
    { id: "follow-up", label: "Follow-ups", icon: "⏳", desc: "Meeting recaps, re-engagements & reminders" },
    { id: "general", label: "Minimal & Blank", icon: "📝", desc: "Start fresh or use clean basic layouts" },
    { id: "saved", label: "My Saved Templates", icon: "💾", desc: "Custom templates saved to your account" },
  ];

  const filteredStarters = STARTER_TEMPLATES.filter((s) => {
    const matchCat = starterCategory === "all" || s.category === starterCategory;
    const matchSearch =
      !starterSearch ||
      s.name.toLowerCase().includes(starterSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(starterSearch.toLowerCase()) ||
      s.subject.toLowerCase().includes(starterSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredSaved = savedTemplates.filter((t) => {
    return (
      !starterSearch ||
      t.name.toLowerCase().includes(starterSearch.toLowerCase()) ||
      (t.subject && t.subject.toLowerCase().includes(starterSearch.toLowerCase())) ||
      (t.category && t.category.toLowerCase().includes(starterSearch.toLowerCase()))
    );
  });

  const applyStarterTemplate = (starter: StarterTemplate) => {
    try {
      const html = compileToEmailHtml({
        blocks: starter.blocks,
        settings: starter.settings,
        subject: starter.subject,
      });
      setForm((f) => ({
        ...f,
        subject: starter.subject || f.subject,
        body: html,
      }));
      setLoadedTemplateName(starter.name);
      setBodyViewMode("visual");
      setShowTemplatePicker(false);
      setPreviewTemplateData(null);
    } catch (err) {
      alert("Failed to compile starter template");
    }
  };

  const applySavedTemplate = (tmpl: any) => {
    setForm((f) => ({
      ...f,
      subject: tmpl.subject || f.subject,
      body: tmpl.body || f.body,
    }));
    setLoadedTemplateName(tmpl.name);
    setBodyViewMode("visual");
    setShowTemplatePicker(false);
    setPreviewTemplateData(null);
  };

  // A/B Test state
  const [isAbTest, setIsAbTest] = useState(false);
  const [subjectB, setSubjectB] = useState("");
  const [bodyB, setBodyB] = useState("");
  const [showAbStats, setShowAbStats] = useState(false);
  const [abStats, setAbStats] = useState<any>(null);

  // Sequence / Drip steps
  const [showStepsModal, setShowStepsModal] = useState(false);
  const [stepsForCampaign, setStepsForCampaign] = useState<number | null>(null);
  const [campaignSteps, setCampaignSteps] = useState<any[]>([]);
  const [newStep, setNewStep] = useState({ delay_days: 3, subject: "", body: "" });

  // Confirmation & Status Modals (replacing browser alerts)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    type: "success" | "error" | "warning";
    title: string;
    message: string;
  } | null>(null);

  // Live Streaming (Forex-market style real-time ticker)
  const [liveAutoSync, setLiveAutoSync] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [flashingMetrics, setFlashingMetrics] = useState<Record<number, Record<string, boolean>>>({});
  const campaignsRef = useRef<any[]>([]);

  // Filter & Search state for campaigns
  const [campaignSearch, setCampaignSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (apiBase) {
      fetchCampaigns(false);
      fetchBusinesses("");
      fetch(`${apiBase}/api/templates`)
        .then((r) => r.json())
        .then((data) => setSavedTemplates(data || []))
        .catch(() => {});
      fetch(`${apiBase}/api/settings`)
        .then((r) => r.json())
        .then((data) => {
          if (data && (data.smtp_from || data.smtp_username)) {
            setForm((prev) => ({
              ...prev,
              sender_email: prev.sender_email || data.smtp_from || data.smtp_username,
            }));
          }
        })
        .catch(() => {});
    }
  }, [apiBase]);

  const fetchCampaigns = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setIsSyncing(true);
    try {
      const res = await fetch(`${apiBase}/api/campaigns`);
      if (res.ok) {
        const newCampaigns: any[] = await res.json();

        // Detect live metric changes (forex tick animations)
        const previous = campaignsRef.current;
        if (previous.length > 0) {
          const newFlashes: Record<number, Record<string, boolean>> = {};
          let hasAnyChanges = false;

          for (const next of newCampaigns) {
            const prev = previous.find((p) => p.id === next.id);
            if (prev) {
              const diffs: Record<string, boolean> = {};
              if (prev.sent_count !== next.sent_count) {
                diffs.sent = true;
                hasAnyChanges = true;
              }
              if (prev.opened_count !== next.opened_count) {
                diffs.opened = true;
                hasAnyChanges = true;
              }
              if (prev.clicked_count !== next.clicked_count) {
                diffs.clicked = true;
                hasAnyChanges = true;
              }
              if (prev.status !== next.status) {
                diffs.status = true;
                hasAnyChanges = true;
              }
              if (Object.keys(diffs).length > 0) {
                newFlashes[next.id] = diffs;
              }
            }
          }

          if (hasAnyChanges) {
            setFlashingMetrics(newFlashes);
            setTimeout(() => {
              setFlashingMetrics({});
            }, 2200);
          }
        }

        campaignsRef.current = newCampaigns;
        setCampaigns(newCampaigns);
        setLastSyncTime(new Date());
      }
    } catch (e) {
      console.warn("Live campaign sync error", e);
    }
    if (!isBackground) setLoading(false);
    setIsSyncing(false);
  };

  // Real-Time Server-Sent Events (SSE) Listener:
  // ZERO continuous polling! Fetches ONLY when the server signals an actual data change.
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!apiBase) return;

    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`${apiBase}/api/campaigns/stream`);

      eventSource.addEventListener("connected", () => {
        setSseConnected(true);
      });

      eventSource.addEventListener("change", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          // An actual change happened in the database -> fetch updated campaigns!
          fetchCampaigns(true);

          // If stats details modal is open and belongs to this campaign, refresh it too
          if (selectedCampaign && (!payload.campaign_id || payload.campaign_id === selectedCampaign)) {
            Promise.all([
              fetch(`${apiBase}/api/campaigns/${selectedCampaign}/stats`),
              fetch(`${apiBase}/api/campaigns/${selectedCampaign}/recipients?limit=50`),
            ])
              .then(async ([statsRes, recipientsRes]) => {
                if (statsRes.ok) setStats(await statsRes.json());
                if (recipientsRes.ok) {
                  const rData = await recipientsRes.json();
                  setRecipients(rData.recipients || []);
                }
              })
              .catch(() => {});
          }
        } catch (err) {
          fetchCampaigns(true);
        }
      });

      eventSource.onerror = () => {
        setSseConnected(false);
      };
    } catch (err) {
      console.warn("SSE connection error", err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [apiBase, selectedCampaign]);

  const fetchBusinesses = async (q: string) => {
    setDbLoading(true);
    try {
      const url = q
        ? `${apiBase}/api/campaigns/businesses?q=${encodeURIComponent(q)}`
        : `${apiBase}/api/campaigns/businesses`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAllBusinesses(data.businesses || []);
        setTotalWithEmail(data.total || 0);
      }
    } catch (e) {}
    setDbLoading(false);
  };

  const toggleBusiness = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === allBusinesses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allBusinesses.map((b: any) => b.id)));
    }
  };

  const parseImportedEmails = () => {
    const lines = importEmails.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    const parsed: { email: string; name: string }[] = [];
    for (const line of lines) {
      const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        const email = emailMatch[0];
        const name = line.replace(email, "").replace(/[<>()[\]"]/g, "").trim() || email.split("@")[0];
        parsed.push({ email, name });
      }
    }
    setImportedList(parsed);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      // Split by newlines
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const parsed: { email: string; name: string }[] = [];
      
      for (const line of lines) {
        // Try to find email in the line
        const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
          const email = emailMatch[0];
          // Try to extract name from other columns
          const parts = line.split(/[,\t;|]/).map(p => p.trim().replace(/"/g, ''));
          let name = email.split("@")[0];
          
          // Look for a non-email part that could be a name
          for (const part of parts) {
            if (part && part !== email && !part.includes("@") && part.length > 1) {
              name = part;
              break;
            }
          }
          
          parsed.push({ email, name });
        }
      }
      
      if (parsed.length > 0) {
        setImportedList(prev => [...prev, ...parsed]);
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
  };

  const removeImportedEmail = (idx: number) => {
    setImportedList(importedList.filter((_, i) => i !== idx));
  };

  const getTotalSelected = () => {
    if (recipientTab === "database") return selectedIds.size;
    return importedList.length;
  };

  // Validate and open confirmation modal
  const handleInitiateSend = () => {
    if (!form.name || !form.subject || !form.body || !form.sender_email) {
      setStatusNotice({
        type: "warning",
        title: "Missing Required Fields",
        message: "Please ensure campaign name, subject line, email body, and sender email are all filled out.",
      });
      return;
    }
    const total = getTotalSelected();
    if (total === 0) {
      setStatusNotice({
        type: "warning",
        title: "No Recipients Selected",
        message: "Please select at least one recipient business from the database or enter recipient email addresses.",
      });
      return;
    }
    if (scheduleType === "later") {
      if (!scheduledDateTime) {
        setStatusNotice({
          type: "warning",
          title: "Select Delivery Date & Time",
          message: "Please select a target date and time for the scheduled delivery.",
        });
        return;
      }
      const selectedTime = new Date(scheduledDateTime).getTime();
      if (selectedTime <= Date.now()) {
        setStatusNotice({
          type: "warning",
          title: "Schedule Must Be in Future",
          message: "The scheduled delivery date and time must be in the future.",
        });
        return;
      }
    }

    // Open confirmation modal!
    setShowConfirmModal(true);
  };

  // Confirmed execution from modal
  const executeCampaignSend = async () => {
    setShowConfirmModal(false);
    const total = getTotalSelected();

    try {
      const formattedScheduledAt =
        scheduleType === "later" && scheduledDateTime
          ? scheduledDateTime.replace("T", " ") + ":00"
          : "";

      // 1. Create campaign record (always draft initially so send handler can populate recipients)
      const res = await fetch(`${apiBase}/api/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduled_at: formattedScheduledAt,
          status: "draft",
          subject_b: isAbTest ? subjectB : "",
          body_b: isAbTest ? bodyB : "",
          is_ab_test: isAbTest ? 1 : 0,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setStatusNotice({
          type: "error",
          title: "Failed to Create Campaign",
          message: errData.error || "The server rejected the campaign creation request.",
        });
        return;
      }
      const { id } = await res.json();

      let body;
      if (recipientTab === "database") {
        if (selectedIds.size === 0) {
          setStatusNotice({
            type: "warning",
            title: "No Recipients Selected",
            message: "Please select at least one recipient business from the list.",
          });
          return;
        }
        body = JSON.stringify({ business_ids: Array.from(selectedIds) });
      } else {
        if (importedList.length === 0) {
          setStatusNotice({
            type: "warning",
            title: "No Recipients Selected",
            message: "Please enter or import at least one recipient email address.",
          });
          return;
        }
        body = JSON.stringify({ emails: importedList.map((e) => ({ email: e.email, name: e.name })) });
      }

      setSending(id);
      const sendRes = await fetch(`${apiBase}/api/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await sendRes.json().catch(() => ({}));

      if (sendRes.ok) {
        setStatusNotice({
          type: "success",
          title: scheduleType === "later" ? "Campaign Scheduled Successfully!" : "Campaign Launched & Delivering!",
          message:
            scheduleType === "later"
              ? `Delivery scheduled for ${new Date(scheduledDateTime).toLocaleString()}! ${data.queued || total} recipient(s) are queued in the background scheduler.`
              : (data.message || `Campaign has started sending! ${data.queued || total} recipient(s) are queued for immediate delivery.`),
        });

        setForm({ name: "", subject: "", body: "", sender_email: "" });
        setScheduleType("now");
        setScheduledDateTime("");
        setSelectedIds(new Set());
        setImportedList([]);
        setImportEmails("");
        setStep(1);
        setShowForm(false);
        fetchCampaigns();
      } else {
        setStatusNotice({
          type: "error",
          title: "Campaign Delivery Notice",
          message: data.error || "Failed to process campaign delivery.",
        });
      }
      setSending(null);
    } catch (e: any) {
      setSending(null);
      setStatusNotice({
        type: "error",
        title: "Connection Error",
        message: e?.message || "Failed to communicate with the campaign server.",
      });
    }
  };

  const viewStats = async (id: number) => {
    setSelectedCampaign(id);
    try {
      const [statsRes, recipientsRes] = await Promise.all([
        fetch(`${apiBase}/api/campaigns/${id}/stats`),
        fetch(`${apiBase}/api/campaigns/${id}/recipients?limit=50`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (recipientsRes.ok) {
        const data = await recipientsRes.json();
        setRecipients(data.recipients || []);
      }
    } catch (e) {}
  };

  const deleteCampaign = async (id: number) => {
    if (!confirm("Delete this campaign?")) return;
    try {
      await fetch(`${apiBase}/api/campaigns/${id}`, { method: "DELETE" });
      fetchCampaigns();
    } catch (e) {}
  };

  const retryCampaign = async (id: number) => {
    if (!confirm("Retry sending this campaign?")) return;
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${id}/retry`, { method: "POST" });
      if (res.ok) {
        fetchCampaigns();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to retry");
      }
    } catch (e) {
      alert("Failed to retry campaign");
    }
  };

  const duplicateCampaign = async (id: number) => {
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        fetchCampaigns();
        setForm({ name: data.name, subject: data.subject || "", body: data.body || "", sender_email: data.sender_email || "" });
        setStep(1);
        setShowForm(true);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to duplicate");
      }
    } catch (e) {
      alert("Failed to duplicate campaign");
    }
  };

  const statusColor = (s: string) => {
    if (s === "sent" || s === "completed") return "bg-green-100 text-green-700";
    if (s === "sending") return "bg-blue-100 text-blue-700 animate-pulse";
    if (s === "scheduled") return "bg-purple-100 text-purple-700 font-semibold";
    if (s === "failed") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-600";
  };

  const openAbStats = async (id: number) => {
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${id}/ab-stats`);
      if (res.ok) {
        const data = await res.json();
        setAbStats(data);
        setShowAbStats(true);
      }
    } catch (e) {}
  };

  const openStepsModal = async (id: number) => {
    setStepsForCampaign(id);
    setCampaignSteps([]);
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${id}/steps`);
      if (res.ok) {
        const data = await res.json();
        setCampaignSteps(data || []);
      }
    } catch (e) {}
    setShowStepsModal(true);
  };

  const addCampaignStep = async () => {
    if (!newStep.subject || !newStep.body) {
      alert("Fill in step subject and body");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${stepsForCampaign}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wait_days: newStep.delay_days,
          delay_days: newStep.delay_days,
          subject: newStep.subject,
          body: newStep.body,
          campaign_id: stepsForCampaign,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaignSteps((prev) => [...prev, data]);
        setNewStep({ delay_days: 3, subject: "", body: "" });
      }
    } catch (e) { alert("Failed to add step"); }
  };

  const deleteCampaignStep = async (stepId: number) => {
    if (!confirm("Are you sure you want to delete this follow-up step?")) return;
    try {
      const res = await fetch(`${apiBase}/api/campaigns/${stepsForCampaign}/steps?step_id=${stepId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCampaignSteps((prev) => prev.filter((s: any) => s.id !== stepId));
      }
    } catch (e) { alert("Failed to delete step"); }
  };

  const totalSelected = getTotalSelected();

  const scheduledCount = campaigns.filter((c: any) => c.status === "scheduled").length;
  const activeCount = campaigns.filter((c: any) => c.status === "sending" || c.status === "scheduled").length;
  const sentCount = campaigns.filter((c: any) => c.status === "sent" || c.status === "partial").length;

  const filteredCampaigns = campaigns.filter((c: any) => {
    const q = campaignSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.subject && c.subject.toLowerCase().includes(q)) ||
      (c.sender_email && c.sender_email.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === "all" ||
      c.status === statusFilter ||
      (statusFilter === "active" && (c.status === "sending" || c.status === "scheduled"));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900">Email Campaigns</h2>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
              sseConnected
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-slate-100 border border-slate-200 text-slate-600"
            }`}>
              <span className="relative flex h-2 w-2">
                {sseConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${sseConnected ? "bg-emerald-500" : "bg-slate-400"}`}></span>
              </span>
              <span>{sseConnected ? "REAL-TIME PUSH ACTIVE" : "CONNECTING PUSH..."}</span>
            </div>
          </div>
          <p className="text-sm text-slate-500">Zero interval polling &bull; Server pushes instant updates ONLY when data changes</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchCampaigns(false)}
            disabled={loading}
            className="px-3.5 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            title="Force immediate refresh"
          >
            <svg className={`w-4 h-4 text-slate-500 ${isSyncing || loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false);
              } else {
                setStep(1);
                setShowForm(true);
              }
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm cursor-pointer ${
              showForm
                ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs"
                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md"
            }`}
          >
            {showForm ? (
              <>
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Close Campaign</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>New Campaign</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Campaign Builder */}
      {showForm && (
        <div className="card overflow-hidden animate-slide-down">
          {/* Step indicator with Close button */}
          <div className="flex items-center border-b border-slate-200 bg-slate-50">
            <button
              onClick={() => setStep(1)}
              className={`flex-1 px-4 py-3 text-sm font-medium text-center transition-colors cursor-pointer ${
                step === 1 ? "text-blue-700 border-b-2 border-blue-600 bg-white font-bold" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              1. Select Recipients {totalSelected > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{totalSelected}</span>}
            </button>
            <button
              onClick={() => setStep(2)}
              className={`flex-1 px-4 py-3 text-sm font-medium text-center transition-colors cursor-pointer ${
                step === 2 ? "text-blue-700 border-b-2 border-blue-600 bg-white font-bold" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              2. Compose & Send
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-3 text-slate-400 hover:text-slate-700 hover:bg-slate-100 border-l border-slate-200 text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Close Campaign Builder"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>

          {/* Step 1: Select Recipients */}
          {step === 1 && (
            <div className="p-6">
              {/* Recipient source tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setRecipientTab("database")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                    recipientTab === "database"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                  From Database
                  <span className="text-xs opacity-70">({totalWithEmail})</span>
                </button>
                <button
                  onClick={() => setRecipientTab("import")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                    recipientTab === "import"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                  Import Emails
                </button>
              </div>

              {/* Database Tab */}
              {recipientTab === "database" && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="text"
                      value={dbSearch}
                      onChange={(e) => { setDbSearch(e.target.value); fetchBusinesses(e.target.value); }}
                      placeholder="Search businesses by name, email, or category..."
                      className="input-field flex-1"
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={allBusinesses.length > 0 && selectedIds.size === allBusinesses.length}
                        onChange={toggleAll}
                        className="rounded border-slate-300"
                      />
                      Select all
                    </label>
                  </div>
                  {selectedIds.size > 0 && (
                    <p className="text-sm text-blue-600 mb-3 font-medium">{selectedIds.size} businesses selected</p>
                  )}
                  <div className="border border-slate-200 rounded-xl max-h-80 overflow-y-auto">
                    {dbLoading ? (
                      <div className="p-8 text-center text-sm text-slate-400">Loading businesses...</div>
                    ) : allBusinesses.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-400">
                        No businesses with emails found. <a href="/crawl?tab=crawl" className="text-blue-600 underline">Crawl some businesses first</a>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 w-10">
                              <input type="checkbox" checked={allBusinesses.length > 0 && selectedIds.size === allBusinesses.length} onChange={toggleAll} className="rounded border-slate-300" />
                            </th>
                            <th className="text-left py-2 px-2 font-medium text-slate-600">Name</th>
                            <th className="text-left py-2 px-2 font-medium text-slate-600">Email</th>
                            <th className="text-left py-2 px-2 font-medium text-slate-600 hidden md:table-cell">Category</th>
                            <th className="text-left py-2 px-2 font-medium text-slate-600 hidden md:table-cell">City</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allBusinesses.map((b: any) => (
                            <tr
                              key={b.id}
                              onClick={() => toggleBusiness(b.id)}
                              className={`border-b border-slate-100 cursor-pointer transition-colors ${
                                selectedIds.has(b.id) ? "bg-blue-50" : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(b.id)}
                                  onChange={() => {}}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleBusiness(b.id);
                                  }}
                                  className="rounded border-slate-300"
                                />
                              </td>
                              <td className="py-2 px-2 font-medium text-slate-900">{b.name}</td>
                              <td className="py-2 px-2 text-slate-600">{b.email}</td>
                              <td className="py-2 px-2 text-slate-500 hidden md:table-cell">{b.category || "-"}</td>
                              <td className="py-2 px-2 text-slate-500 hidden md:table-cell">{b.city || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Import Tab */}
              {recipientTab === "import" && (
                <div>
                  <p className="text-sm text-slate-500 mb-3">Paste email addresses below. One per line, or comma/semicolon separated. You can optionally include a name before the email.</p>
                  <textarea
                    value={importEmails}
                    onChange={(e) => setImportEmails(e.target.value)}
                    className="input-field mb-3"
                    rows={6}
                    placeholder={`John <john@example.com>\n jane@company.com\n bob@domain.com, sales@shop.com\n info@store.net`}
                  />
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      onClick={parseImportedEmails}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      Parse Emails
                    </button>
                    <label className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer">
                      <svg className="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Upload CSV
                      <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={handleCSVUpload}
                        className="hidden"
                      />
                    </label>
                    {importedList.length > 0 && (
                      <span className="text-sm text-blue-600 font-medium">{importedList.length} emails parsed</span>
                    )}
                  </div>
                  {importedList.length > 0 && (
                    <div className="border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Name</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Email</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {importedList.map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-slate-700">{item.name}</td>
                              <td className="py-2 px-3 text-slate-600">{item.email}</td>
                              <td className="py-2 px-3">
                                <button onClick={() => removeImportedEmail(idx)} className="text-red-400 hover:text-red-600">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Step 1 Actions */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={totalSelected === 0}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all cursor-pointer"
                >
                  Next: Compose ({totalSelected} recipients) →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Compose & Send */}
          {step === 2 && (
            <div className="p-6">
              <div className="mb-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Sending to <b>{totalSelected}</b> {recipientTab === "database" ? "businesses from database" : "imported emails"}
                <button onClick={() => setStep(1)} className="ml-2 underline hover:text-blue-900">Change</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="e.g., Hosting Companies Outreach"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">Sender / Reply-To Email</label>
                    <span className="text-[10px] text-slate-400">Replies will go here</span>
                  </div>
                  <input
                    type="email"
                    value={form.sender_email}
                    onChange={(e) => setForm({ ...form, sender_email: e.target.value })}
                    className="input-field"
                    placeholder="you@company.com"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Delivered via configured SMTP server
                  </p>
                </div>
              </div>
              {/* Template Selection Bar - Only displayed when a template is active */}
              {loadedTemplateName && (
                <div className="mb-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-base shrink-0 border border-emerald-100">
                        📄
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{loadedTemplateName}</span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Active Template
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Subject and HTML body populated into campaign
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewTemplateData({
                            title: loadedTemplateName,
                            subject: form.subject,
                            html: form.body,
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                      >
                        👁️ Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTemplatePicker(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                      >
                        🔄 Switch Template
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLoadedTemplateName(null);
                        }}
                        className="px-2 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Clear template label"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="input-field"
                  placeholder="Partnership opportunity"
                />
              </div>
              {/* Email Body with Visual Design vs HTML Source Toggle */}
              <div className="mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <label className="block text-sm font-bold text-slate-800">Email Body</label>
                    <p className="text-xs text-slate-500">
                      {bodyViewMode === "visual"
                        ? "Click directly on the email below to edit text, headlines, and links"
                        : "Edit raw HTML source code directly"}
                    </p>
                  </div>

                  {/* View Mode Switcher + Template Button + Advanced Editor Button */}
                  <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                    {/* Select Template Button in toolbar */}
                    {!loadedTemplateName ? (
                      <button
                        type="button"
                        onClick={() => setShowTemplatePicker(true)}
                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                        title="Choose a pre-designed template"
                      >
                        <span>🎨</span>
                        <span>Select Template</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTemplatePicker(true)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                        title={`Template: ${loadedTemplateName}. Click to change.`}
                      >
                        <span>📄</span>
                        <span className="truncate max-w-[120px]">{loadedTemplateName}</span>
                        <span className="text-[10px] text-blue-600 font-bold">Switch</span>
                      </button>
                    )}

                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setBodyViewMode("visual")}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          bodyViewMode === "visual"
                            ? "bg-white text-blue-700 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <span>✍️</span>
                        <span>Quick Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyViewMode("html")}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          bodyViewMode === "html"
                            ? "bg-white text-blue-700 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <span>&lt;/&gt;</span>
                        <span>HTML Code</span>
                      </button>
                    </div>

                    <a
                      href="/templates/builder"
                      target="_blank"
                      className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                      title="Open full Drag & Drop Template Builder in a new tab"
                    >
                      <span>⚙️</span>
                      <span>Advanced Editor ↗</span>
                    </a>
                  </div>
                </div>

                {/* Body Content Area */}
                {bodyViewMode === "visual" ? (
                  <VisualWysiwygEditor
                    value={form.body}
                    onChange={(newHtml) => setForm((f) => ({ ...f, body: newHtml }))}
                    device={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onSwitchToHtml={() => setBodyViewMode("html")}
                    onOpenBuilder={() => window.open("/templates/builder", "_blank")}
                    hasTemplate={!!loadedTemplateName}
                    onSelectTemplate={() => setShowTemplatePicker(true)}
                  />
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 font-medium">Insert variable:</span>
                      {["{{name}}", "{{company}}", "{{email}}", "{{city}}", "{{category}}"].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, body: f.body + ` ${tag} ` }));
                          }}
                          className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono px-1.5 py-0.5 rounded border border-slate-200/80 transition-colors cursor-pointer"
                          title="Click to insert variable"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      className="input-field font-mono text-xs leading-relaxed"
                      rows={12}
                      placeholder="<p>Hi {{name}},</p><p>We would like to partner with {{company}}...</p>"
                    />
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
                      <span>HTML, inline CSS, and table layouts supported</span>
                      <span>{form.body.length} characters</span>
                    </div>
                  </div>
                )}
              </div>

              {/* A/B Split Test Toggle */}
              <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs font-bold text-slate-800">🔬 A/B Split Testing</div>
                    <div className="text-[11px] text-slate-500">Send variant B to 50% of recipients to test subject lines & copy</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAbTest((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAbTest ? "bg-indigo-600" : "bg-slate-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isAbTest ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {isAbTest && (
                  <div className="mt-3 space-y-3 animate-slide-down">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Subject Line — Variant B</label>
                      <input
                        type="text"
                        value={subjectB}
                        onChange={(e) => setSubjectB(e.target.value)}
                        className="input-field"
                        placeholder="Alternative subject line for B variant..."
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-xs font-medium text-slate-700">Email Body — Variant B</label>
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setBodyBViewMode("visual")}
                            className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                              bodyBViewMode === "visual" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500"
                            }`}
                          >
                            ✍️ Quick Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setBodyBViewMode("html")}
                            className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                              bodyBViewMode === "html" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-500"
                            }`}
                          >
                            &lt;/&gt; HTML Code
                          </button>
                        </div>
                      </div>

                      {bodyBViewMode === "visual" && bodyB ? (
                        <VisualWysiwygEditor
                          value={bodyB}
                          onChange={(newHtml) => setBodyB(newHtml)}
                          device="desktop"
                          onSwitchToHtml={() => setBodyBViewMode("html")}
                        />
                      ) : (
                        <textarea
                          value={bodyB}
                          onChange={(e) => setBodyB(e.target.value)}
                          className="input-field font-mono text-xs"
                          rows={6}
                          placeholder="<p>Hi {{name}}, Alternative body for B variant...</p>"
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 bg-indigo-50 rounded-lg p-2.5 border border-indigo-100">
                      ℹ️ <strong>A/B</strong> — 50% of recipients get variant A (Subject above), 50% get Variant B. Open rates will be tracked per variant. View results in campaign stats after sending.
                    </div>
                  </div>
                )}
              </div>

              {/* Delivery Schedule: Send Now vs Schedule for Later */}
              <div className="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Delivery Schedule
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setScheduleType("now")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      scheduleType === "now"
                        ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
                      <span>🚀</span>
                      <span>Send Immediately</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Start sending right away</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleType("later")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      scheduleType === "later"
                        ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
                      <span>⏰</span>
                      <span>Schedule for Later</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Auto-send at a future time</div>
                  </button>
                </div>

                {scheduleType === "later" && (
                  <div className="p-3 bg-white rounded-xl border border-blue-200 animate-slide-down">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Target Send Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="input-field text-xs py-2"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      The automated background scheduler will begin delivery when this time arrives.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/80 pt-5 mt-6">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    ← Back to Audience
                  </button>
                  <button
                    type="button"
                    onClick={handleInitiateSend}
                    disabled={sending !== null}
                    className={`px-7 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 ${
                      scheduleType === "later"
                        ? "bg-purple-600 hover:bg-purple-700 hover:shadow-purple-200"
                        : "bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-200"
                    }`}
                  >
                    <span>{scheduleType === "later" ? "⏰" : "🚀"}</span>
                    <span>
                      {sending
                        ? "Processing..."
                        : scheduleType === "later"
                        ? `Schedule for ${totalSelected} recipients`
                        : `Send to ${totalSelected} recipients`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Modal */}
      {selectedCampaign && stats && (
        <div className="card p-6 animate-slide-down">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Campaign Stats</h3>
            <button onClick={() => { setSelectedCampaign(null); setStats(null); setRecipients([]); }} className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-2xl font-bold text-blue-700">{stats.sent}</div>
              <div className="text-sm text-blue-600">Sent</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <div className="text-2xl font-bold text-green-700">{stats.opened}</div>
              <div className="text-sm text-green-600">Opened ({stats.open_rate?.toFixed(1)}%)</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-xl">
              <div className="text-2xl font-bold text-purple-700">{stats.clicked}</div>
              <div className="text-sm text-purple-600">Clicked ({stats.click_rate?.toFixed(1)}%)</div>
            </div>
          </div>
          {recipients.length > 0 && (
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Sent</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Opened</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Clicked</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r: any) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-700">{r.email}</td>
                      <td className="px-4 py-2 text-slate-500">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "-"}</td>
                      <td className="px-4 py-2">{r.opened_at ? <span className="text-green-600">Yes</span> : <span className="text-slate-400">No</span>}</td>
                      <td className="px-4 py-2">{r.clicked_at ? <span className="text-purple-600">Yes</span> : <span className="text-slate-400">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Campaign List as Modern Separate Blocks / Cards */}
      <div className="space-y-4">
        {/* Header bar above cards */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-slate-800">Past Campaigns</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-bold">
              {campaigns.length}
            </span>
          </div>

          {/* Real-Time Push Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs shadow-2xs">
            <span className="relative flex h-2 w-2">
              {sseConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${sseConnected ? "bg-emerald-500" : "bg-slate-400"}`}></span>
            </span>
            <span className="font-semibold text-slate-700 text-[11px]">
              {sseConnected ? "LIVE PUSH STREAM ACTIVE" : "OFFLINE"}
            </span>
            <span className="text-slate-400 text-[10px]">
              (Zero polling &bull; Updates only on changes)
            </span>
          </div>
        </div>

        {/* Search & Filter Ribbon */}
        {campaigns.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200/90 shadow-2xs">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {[
                { id: "all", label: "All Campaigns", count: campaigns.length },
                { id: "active", label: "Active", count: activeCount },
                { id: "scheduled", label: "Scheduled", count: scheduledCount },
                { id: "sent", label: "Completed", count: sentCount },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    statusFilter === tab.id
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      statusFilter === tab.id
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search campaigns..."
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                🔍
              </span>
              {campaignSearch && (
                <button
                  type="button"
                  onClick={() => setCampaignSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {loading && campaigns.length === 0 ? (
          <div className="card p-12 text-center text-sm text-slate-400">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="card p-12 text-center text-sm text-slate-400">No campaigns yet. Click "New Campaign" to get started.</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No campaigns match your filter</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing your search term or switching filter tabs</p>
            <button
              onClick={() => { setCampaignSearch(""); setStatusFilter("all"); }}
              className="mt-3 px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredCampaigns.map((c: any) => {
              const openRate = c.sent_count > 0 ? ((c.opened_count / c.sent_count) * 100) : 0;
              const clickRate = c.sent_count > 0 ? ((c.clicked_count / c.sent_count) * 100) : 0;
              const flash = flashingMetrics[c.id] || {};
              const hasFlash = flash.status || flash.sent || flash.opened || flash.clicked;

              return (
                <div
                  key={c.id}
                  className={`group bg-white rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs ${
                    hasFlash
                      ? "border-emerald-400 bg-emerald-50/25 shadow-md ring-2 ring-emerald-400/20"
                      : "border-slate-200/90 hover:border-slate-300 hover:shadow-md"
                  }`}
                >
                  {/* Top Row: Title, Status Badge, Schedule Target, Action Buttons */}
                  {/* Top Row: Title, Status Badge, Schedule Target on Left; Circular Donut Gauges on Right */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      <h4 className="font-bold text-slate-900 text-base truncate">{c.name}</h4>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                          flash.status
                            ? "ring-2 ring-emerald-500 scale-105 shadow-xs bg-emerald-100 text-emerald-800"
                            : statusColor(c.status)
                        }`}
                      >
                        {flash.status && <span className="animate-pulse">⚡</span>}
                        {c.status.toUpperCase()}
                      </span>
                      {c.status === "scheduled" && c.scheduled_at && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-800">
                          <span>⏰</span>
                          <span>Target: {new Date(c.scheduled_at).toLocaleString()}</span>
                        </span>
                      )}
                      {c.is_ab_test === 1 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 border border-violet-200 text-violet-700">
                          <span>🔬</span>
                          <span>A/B Test</span>
                        </span>
                      )}
                    </div>

                    {/* Visual Charts & Gauges on Top Right (KPIs First) */}
                    <div className="flex items-center gap-4 sm:gap-6 flex-wrap shrink-0">
                      {/* Circular Gauge: Sent */}
                      {(() => {
                        const radius = 16;
                        const circumference = 2 * Math.PI * radius;
                        return (
                          <div
                            onClick={() => viewStats(c.id)}
                            className={`flex items-center gap-2.5 px-1 py-1 transition-all duration-300 cursor-pointer hover:opacity-80 group ${
                              flash.sent ? "scale-105" : ""
                            }`}
                            title="Click to view analytics"
                          >
                            <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                <circle
                                  cx="20"
                                  cy="20"
                                  r={radius}
                                  className="stroke-slate-100 fill-none"
                                  strokeWidth="3.5"
                                />
                                <circle
                                  cx="20"
                                  cy="20"
                                  r={radius}
                                  className="stroke-blue-500 fill-none transition-all duration-700 ease-out"
                                  strokeWidth="3.5"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={c.sent_count > 0 ? 0 : circumference}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className="absolute text-[10px] font-extrabold text-slate-800">
                                {c.sent_count}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors flex items-center gap-1">
                                <span>Sent</span>
                                {flash.sent && <span className="text-[10px] text-blue-600 font-bold animate-bounce">▲</span>}
                              </div>
                              <div className="text-[11px] text-slate-400 font-medium">
                                {c.sent_count} total
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Radial Donut Gauge: Open Rate */}
                      {(() => {
                        const radius = 16;
                        const circumference = 2 * Math.PI * radius;
                        const offset = circumference - (Math.min(openRate, 100) / 100) * circumference;
                        return (
                          <div
                            onClick={() => viewStats(c.id)}
                            className={`flex items-center gap-2.5 px-1 py-1 transition-all duration-300 cursor-pointer hover:opacity-80 group ${
                              flash.opened ? "scale-105" : ""
                            }`}
                            title="Click to view analytics"
                          >
                            {/* Circular Donut Gauge SVG */}
                            <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                <circle
                                  cx="20"
                                  cy="20"
                                  r={radius}
                                  className="stroke-slate-100 fill-none"
                                  strokeWidth="3.5"
                                />
                                <circle
                                  cx="20"
                                  cy="20"
                                  r={radius}
                                  className="stroke-emerald-500 fill-none transition-all duration-700 ease-out"
                                  strokeWidth="3.5"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={c.sent_count > 0 ? offset : circumference}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className="absolute text-[10px] font-extrabold text-slate-800">
                                {openRate.toFixed(0)}%
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-600 transition-colors flex items-center gap-1">
                                <span>Opened</span>
                                {flash.opened && <span className="text-[10px] text-emerald-700 font-bold animate-bounce">▲</span>}
                              </div>
                              <div className="text-[11px] text-slate-400 font-medium">
                                {c.opened_count} of {c.sent_count}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Radial Donut Gauge: Click Rate */}
                      {(() => {
                        const radius = 16;
                        const circumference = 2 * Math.PI * radius;
                        const offset = circumference - (Math.min(clickRate, 100) / 100) * circumference;
                        return (
                          <div
                            onClick={() => viewStats(c.id)}
                            className={`flex items-center gap-2.5 px-1 py-1 transition-all duration-300 cursor-pointer hover:opacity-80 group ${
                              flash.clicked ? "scale-105" : ""
                            }`}
                            title="Click to view analytics"
                          >
                            {/* Circular Donut Gauge SVG */}
                            <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                <circle
                                  cx="20"
                                  cy="20"
                                  r={radius}
                                  className="stroke-slate-100 fill-none"
                                  strokeWidth="3.5"
                                />
                                <circle
                                  cx="20"
                                  cy="20"
                                  r={radius}
                                  className="stroke-purple-500 fill-none transition-all duration-700 ease-out"
                                  strokeWidth="3.5"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={c.sent_count > 0 ? offset : circumference}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className="absolute text-[10px] font-extrabold text-slate-800">
                                {clickRate.toFixed(0)}%
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-800 group-hover:text-purple-600 transition-colors flex items-center gap-1">
                                <span>Clicked</span>
                                {flash.clicked && <span className="text-[10px] text-purple-700 font-bold animate-bounce">▲</span>}
                              </div>
                              <div className="text-[11px] text-slate-400 font-medium">
                                {c.clicked_count} of {c.sent_count}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Bottom Row: Subject & Meta Info on Left, Action Buttons on Right */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm text-slate-700 font-medium truncate">
                        <span className="text-slate-400 text-xs font-normal">Subject:</span>
                        <span className="truncate">{c.subject}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>📅 {c.created_at ? new Date(c.created_at).toLocaleString() : ""}</span>
                        <span>&bull;</span>
                        <span>✉️ {c.sender_email || "No sender email"}</span>
                      </p>
                    </div>

                    {/* Action Controls on Bottom Right (Crisp Vector SVG Two-Tone Buttons - Low Opacity at Rest, Full on Card Hover) */}
                    <div className="flex items-center gap-2 flex-wrap shrink-0 opacity-100 sm:opacity-40 group-hover:opacity-100 transition-all duration-200">
                      {/* Follow-ups (Indigo Two-Tone) */}
                      <button
                        onClick={() => openStepsModal(c.id)}
                        className="h-8 rounded-lg overflow-hidden shadow-2xs hover:shadow-xs transition-all flex items-center bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
                      >
                        <span className="w-8 h-8 bg-black/20 flex items-center justify-center border-r border-black/15 shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </span>
                        <span className="px-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap">
                          Follow-ups
                        </span>
                      </button>

                      {/* A/B Results (Amber Two-Tone) */}
                      {c.is_ab_test === 1 && (
                        <button
                          onClick={() => openAbStats(c.id)}
                          className="h-8 rounded-lg overflow-hidden shadow-2xs hover:shadow-xs transition-all flex items-center bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shrink-0"
                        >
                          <span className="w-8 h-8 bg-black/20 flex items-center justify-center border-r border-black/15 shrink-0">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                            </svg>
                          </span>
                          <span className="px-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap">
                            A/B Results
                          </span>
                        </button>
                      )}

                      {/* Reuse (Teal Two-Tone) */}
                      <button
                        onClick={() => duplicateCampaign(c.id)}
                        className="h-8 rounded-lg overflow-hidden shadow-2xs hover:shadow-xs transition-all flex items-center bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shrink-0"
                        title="Duplicate Campaign"
                      >
                        <span className="w-8 h-8 bg-black/20 flex items-center justify-center border-r border-black/15 shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9H7.875c-.621 0-1.125.504-1.125 1.125v1.5m6.75 3v-1.5c0-.621-.504-1.125-1.125-1.125H9.75" />
                          </svg>
                        </span>
                        <span className="px-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap">
                          Reuse
                        </span>
                      </button>

                      {/* Retry (Orange Two-Tone) */}
                      {(c.status === "failed" || c.status === "sending") && (
                        <button
                          onClick={() => retryCampaign(c.id)}
                          className="h-8 rounded-lg overflow-hidden shadow-2xs hover:shadow-xs transition-all flex items-center bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shrink-0"
                        >
                          <span className="w-8 h-8 bg-black/20 flex items-center justify-center border-r border-black/15 shrink-0">
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                          </span>
                          <span className="px-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap">
                            Retry
                          </span>
                        </button>
                      )}

                      {/* Delete (Rose Red Two-Tone) */}
                      <button
                        onClick={() => deleteCampaign(c.id)}
                        className="h-8 rounded-lg overflow-hidden shadow-2xs hover:shadow-xs transition-all flex items-center bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shrink-0"
                        title="Delete Campaign"
                      >
                        <span className="w-8 h-8 bg-black/20 flex items-center justify-center border-r border-black/15 shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </span>
                        <span className="px-3 text-[11px] font-bold tracking-wider uppercase whitespace-nowrap">
                          Delete
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* A/B Stats Modal */}
      {showAbStats && abStats && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-slide-down">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">🔬 A/B Test Results</h3>
              <button onClick={() => setShowAbStats(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {["A", "B"].map((v) => {
                const variantData = abStats[`variant_${v.toLowerCase()}`] || abStats[v] || {};
                const sent = variantData.sent || 0;
                const opened = variantData.opened || 0;
                const clicked = variantData.clicked || 0;
                const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : "0";
                const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : "0";
                return (
                  <div key={v} className={`p-4 rounded-xl border-2 ${v === "A" ? "border-blue-300 bg-blue-50" : "border-purple-300 bg-purple-50"}`}>
                    <div className={`text-lg font-black mb-2 ${v === "A" ? "text-blue-700" : "text-purple-700"}`}>Variant {v}</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-slate-600">Sent</span><span className="font-bold">{sent}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Opened</span><span className="font-bold text-green-700">{opened} ({openRate}%)</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Clicked</span><span className="font-bold text-purple-700">{clicked} ({clickRate}%)</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
              <strong>Winner:</strong> {
                (() => {
                  const a = abStats.variant_a || abStats.A || {};
                  const b = abStats.variant_b || abStats.B || {};
                  const aRate = (a.sent > 0 ? a.opened / a.sent : 0);
                  const bRate = (b.sent > 0 ? b.opened / b.sent : 0);
                  if (aRate > bRate) return "Variant A has higher open rate 🏆";
                  if (bRate > aRate) return "Variant B has higher open rate 🏆";
                  return "Currently tied — wait for more data";
                })()
              }
            </div>
          </div>
        </div>
      )}

      {/* Campaign Steps / Follow-up Sequence Modal */}
      {showStepsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-slide-down max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">📆 Follow-up Sequence</h3>
                <p className="text-xs text-slate-500">Add automated follow-up emails that send after a delay</p>
              </div>
              <button onClick={() => setShowStepsModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer">✕</button>
            </div>

            {/* Existing Steps */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {campaignSteps.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <div className="text-3xl mb-2">📭</div>
                  <div>No follow-up steps yet. Add your first one below.</div>
                </div>
              ) : (
                campaignSteps.map((step: any, i: number) => (
                  <div key={step.id || i} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-indigo-700">Step {i + 1} — Send after {step.wait_days || step.delay_days || 3} day(s)</span>
                      {step.id && (
                        <button
                          onClick={() => deleteCampaignStep(step.id)}
                          className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-1.5 py-0.5 rounded cursor-pointer transition-colors font-medium"
                          title="Delete follow-up step"
                        >
                          ✕ Delete
                        </button>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-800">{step.subject}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{step.body.replace(/<[^>]+>/g, '')}</div>
                  </div>
                ))
              )}
            </div>

            {/* Add New Step */}
            <div className="border-t border-slate-200 pt-4 space-y-3 shrink-0">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add Follow-up Step</div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-600 shrink-0">Send after</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={newStep.delay_days}
                  onChange={(e) => setNewStep((s) => ({ ...s, delay_days: parseInt(e.target.value) || 1 }))}
                  className="input-field w-20 text-center"
                />
                <label className="text-xs text-slate-600">days</label>
              </div>
              <input
                type="text"
                value={newStep.subject}
                onChange={(e) => setNewStep((s) => ({ ...s, subject: e.target.value }))}
                className="input-field"
                placeholder="Follow-up subject line..."
              />
              <textarea
                value={newStep.body}
                onChange={(e) => setNewStep((s) => ({ ...s, body: e.target.value }))}
                className="input-field"
                rows={3}
                placeholder="<p>Hi {{name}}, just following up on my previous email...</p>"
              />
              <button
                onClick={addCampaignStep}
                className="w-full py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all"
              >
                ➕ Add Follow-up Step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Starter Templates Picker Modal with Left Categories & Right Presets Grid */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6" onClick={() => setShowTemplatePicker(false)}>
          <div className="bg-white rounded-2xl max-w-5xl w-full h-[85vh] max-h-[780px] flex flex-col shadow-2xl overflow-hidden animate-slide-down border border-slate-100" onClick={(e) => e.stopPropagation()}>
            {/* Modal Top Header */}
            <div className="px-6 py-4 border-b border-slate-200/80 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl">
                  ✨
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Email Template Presets</h3>
                  <p className="text-xs text-slate-500">
                    Choose a pre-designed layout or pick from curated categories
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Quick Search */}
                <div className="relative w-56 hidden sm:block">
                  <input
                    type="text"
                    value={starterSearch}
                    onChange={(e) => setStarterSearch(e.target.value)}
                    placeholder="Search presets..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-indigo-500 transition-all"
                  />
                  <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
                  {starterSearch && (
                    <button
                      type="button"
                      onClick={() => setStarterSearch("")}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowTemplatePicker(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Split Layout: Left Categories + Right Presets */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Categories Sidebar */}
              <div className="w-56 sm:w-64 bg-slate-50/80 border-r border-slate-200/80 p-3 overflow-y-auto flex flex-col shrink-0 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1 mb-1">
                  Categories
                </div>

                {STARTER_CATEGORIES.map((cat) => {
                  const count =
                    cat.id === "all"
                      ? STARTER_TEMPLATES.length
                      : cat.id === "saved"
                      ? savedTemplates.length
                      : STARTER_TEMPLATES.filter((t) => t.category === cat.id).length;
                  const isActive = starterCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setStarterCategory(cat.id);
                        setStarterSearch("");
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-xs font-semibold"
                          : "text-slate-600 hover:bg-slate-200/60 font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base">{cat.icon}</span>
                        <span className="text-xs truncate">{cat.label}</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                <div className="pt-3 mt-auto border-t border-slate-200/70">
                  <a
                    href="/templates/builder"
                    target="_blank"
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200 transition-colors"
                  >
                    <span>✏️ Drag &amp; Drop Editor</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>

              {/* Right Presets Content Grid */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-white flex flex-col">
                {/* Category Header */}
                <div className="mb-4 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{STARTER_CATEGORIES.find((c) => c.id === starterCategory)?.icon}</span>
                      <span>{STARTER_CATEGORIES.find((c) => c.id === starterCategory)?.label}</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {STARTER_CATEGORIES.find((c) => c.id === starterCategory)?.desc}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {starterCategory === "saved"
                      ? `${filteredSaved.length} ${filteredSaved.length === 1 ? "template" : "templates"}`
                      : `${filteredStarters.length} ${filteredStarters.length === 1 ? "preset" : "presets"}`}
                  </span>
                </div>

                {/* Grid of Presets or Saved Templates */}
                {starterCategory === "saved" ? (
                  filteredSaved.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredSaved.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className="rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all bg-white text-left group overflow-hidden flex flex-col"
                          onClick={() => applySavedTemplate(tmpl)}
                        >
                          <div className="h-36 bg-slate-100/80 border-b border-slate-100 relative overflow-hidden flex justify-center items-start pt-1">
                            <iframe
                              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#f8fafc;-webkit-font-smoothing:antialiased;}::-webkit-scrollbar{display:none;}</style></head><body>${tmpl.body || ""}</body></html>`}
                              title={tmpl.name}
                              className="w-[600px] h-[550px] border-0 origin-top transform scale-[0.24] pointer-events-none select-none shadow-xs"
                              tabIndex={-1}
                              loading="lazy"
                              sandbox="allow-same-origin"
                            />
                            <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-white/95 shadow-xs border border-slate-200/80 flex items-center justify-center text-base group-hover:scale-110 transition-transform">
                              💾
                            </div>
                          </div>

                          <div className="p-3.5 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                                  {tmpl.name}
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                                  {tmpl.category || "custom"}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 line-clamp-2 mb-2 leading-relaxed">
                                {tmpl.subject || "(No subject set)"}
                              </p>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-indigo-600 font-semibold pt-2 border-t border-slate-100">
                              <span className="group-hover:translate-x-1 transition-transform">Use this template →</span>
                              <span className="text-slate-400 font-normal">Custom</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center text-xs text-slate-400">
                      No custom templates saved yet. Design custom templates in the{" "}
                      <a href="/templates/builder" target="_blank" className="text-indigo-600 font-bold underline">
                        Drag &amp; Drop Editor ↗
                      </a>
                    </div>
                  )
                ) : filteredStarters.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredStarters.map((starter) => {
                      const previewHtml = compileToEmailHtml({
                        blocks: starter.blocks,
                        settings: starter.settings,
                        subject: starter.subject,
                      });

                      return (
                        <div
                          key={starter.id}
                          onClick={() => applyStarterTemplate(starter)}
                          className="rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all bg-white text-left group overflow-hidden flex flex-col"
                        >
                          {/* Miniature Live Preview */}
                          <div className="h-36 bg-slate-100/80 border-b border-slate-100 relative overflow-hidden flex justify-center items-start pt-1">
                            <iframe
                              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#f8fafc;-webkit-font-smoothing:antialiased;}::-webkit-scrollbar{display:none;}</style></head><body>${previewHtml}</body></html>`}
                              title={starter.name}
                              className="w-[600px] h-[550px] border-0 origin-top transform scale-[0.24] pointer-events-none select-none shadow-xs"
                              tabIndex={-1}
                              loading="lazy"
                              sandbox="allow-same-origin"
                            />
                            <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-white/95 shadow-xs border border-slate-200/80 flex items-center justify-center text-base group-hover:scale-110 transition-transform">
                              {starter.icon}
                            </div>
                          </div>

                          {/* Info */}
                          <div className="p-3.5 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                                  {starter.name}
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">
                                  {starter.category}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 line-clamp-2 mb-2 leading-relaxed">
                                {starter.description}
                              </p>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-indigo-600 font-semibold pt-2 border-t border-slate-100">
                              <span className="group-hover:translate-x-1 transition-transform">Use this template →</span>
                              <span className="text-slate-400 font-normal">{starter.blocks.length} blocks</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center text-xs text-slate-400">
                    No presets found in this category. Try another category or clear the search query.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Email Preview Modal */}
      {previewTemplateData && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setPreviewTemplateData(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl animate-slide-down max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>👁️</span>
                  <span>{previewTemplateData.title}</span>
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-md">
                  <span className="font-semibold text-slate-600">Subject: </span>
                  {previewTemplateData.subject}
                </p>
              </div>
              <button onClick={() => setPreviewTemplateData(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer">
                ✕
              </button>
            </div>

            {/* Preview Frame */}
            <div className="flex-1 overflow-y-auto py-4 bg-slate-100/70 p-4 rounded-xl my-3 border border-slate-200">
              <div
                className="bg-white mx-auto shadow-sm rounded-lg overflow-hidden max-w-[620px]"
                dangerouslySetInnerHTML={{ __html: previewTemplateData.html }}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewTemplateData(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close Preview
              </button>
              {previewTemplateData.onApply && (
                <button
                  type="button"
                  onClick={() => {
                    previewTemplateData.onApply?.();
                  }}
                  className="btn-primary py-2 px-5 text-xs font-bold shadow-md shadow-blue-500/25 cursor-pointer flex items-center gap-1.5"
                >
                  <span>⚡</span>
                  <span>Insert This Template into Campaign</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1. Campaign Launch / Schedule Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-slide-down border border-slate-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                  scheduleType === "later"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {scheduleType === "later" ? "⏰" : "🚀"}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {scheduleType === "later" ? "Confirm Scheduled Delivery" : "Confirm Campaign Launch"}
                </h3>
                <p className="text-xs text-slate-500">
                  {scheduleType === "later"
                    ? "Review scheduled delivery settings before queuing"
                    : "Review your campaign details before sending"}
                </p>
              </div>
            </div>

            {/* Campaign Summary Card */}
            <div className="my-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="text-slate-500 font-medium">Campaign Name</span>
                <span className="font-bold text-slate-800 text-right truncate max-w-[240px]">{form.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="text-slate-500 font-medium">Subject Line</span>
                <span className="font-semibold text-slate-800 text-right truncate max-w-[240px]">{form.subject}</span>
              </div>
              {isAbTest && (
                <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                  <span className="text-slate-500 font-medium">Subject (Variant B)</span>
                  <span className="font-semibold text-indigo-700 text-right truncate max-w-[240px]">{subjectB}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="text-slate-500 font-medium">Sender Email</span>
                <span className="font-mono text-slate-700 text-right truncate max-w-[240px]">{form.sender_email}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="text-slate-500 font-medium">Target Audience</span>
                <span className="font-bold text-indigo-600">
                  {getTotalSelected()} recipient(s) {recipientTab === "database" ? "(Database leads)" : "(Imported list)"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                <span className="text-slate-500 font-medium">Delivery Schedule</span>
                <span className={`font-semibold ${scheduleType === "later" ? "text-purple-600" : "text-emerald-600"}`}>
                  {scheduleType === "later" ? `⏰ ${new Date(scheduledDateTime).toLocaleString()}` : "⚡ Immediate Delivery"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-medium">A/B Testing</span>
                <span className="font-semibold text-slate-700">
                  {isAbTest ? "🔬 50% Variant A / 50% Variant B" : "Single Variant"}
                </span>
              </div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-blue-700 mb-5 flex items-start gap-2">
              <span>ℹ️</span>
              <span>All emails will be automatically personalized using variables like <code>{"{{name}}"}</code> and <code>{"{{company}}"}</code>.</span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel / Keep Editing
              </button>
              <button
                type="button"
                onClick={executeCampaignSend}
                disabled={sending !== null}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer flex items-center gap-2 ${
                  scheduleType === "later"
                    ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200"
                    : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                }`}
              >
                {sending !== null ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>{scheduleType === "later" ? "⏰" : "🚀"}</span>
                    <span>{scheduleType === "later" ? "Confirm & Schedule Delivery" : "Confirm & Send Immediately"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Status / Result Notice Modal (replaces browser alerts) */}
      {statusNotice && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setStatusNotice(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-slide-down border border-slate-100 flex flex-col text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-3 ${
                statusNotice.type === "success"
                  ? "bg-emerald-100 text-emerald-600"
                  : statusNotice.type === "error"
                  ? "bg-rose-100 text-rose-600"
                  : "bg-amber-100 text-amber-600"
              }`}
            >
              {statusNotice.type === "success" ? "🎉" : statusNotice.type === "error" ? "⚠️" : "ℹ️"}
            </div>

            <h3 className="text-base font-bold text-slate-900 mb-1.5">{statusNotice.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">{statusNotice.message}</p>

            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className={`w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all cursor-pointer ${
                statusNotice.type === "success"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : statusNotice.type === "error"
                  ? "bg-slate-900 hover:bg-slate-800"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {statusNotice.type === "success" ? "Done & Return to Campaigns" : "Close"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ apiBase }: { apiBase: string }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // DNS Health Inspector state
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsResult, setDnsResult] = useState<any>(null);

  const checkDns = async () => {
    if (!dnsDomain.trim()) return;
    setDnsLoading(true);
    setDnsResult(null);
    try {
      const res = await fetch(`${apiBase}/api/settings/check-dns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: dnsDomain.trim() }),
      });
      if (res.ok) setDnsResult(await res.json());
    } catch (e) {}
    setDnsLoading(false);
  };

  useEffect(() => {
    if (apiBase) fetchSettings();
  }, [apiBase]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/settings`);
      if (res.ok) setSettings(await res.json());
    } catch (e) {
      console.error("Failed to fetch settings", e);
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) alert("Settings saved!");
      else alert("Failed to save settings");
    } catch (e) {
      alert("Failed to save settings");
    }
    setSaving(false);
  };

  const testSmtp = async () => {
    if (!testEmail) { alert("Enter an email to test"); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${apiBase}/api/settings/test-smtp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      setTestResult(data.success ? { ok: true, msg: "Test email sent!" } : { ok: false, msg: data.error || "Failed" });
    } catch (e) {
      setTestResult({ ok: false, msg: "Connection failed" });
    }
    setTesting(false);
  };

  const update = (key: string, value: string) => setSettings({ ...settings, [key]: value });

  if (loading) return <div className="p-8 text-center text-slate-400">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">Configure SMTP, tracking, and email sending</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Column - Settings */}
      <div className="flex-1 space-y-6 min-w-0">
      {/* SMTP Settings */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
          SMTP Configuration
        </h3>
        <p className="text-sm text-slate-500 mb-4">Configure your outgoing email server to send campaign emails</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host</label>
            <input
              type="text"
              value={settings.smtp_host || ""}
              onChange={(e) => update("smtp_host", e.target.value)}
              className="input-field"
              placeholder="smtp.gmail.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Port</label>
            <input
              type="text"
              value={settings.smtp_port || "587"}
              onChange={(e) => update("smtp_port", e.target.value)}
              className="input-field"
              placeholder="587"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              value={settings.smtp_username || ""}
              onChange={(e) => update("smtp_username", e.target.value)}
              className="input-field"
              placeholder="your-email@gmail.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={settings.smtp_password || ""}
              onChange={(e) => update("smtp_password", e.target.value)}
              className="input-field"
              placeholder="your-app-password"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Email</label>
            <input
              type="email"
              value={settings.smtp_from || ""}
              onChange={(e) => update("smtp_from", e.target.value)}
              className="input-field"
              placeholder="noreply@yourdomain.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TLS</label>
            <select
              value={settings.smtp_tls || "true"}
              onChange={(e) => update("smtp_tls", e.target.value)}
              className="input-field"
            >
              <option value="true">Enabled (recommended)</option>
              <option value="false">Disabled (plain SMTP)</option>
            </select>
          </div>
        </div>

        {/* Preset buttons */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Quick Presets</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSettings({ ...settings, smtp_host: "smtp.gmail.com", smtp_port: "587", smtp_tls: "true" })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Gmail
            </button>
            <button
              onClick={() => setSettings({ ...settings, smtp_host: "smtp.office365.com", smtp_port: "587", smtp_tls: "true" })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Outlook / Office 365
            </button>
            <button
              onClick={() => setSettings({ ...settings, smtp_host: "smtp.mail.yahoo.com", smtp_port: "465", smtp_tls: "true" })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Yahoo
            </button>
            <button
              onClick={() => setSettings({ ...settings, smtp_host: "email-smtp.us-east-1.amazonaws.com", smtp_port: "465", smtp_tls: "true" })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              AWS SES
            </button>
            <button
              onClick={() => setSettings({ ...settings, smtp_host: "smtp.sendgrid.net", smtp_port: "587", smtp_tls: "true" })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              SendGrid
            </button>
          </div>
        </div>
      </div>

      {/* Tracking Settings */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>
          Tracking Settings
        </h3>
        <p className="text-sm text-slate-500 mb-4">Configure where tracking pixels and click redirects point to</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Tracking Host</label>
          <input
            type="text"
            value={settings.track_host || ""}
            onChange={(e) => update("track_host", e.target.value)}
            className="input-field"
            placeholder="192.168.10.203 (your server IP or domain)"
          />
          <p className="text-xs text-slate-400 mt-1">IP or domain that recipients can access. Used for open tracking pixel and click redirect links. Leave blank to use SMTP host.</p>
        </div>
      </div>

      {/* Sending Throttle */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <span>⏱️</span>
          Sending Throttle &amp; Rate Limiting
        </h3>
        <p className="text-sm text-slate-500 mb-4">Add random delay between emails to avoid spam filters and rate limiting</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Min Delay (seconds)</label>
            <input
              type="number"
              min={0}
              max={300}
              value={settings.smtp_min_delay || "3"}
              onChange={(e) => update("smtp_min_delay", e.target.value)}
              className="input-field"
              placeholder="3"
            />
            <p className="text-xs text-slate-400 mt-1">Minimum wait between each email. 3-5s recommended.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Delay (seconds)</label>
            <input
              type="number"
              min={0}
              max={600}
              value={settings.smtp_max_delay || "8"}
              onChange={(e) => update("smtp_max_delay", e.target.value)}
              className="input-field"
              placeholder="8"
            />
            <p className="text-xs text-slate-400 mt-1">Maximum wait. A random value between min-max will be picked.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Daily Cap (emails/24h)</label>
            <input
              type="number"
              min={0}
              max={10000}
              value={settings.smtp_daily_limit || ""}
              onChange={(e) => update("smtp_daily_limit", e.target.value)}
              className="input-field"
              placeholder="e.g., 100"
            />
            <p className="text-xs text-slate-400 mt-1">Max sends per rolling 24h. Pauses campaign when reached.</p>
          </div>
        </div>
        <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          💡 <strong>Best Practice:</strong> Use 5-10s delay to mimic human sending behavior. High-volume: 10-30s delay with max 300 emails/day to preserve sender reputation.
        </div>
      </div>

      {/* DNS &amp; Deliverability Health Inspector */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <span>🛡️</span>
          Domain DNS &amp; Deliverability Inspector
        </h3>
        <p className="text-sm text-slate-500 mb-4">Check SPF, DKIM, DMARC and MX records for any domain</p>
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Domain to Inspect</label>
            <input
              type="text"
              value={dnsDomain}
              onChange={(e) => setDnsDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkDns()}
              className="input-field"
              placeholder="yourdomain.com"
            />
          </div>
          <button
            onClick={checkDns}
            disabled={dnsLoading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          >
            {dnsLoading ? "Checking..." : "🔍 Check DNS"}
          </button>
        </div>

        {dnsResult && (
          <div className="space-y-3 animate-slide-down">
            {/* Score */}
            <div className={`p-3 rounded-xl text-center font-bold text-lg ${
              dnsResult.score >= 90 ? "bg-green-50 text-green-700 border border-green-200"
              : dnsResult.score >= 60 ? "bg-amber-50 text-amber-700 border border-amber-200"
              : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              Deliverability Score: {dnsResult.score}/100
            </div>

            {/* Records */}
            {[
              { key: "spf", label: "SPF Record", icon: "🔏" },
              { key: "dkim", label: "DKIM", icon: "🔑" },
              { key: "dmarc", label: "DMARC Policy", icon: "🛡️" },
              { key: "mx", label: "MX Records", icon: "📬" },
            ].map(({ key, label, icon }) => {
              const record = dnsResult[key];
              if (!record) return null;
              return (
                <div key={key} className={`p-3 rounded-xl border ${record.valid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800">{icon} {label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${record.valid ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                      {record.valid ? "✓ Valid" : "✗ Missing / Invalid"}
                    </span>
                  </div>
                  {record.record && <div className="text-xs font-mono text-slate-600 break-all bg-white/60 p-1.5 rounded-lg">{record.record}</div>}
                  {!record.valid && record.advice && (
                    <div className="text-xs text-slate-600 mt-1 font-mono bg-white/60 p-1.5 rounded-lg">
                      Fix: <span className="text-indigo-700">{record.advice}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Test Email */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          Test Email
        </h3>
        <p className="text-sm text-slate-500 mb-4">Send a test email to verify your SMTP configuration works</p>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Send test to</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="input-field"
              placeholder="your-email@gmail.com"
            />
          </div>
          <button
            onClick={testSmtp}
            disabled={testing}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {testing ? "Sending..." : "Send Test"}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {testResult.msg}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
      </div>

      {/* Right Column - Tutorials */}
      <div className="w-full lg:w-96 shrink-0">
      {/* Provider Guide */}
      <div className="card p-6 lg:sticky lg:top-20">
        <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
          SMTP Setup Tutorials
        </h3>
        <p className="text-sm text-slate-500 mb-4">Step-by-step guides for popular email providers</p>

        <div className="space-y-4">
          {/* Gmail */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">G</span>
              <div>
                <div className="font-semibold">Gmail / Google Workspace</div>
                <div className="text-xs text-slate-500 font-normal">Free &bull; Requires 2FA + App Password</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-xs">
                <b>Note:</b> Gmail requires an "App Password" — you cannot use your regular Gmail password.
              </div>
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Go to <a href="https://myaccount.google.com/security" target="_blank" className="text-blue-600 underline">myaccount.google.com/security</a></li>
                <li>Enable <b>2-Step Verification</b> (required before app passwords)</li>
                <li>Search for <b>"App passwords"</b> in the search bar at the top</li>
                <li>Click <b>"App passwords"</b> under "How you sign in to Google"</li>
                <li>Select app: <b>"Mail"</b>, select device: <b>"Other (Custom name)"</b></li>
                <li>Enter a name like <b>"ClientList"</b> and click <b>"Generate"</b></li>
                <li>Google will show a <b>16-character password</b> like <code className="bg-slate-100 px-1 rounded">abcd efgh ijkl mnop</code></li>
                <li>Copy that password (without spaces) into the <b>Password</b> field below</li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>smtp.gmail.com</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>587</b></div>
                  <div><span className="text-slate-500">Username:</span> <b>you@gmail.com</b></div>
                  <div><span className="text-slate-500">TLS:</span> <b>Enabled</b></div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs">
                <b>Common issues:</b>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>"Authentication failed" — App password has spaces, remove them</li>
                  <li>No app password option — 2FA is not enabled yet</li>
                  <li>"Less secure app" error — Use app password instead of regular password</li>
                </ul>
              </div>
            </div>
          </details>

          {/* Outlook */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">O</span>
              <div>
                <div className="font-semibold">Outlook / Microsoft 365</div>
                <div className="text-xs text-slate-500 font-normal">Free &bull; Requires App Password</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Go to <a href="https://account.microsoft.com/security" target="_blank" className="text-blue-600 underline">account.microsoft.com/security</a></li>
                <li>Click <b>"Advanced security options"</b></li>
                <li>Scroll to <b>"App passwords"</b> section</li>
                <li>Click <b>"Create a new app password"</b></li>
                <li>Copy the generated password</li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>smtp.office365.com</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>587</b></div>
                  <div><span className="text-slate-500">Username:</span> <b>you@outlook.com</b></div>
                  <div><span className="text-slate-500">TLS:</span> <b>Enabled</b></div>
                </div>
              </div>
            </div>
          </details>

          {/* Yahoo */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">Y</span>
              <div>
                <div className="font-semibold">Yahoo Mail</div>
                <div className="text-xs text-slate-500 font-normal">Free &bull; Requires App Password</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Go to <a href="https://login.yahoo.com/myaccount/security" target="_blank" className="text-blue-600 underline">login.yahoo.com/myaccount/security</a></li>
                <li>Click <b>"Generate app password"</b> or <b>"Manage app passwords"</b></li>
                <li>Select <b>"Other app"</b> and enter a name</li>
                <li>Click <b>"Generate"</b> and copy the password</li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>smtp.mail.yahoo.com</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>465</b></div>
                  <div><span className="text-slate-500">Username:</span> <b>you@yahoo.com</b></div>
                  <div><span className="text-slate-500">TLS:</span> <b>Enabled</b></div>
                </div>
              </div>
            </div>
          </details>

          {/* AWS SES */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">A</span>
              <div>
                <div className="font-semibold">AWS SES</div>
                <div className="text-xs text-slate-500 font-normal">Pay per email &bull; High volume</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Go to <a href="https://console.aws.amazon.com/ses/" target="_blank" className="text-blue-600 underline">AWS SES Console</a></li>
                <li>Navigate to <b>SMTP settings</b> in the left sidebar</li>
                <li>Click <b>"Create SMTP credentials"</b></li>
                <li>Create an IAM user (default name is fine)</li>
                <li>Download the credentials file or copy the username/password</li>
                <li><b>Important:</b> SES starts in sandbox mode — verify sender/recipient emails</li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>email-smtp.us-east-1.amazonaws.com</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>465</b> (SSL) or <b>587</b> (TLS)</div>
                  <div><span className="text-slate-500">Username:</span> <b>AKIA...</b> (IAM access key)</div>
                  <div><span className="text-slate-500">TLS:</span> <b>Enabled</b></div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs">
                <b>Note:</b> Change the region in the SMTP host to match your SES region (e.g., <code className="bg-slate-100 px-1 rounded">email-smtp.eu-west-1.amazonaws.com</code> for EU).
              </div>
            </div>
          </details>

          {/* SendGrid */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">S</span>
              <div>
                <div className="font-semibold">SendGrid</div>
                <div className="text-xs text-slate-500 font-normal">100 free/day &bull; API key as password</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Sign up at <a href="https://signup.sendgrid.com/" target="_blank" className="text-blue-600 underline">signup.sendgrid.com</a></li>
                <li>Go to <b>Settings &rarr; API Keys</b></li>
                <li>Click <b>"Create API Key"</b></li>
                <li>Give it a name and select <b>"Restricted Access"</b></li>
                <li>Under "Mail Send", toggle <b>"Full Access"</b></li>
                <li>Click <b>"Create & View"</b> and copy the API key</li>
                <li>Username is literally <b>"apikey"</b> (not your email)</li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>smtp.sendgrid.net</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>587</b></div>
                  <div><span className="text-slate-500">Username:</span> <b>apikey</b></div>
                  <div><span className="text-slate-500">TLS:</span> <b>Enabled</b></div>
                </div>
              </div>
            </div>
          </details>

          {/* Mailgun */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">M</span>
              <div>
                <div className="font-semibold">Mailgun</div>
                <div className="text-xs text-slate-500 font-normal">Free trial &bull; API key as password</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Sign up at <a href="https://www.mailgun.com/" target="_blank" className="text-blue-600 underline">mailgun.com</a></li>
                <li>Go to <b>Sending &rarr; Domain settings</b></li>
                <li>Add and verify your sending domain</li>
                <li>Go to <b>API &rarr; API keys</b></li>
                <li>Copy the <b>"Private API key"</b></li>
                <li>Username is <b>"postmaster"</b> followed by your domain</li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>smtp.mailgun.org</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>587</b></div>
                  <div><span className="text-slate-500">Username:</span> <b>postmaster@yourdomain.com</b></div>
                  <div><span className="text-slate-500">TLS:</span> <b>Enabled</b></div>
                </div>
              </div>
            </div>
          </details>

          {/* Mailjet */}
          <details className="group border border-slate-200 rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 font-medium text-slate-800 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">J</span>
              <div>
                <div className="font-semibold">Mailjet</div>
                <div className="text-xs text-slate-500 font-normal">6,000 free/month &bull; API key as password</div>
              </div>
              <svg className="w-4 h-4 ml-auto text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </summary>
            <div className="px-4 py-4 text-sm text-slate-600 space-y-2 border-t border-slate-200">
              <p className="font-semibold text-slate-800">Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-1">
                <li>Sign up at <a href="https://www.mailjet.com/" target="_blank" className="text-blue-600 underline">mailjet.com</a></li>
                <li>Go to <b>Account Management &rarr; API Key Management</b></li>
                <li>Copy the <b>Secret Key</b> (not the API key)</li>
                <li>Username is the <b>API Key</b>, password is the <b>Secret Key</b></li>
              </ol>
              <div className="bg-slate-50 rounded-lg p-3 mt-2 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">SMTP Host:</span> <b>in-v3.mailjet.com</b></div>
                  <div><span className="text-slate-500">Port:</span> <b>587</b></div>
                  <div><span className="text-slate-500">Username:</span> <b>API Key</b></div>
                  <div><span className="text-slate-500">Password:</span> <b>Secret Key</b></div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
