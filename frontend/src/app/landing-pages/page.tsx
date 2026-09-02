"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

export default function LandingPagesPage() {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submissions, setSubmissions] = useState<any[] | null>(null);
  const [form, setForm] = useState({ title: "", headline: "", description: "", slug: "", theme: "default", form_fields: "name,email,phone,company", button_text: "Get Started" });
  const apiBase = typeof window !== "undefined" ? `http://${window.location.hostname}:18001` : "";

  useEffect(() => { fetchPages(); }, []);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/landing-pages`);
      if (res.ok) setPages((await res.json()) || []);
    } catch (e) {}
    setLoading(false);
  };

  const savePage = async () => {
    if (!form.title || !form.slug) { alert("Title and slug are required"); return; }
    try {
      const res = await fetch(`${apiBase}/api/landing-pages/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, form_fields: form.form_fields.split(",").map((f) => f.trim()) }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ title: "", headline: "", description: "", slug: "", theme: "default", form_fields: "name,email,phone,company", button_text: "Get Started" });
        fetchPages();
      }
    } catch (e) { alert("Failed to save"); }
  };

  const togglePublish = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    await fetch(`${apiBase}/api/landing-pages/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchPages();
  };

  const viewSubmissions = async (id: number) => {
    try {
      const res = await fetch(`${apiBase}/api/landing-pages/${id}/submissions`);
      if (res.ok) setSubmissions((await res.json()) || []);
    } catch (e) {}
  };

  const themes = ["default", "dark", "minimal", "bold"];

  return (
    <DashboardLayout title="Landing Pages" subtitle="Create high-converting landing pages to collect leads">
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Landing Page
          </button>
        </div>

        {showForm && (
          <div className="card p-6 animate-slide-down">
            <h3 className="font-semibold text-slate-900 mb-4">New Landing Page</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" placeholder="Product Launch" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">URL Slug</label>
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.replace(/[^a-z0-9-]/g, "") })} className="input-field" placeholder="product-launch" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Headline</label>
                <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="input-field" placeholder="Revolutionize Your Workflow" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Theme</label>
                <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="input-field">
                  {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} placeholder="A brief description of your landing page..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Form Fields (comma-separated)</label>
                <input value={form.form_fields} onChange={(e) => setForm({ ...form, form_fields: e.target.value })} className="input-field" placeholder="name,email,phone,company" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Button Text</label>
                <input value={form.button_text} onChange={(e) => setForm({ ...form, button_text: e.target.value })} className="input-field" placeholder="Get Started" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={savePage} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">Create Page</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        )}

        {submissions && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Submissions</h3>
              <button onClick={() => setSubmissions(null)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
            </div>
            {submissions.length === 0 ? (
              <p className="text-sm text-slate-400">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 text-slate-500 font-medium">Name</th>
                      <th className="text-left py-2 px-3 text-slate-500 font-medium">Email</th>
                      <th className="text-left py-2 px-3 text-slate-500 font-medium">Phone</th>
                      <th className="text-left py-2 px-3 text-slate-500 font-medium">Company</th>
                      <th className="text-left py-2 px-3 text-slate-500 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s: any, i: number) => {
                      let parsed: any = {};
                      try {
                        parsed = typeof s.data === "string" ? JSON.parse(s.data) : (s.data || {});
                      } catch {}
                      const name = parsed.name || s.name || "-";
                      const email = parsed.email || s.email || "-";
                      const phone = parsed.phone || s.phone || "-";
                      const company = parsed.company || "-";
                      const date = s.created_at || s.submitted_at;
                      return (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-800">{name}</td>
                          <td className="py-2 px-3 text-slate-600">{email}</td>
                          <td className="py-2 px-3 text-slate-600">{phone}</td>
                          <td className="py-2 px-3 text-slate-600">{company}</td>
                          <td className="py-2 px-3 text-xs text-slate-400">
                            {date ? new Date(date).toLocaleString() : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading landing pages...</div>
        ) : pages.length === 0 ? (
          <div className="card p-12 text-center text-sm text-slate-400">No landing pages yet.</div>
        ) : (
          <div className="space-y-3">
            {pages.map((p: any) => (
              <div key={p.id} className="card px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-slate-900">{p.title}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">/{p.slug} &middot; {p.theme} theme &middot; {p.views || 0} views &middot; {p.submission_count || 0} submissions</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/lp/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                  >
                    <span>View Page</span>
                    <span>↗</span>
                  </a>
                  <button onClick={() => togglePublish(p.id, p.status)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${p.status === "published" ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}>
                    {p.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button onClick={() => viewSubmissions(p.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">Submissions</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
