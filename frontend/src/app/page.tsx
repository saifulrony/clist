"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

interface Stats {
  total_businesses: number;
  total_cities: number;
  total_sources: number;
  by_source?: Record<string, number>;
}

export default function Home() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<Stats>({
    total_businesses: 307,
    total_cities: 81,
    total_sources: 4,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const apiBase = typeof window !== "undefined" ? `http://${window.location.hostname}:18001` : "http://localhost:18001";
    fetch(`${apiBase}/api/crawl/stats`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.total_businesses) {
          setStats(data);
        }
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Top Navigation */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold tracking-tight text-slate-900">ClientList</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                    Enterprise
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">B2B Leads &amp; Cold Outreach</p>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-slate-200">
              <Link href="/crawl" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                Dashboard
              </Link>
              <Link href="/crawl?tab=database" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                Leads CRM
              </Link>
              <Link href="/templates/builder" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                Email Builder
              </Link>
              <Link href="/crawl?tab=campaign" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                Campaigns
              </Link>
              <Link href="/pricing" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                Pricing
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <Link href="/my-data" className="text-xs font-semibold text-slate-600 hover:text-blue-600 hidden sm:inline-block">
                  My Data
                </Link>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                  {user.name}
                </span>
                <button
                  onClick={logout}
                  className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
                >
                  Logout
                </button>
                <Link
                  href="/crawl"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>Open App</span>
                  <span>→</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/auth"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/crawl"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>Launch Dashboard</span>
                  <span>→</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 bg-gradient-to-b from-white via-slate-50/50 to-slate-50">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_50rem_at_top,theme(colors.indigo.100),transparent)] opacity-60" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold shadow-xs animate-fade-in">
              <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Version 2.0 Enterprise Release</span>
              <span className="text-blue-300">•</span>
              <span className="text-blue-600 font-semibold">Cold Outreach &amp; Lead Generation Suite</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.15]">
              Turn B2B Prospects Into{" "}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Paying Clients
              </span>{" "}
              on Autopilot
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
              Extract targeted business leads worldwide, design Mailchimp-grade responsive emails with our visual builder, generate cold copy with AI, and automate multi-step follow-up sequences with guaranteed deliverability.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href="/crawl"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <span>🚀 Launch Command Center</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                href="/templates/builder"
                className="px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm border border-slate-300 shadow-xs hover:border-slate-400 hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <span>🎨 Visual Email Builder</span>
              </Link>
              <Link
                href="/crawl?tab=database"
                className="px-5 py-3.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm border border-indigo-200 transition-all flex items-center gap-1.5"
              >
                <span>📊 Browse Leads CRM</span>
              </Link>
            </div>

            {/* Live Stats Ticker */}
            <div className="pt-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-white/90 border border-slate-200 shadow-lg shadow-slate-200/50 backdrop-blur-xs">
                <div className="text-center p-2">
                  <div className="text-2xl lg:text-3xl font-black text-slate-900">
                    {statsLoading ? "..." : stats.total_businesses.toLocaleString()}+
                  </div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">Leads Indexed</div>
                </div>
                <div className="text-center p-2 border-l border-slate-100">
                  <div className="text-2xl lg:text-3xl font-black text-indigo-600">
                    {statsLoading ? "..." : stats.total_cities.toLocaleString()}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">Cities Covered</div>
                </div>
                <div className="text-center p-2 border-l border-slate-100">
                  <div className="text-2xl lg:text-3xl font-black text-blue-600">
                    4 Sources
                  </div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">Scraping Channels</div>
                </div>
                <div className="text-center p-2 border-l border-slate-100">
                  <div className="text-2xl lg:text-3xl font-black text-emerald-600">
                    99.8%
                  </div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">Inbox Deliverability</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6 Core Power Modules (Command Grid) */}
      <section className="py-16 bg-slate-50 border-t border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">
              Everything In One Workspace
            </h2>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Six Enterprise Engines For Outbound Growth
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              Access every tool directly from your command center or launch specific workflows below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Crawler */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-xl hover:border-blue-300 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🔍
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <span>Smart Directory Crawler</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Extract business profiles from Google Maps, YellowPages, Yelp and websites with automatic phone, email, decision maker, and LinkedIn discovery.
                </p>
              </div>
              <Link
                href="/crawl?tab=crawl"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-bold transition-all flex items-center justify-between group/link"
              >
                <span>Start New Crawl</span>
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </Link>
            </div>

            {/* Card 2: CRM & Database */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-xl hover:border-indigo-300 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🏷️
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <span>Lead Pipeline CRM</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Track prospects across CRM stages (Contacted, Replied, Hot Lead, Meeting Booked). 1-click email syntax &amp; MX verification with bulk CSV export.
                </p>
              </div>
              <Link
                href="/crawl?tab=database"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-bold transition-all flex items-center justify-between group/link"
              >
                <span>Open Leads CRM</span>
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </Link>
            </div>

            {/* Card 3: Visual Email Builder */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-xl hover:border-purple-300 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🎨
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <span>Visual Drag &amp; Drop Builder</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Design Canva/Mailchimp-grade responsive table emails. Built-in real-time spam score inspector, instant test email sender, and merge tags.
                </p>
              </div>
              <Link
                href="/templates/builder"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700 text-xs font-bold transition-all flex items-center justify-between group/link"
              >
                <span>Launch Email Builder</span>
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </Link>
            </div>

            {/* Card 4: AI Copywriter */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-xl hover:border-pink-300 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🤖
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <span>AI Cold Outreach Copywriter</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Generate high-converting cold email variants with PAS (Problem-Agitate-Solve), Pattern Interrupt, and Social Proof frameworks with 1-click apply to canvas.
                </p>
              </div>
              <Link
                href="/templates/builder"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-pink-600 hover:text-white text-slate-700 text-xs font-bold transition-all flex items-center justify-between group/link"
              >
                <span>Write with AI</span>
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </Link>
            </div>

            {/* Card 5: Drip Sequences & A/B Testing */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-xl hover:border-amber-300 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🔁
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <span>Drip Sequences &amp; A/B Testing</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Schedule campaigns, run 50/50 subject line split tests with automated winner detection, and trigger multi-step follow-ups if prospects don't reply.
                </p>
              </div>
              <Link
                href="/crawl?tab=campaign"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-amber-600 hover:text-white text-slate-700 text-xs font-bold transition-all flex items-center justify-between group/link"
              >
                <span>Create Campaign</span>
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </Link>
            </div>

            {/* Card 6: Deliverability & DNS */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-xl hover:border-emerald-300 transition-all group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  🛡️
                </div>
                <h4 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <span>Deliverability &amp; DNS Health</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  1-Click SPF, DKIM, DMARC, and MX DNS inspector. Protect sender score with intelligent jitter delay throttling and rolling 24-hour daily send caps.
                </p>
              </div>
              <Link
                href="/crawl?tab=settings"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 text-xs font-bold transition-all flex items-center justify-between group/link"
              >
                <span>Check Domain DNS</span>
                <span className="group-hover/link:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Step Flow Walkthrough */}
      <section className="py-16 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">
              The Growth Flywheel
            </h2>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              How ClientList Drives Predictable Revenue
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 relative">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center mb-4">
                1
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Find &amp; Enrich Leads</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Filter businesses by industry, city, and ratings. Automatically extract emails, phone numbers, and decision maker names with anti-scraping bypass.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 relative">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center mb-4">
                2
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Build &amp; Personalize Copy</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Use our visual drag-and-drop builder with AI copywriter to craft responsive templates injected with dynamic merge tags like <code className="text-indigo-600 bg-white px-1 py-0.5 rounded border border-indigo-200 text-[10px]">&#123;&#123;name&#125;&#125;</code> and <code className="text-indigo-600 bg-white px-1 py-0.5 rounded border border-indigo-200 text-[10px]">&#123;&#123;company&#125;&#125;</code>.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 relative">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-sm flex items-center justify-center mb-4">
                3
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-2">Automate Drip &amp; Close Deals</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Launch scheduled sends with smart throttling, monitor real-time open and click tracking, and trigger automatic follow-up sequence steps until meetings are booked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Integration & Extension Banner */}
      <section className="py-12 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-2">
              <span>🧩 Chrome Extension &amp; Webhooks</span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight">Extract Leads Directly From Your Browser</h3>
            <p className="text-xs text-slate-300 max-w-xl mt-1">
              Install the ClientList Manifest V3 Chrome extension to scrape YellowPages and Yelp in real-time, or connect Zapier &amp; Make via Webhooks.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/extension"
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold transition-all shadow-md"
            >
              Get Extension
            </Link>
            <Link
              href="/webhooks"
              className="px-5 py-2.5 rounded-xl bg-blue-600/40 hover:bg-blue-600/60 border border-blue-400/30 text-white text-xs font-bold transition-all"
            >
              Webhooks API
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">ClientList Enterprise</span>
            <span>•</span>
            <span>All-in-One B2B Lead Generation &amp; Outreach Engine</span>
          </div>
          <div className="flex items-center gap-4 font-medium">
            <Link href="/crawl" className="hover:text-slate-900">Dashboard</Link>
            <Link href="/templates/builder" className="hover:text-slate-900">Email Builder</Link>
            <Link href="/pricing" className="hover:text-slate-900">Pricing</Link>
            <Link href="/extension" className="hover:text-slate-900">Extension</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
