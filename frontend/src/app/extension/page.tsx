"use client";

import { useState } from "react";
import Link from "next/link";

const steps = [
  {
    title: "Open Chrome Extensions",
    description: "Navigate to chrome://extensions in your browser",
    action: "Copy URL",
    url: "chrome://extensions",
  },
  {
    title: "Enable Developer Mode",
    description: "Toggle the Developer mode switch in the top-right corner",
    action: null,
  },
  {
    title: "Load Unpacked Extension",
    description: 'Click "Load unpacked" and select the "extension" folder from this project',
    action: null,
  },
  {
    title: "Pin the Extension",
    description: "Click the puzzle icon in Chrome toolbar and pin ClientList Scraper",
    action: null,
  },
];

const supportedSites = [
  { name: "Google Maps", icon: "🗺️", url: "google.com/maps", color: "#4285F4" },
  { name: "Yelp", icon: "📋", url: "yelp.com", color: "#d32323" },
  { name: "Yellow Pages", icon: "📒", url: "yellowpages.com", color: "#ffcc00" },
];

export default function ExtensionPage() {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const handleCopyUrl = (url: string, step: number) => {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3" style={{ textDecoration: "none" }}>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Browser Extension</h1>
                  <p className="text-xs text-slate-500">Extract data directly from web pages</p>
                </div>
              </Link>
            </div>
            <Link href="/crawl" className="btn-primary flex items-center gap-2" style={{ textDecoration: "none" }}>
              Open Crawler
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero */}
        <div className="card p-8 mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 flex-shrink-0">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div className="text-center md:text-left">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">ClientList Browser Scraper</h2>
              <p className="text-slate-600 max-w-xl">
                Visit any supported directory website, and the extension will automatically detect business listings.
                Click one button to save all extracted data directly to your ClientList database.
              </p>
            </div>
          </div>
        </div>

        {/* Supported Sites */}
        <div className="card p-6 mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Supported Websites</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {supportedSites.map((site) => (
              <div key={site.name} className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                <span className="text-2xl">{site.icon}</span>
                <div>
                  <div className="font-medium text-slate-900">{site.name}</div>
                  <div className="text-xs text-slate-500">{site.url}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Installation Steps */}
        <div className="card p-6 mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Installation Guide</h3>
          <div className="space-y-6">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-blue-600">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900">{step.title}</h4>
                  <p className="text-sm text-slate-600 mt-1">{step.description}</p>
                  {step.url && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-700 font-mono">{step.url}</code>
                      <button
                        onClick={() => handleCopyUrl(step.url, i)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        {copiedStep === i ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How it Works */}
        <div className="card p-6 mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <h4 className="font-medium text-slate-900 mb-1">1. Browse</h4>
              <p className="text-sm text-slate-600">Visit Google Maps, Yelp, or Yellow Pages and search for businesses</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h4 className="font-medium text-slate-900 mb-1">2. Extract</h4>
              <p className="text-sm text-slate-600">The extension automatically detects business listings on the page</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <h4 className="font-medium text-slate-900 mb-1">3. Save</h4>
              <p className="text-sm text-slate-600">Click Save to send all extracted data directly to your database</p>
            </div>
          </div>
        </div>

        {/* Extension Folder Path */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Extension Location</h3>
          <div className="flex items-center gap-3 p-4 bg-slate-100 rounded-xl">
            <svg className="w-5 h-5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <code className="text-sm text-slate-700 font-mono break-all">
              /home/saiful/Projects/client-list/extension
            </code>
          </div>
        </div>
      </main>
    </div>
  );
}
