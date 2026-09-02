"use client";

import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";

const availableEvents = [
  { id: "campaign.sent", label: "Campaign Sent", icon: "📨" },
  { id: "campaign.opened", label: "Campaign Opened", icon: "👁️" },
  { id: "campaign.clicked", label: "Campaign Clicked", icon: "🖱️" },
  { id: "business.crawled", label: "Business Crawled", icon: "🌐" },
  { id: "business.enriched", label: "Business Enriched", icon: "💎" },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [activeDocTab, setActiveDocTab] = useState("campaign.opened");
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<{ [id: number]: { ok: boolean; msg: string } }>({});
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[] });
  const apiBase = typeof window !== "undefined" ? `http://${window.location.hostname}:18001` : "";

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/webhooks`);
      if (res.ok) setWebhooks((await res.json()) || []);
    } catch (e) {}
    setLoading(false);
  };

  const saveWebhook = async () => {
    if (!form.name.trim() || !form.url.trim() || form.events.length === 0) {
      alert("Name, URL, and at least one event are required");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/webhooks/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ name: "", url: "", events: [] });
        fetchWebhooks();
      }
    } catch (e) {
      alert("Failed to save webhook");
    }
  };

  const deleteWebhook = async (id: number) => {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`${apiBase}/api/webhooks/${id}`, { method: "DELETE" });
    fetchWebhooks();
  };

  const testWebhook = async (id: number) => {
    setTestingId(id);
    try {
      const res = await fetch(`${apiBase}/api/webhooks/${id}/test`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setTestResults((prev) => ({
          ...prev,
          [id]: { ok: true, msg: data.message || "Delivered! (HTTP 200 OK)" },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [id]: { ok: false, msg: data.error || `HTTP ${data.status_code || "Failed"}` },
        }));
      }
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, msg: e.message || "Connection failed" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const toggleEvent = (eventId: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter((e) => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  const samplePayloads: Record<string, any> = {
    "campaign.opened": {
      event: "campaign.opened",
      timestamp: "2026-09-02T03:30:00Z",
      campaign: { id: 12, name: "Agency Cold Outreach Q3" },
      lead: {
        email: "ceo@targetcompany.com",
        name: "Sarah Connor",
        company: "Cyberdyne Corp",
        city: "Austin, TX",
      },
    },
    "campaign.clicked": {
      event: "campaign.clicked",
      timestamp: "2026-09-02T03:32:15Z",
      campaign: { id: 12, name: "Agency Cold Outreach Q3" },
      url_clicked: "https://youragency.com/demo",
      lead: {
        email: "ceo@targetcompany.com",
        company: "Cyberdyne Corp",
      },
    },
    "business.crawled": {
      event: "business.crawled",
      timestamp: "2026-09-02T03:35:00Z",
      business: {
        name: "Austin Creative Agency",
        phone: "+1 512-555-0199",
        website: "https://austincreative.com",
        email: "hello@austincreative.com",
        category: "Marketing Agency",
        city: "Austin",
      },
    },
  };

  return (
    <DashboardLayout
      title="Webhooks"
      subtitle="Send real-time event notifications to Zapier, Make, n8n, Google Sheets, or any API endpoint"
    >
      <div className="space-y-6">
        {/* Visual Quick-Start Guide Banner */}
        <div className="card p-6 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-white border border-blue-100 rounded-2xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">⚡</span>
                <h3 className="text-sm font-bold text-slate-900">How to Use Webhooks in 3 Easy Steps</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                Webhooks allow ClientList to automatically push instant data whenever a client opens an email, clicks a link, or a new business is crawled.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDocs(!showDocs)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              >
                {showDocs ? "Hide Payload Docs" : "📖 View Payload Format"}
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <span>+</span>
                <span>New Webhook</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-blue-100/80">
            <div className="bg-white/80 p-3 rounded-xl border border-blue-100/70">
              <div className="text-[11px] font-bold text-blue-700 mb-0.5">1. Get a Webhook URL</div>
              <div className="text-[11px] text-slate-500 leading-normal">
                Create a <strong>Catch Hook</strong> in Zapier/Make.com, or get a free instant URL from <a href="https://webhook.site" target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">Webhook.site</a>.
              </div>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-blue-100/70">
              <div className="text-[11px] font-bold text-blue-700 mb-0.5">2. Add Webhook Here</div>
              <div className="text-[11px] text-slate-500 leading-normal">
                Click <strong>New Webhook</strong>, paste your URL, and select triggers like <code>campaign.opened</code> or <code>campaign.clicked</code>.
              </div>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-blue-100/70">
              <div className="text-[11px] font-bold text-blue-700 mb-0.5">3. Send Instant Test</div>
              <div className="text-[11px] text-slate-500 leading-normal">
                Click <strong>⚡ Test Webhook</strong> to transmit a real JSON payload to your receiver and verify delivery!
              </div>
            </div>
          </div>
        </div>

        {/* JSON Payload Documentation Drawer */}
        {showDocs && (
          <div className="card p-6 bg-slate-900 text-slate-100 animate-slide-down rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-sm">📄</span>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Real-time JSON Payload Specification
                </h4>
              </div>
              <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
                {Object.keys(samplePayloads).map((evt) => (
                  <button
                    key={evt}
                    onClick={() => setActiveDocTab(evt)}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-mono transition-colors ${
                      activeDocTab === evt ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {evt}
                  </button>
                ))}
              </div>
            </div>
            <pre className="text-xs font-mono bg-slate-950 p-4 rounded-xl overflow-x-auto text-emerald-400 leading-relaxed border border-slate-800">
              {JSON.stringify(samplePayloads[activeDocTab], null, 2)}
            </pre>
          </div>
        )}

        {/* New Webhook Creation Modal / Form */}
        {showForm && (
          <div className="card p-6 animate-slide-down border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Create Outgoing Webhook</h3>
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field text-xs"
                  placeholder="e.g. Zapier CRM Integration"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Destination Endpoint URL (HTTP POST)
                </label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="input-field text-xs font-mono"
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Events to Trigger Webhook
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {availableEvents.map((ev) => {
                  const isSelected = form.events.includes(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => toggleEvent(ev.id)}
                      className={`p-2.5 rounded-xl text-left border text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-400"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <span>{ev.icon}</span>
                      <span className="truncate">{ev.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={saveWebhook}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
              >
                Save & Enable Webhook
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Webhook List */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="card p-12 text-center text-xs text-slate-400">
            <div className="text-3xl mb-2">⚡</div>
            <div className="font-semibold text-slate-700 mb-1">No webhooks configured yet</div>
            <p className="max-w-md mx-auto text-slate-400 mb-4">
              Click &quot;New Webhook&quot; above to connect ClientList to Zapier, Make.com, or your custom CRM.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((w: any) => {
              const testRes = testResults[w.id];
              return (
                <div key={w.id} className="card p-5 hover:shadow-xs transition-all border border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <h4 className="font-bold text-sm text-slate-900">{w.name}</h4>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            w.status === "active" || w.active === 1
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {w.status || "active"}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-500 truncate">{w.url}</p>

                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {((typeof w.events === "string" ? JSON.parse(w.events || "[]") : w.events) || []).map(
                          (ev: string) => (
                            <span
                              key={ev}
                              className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono font-medium"
                            >
                              {ev}
                            </span>
                          )
                        )}
                      </div>

                      {/* Live Test Response Status */}
                      {testRes && (
                        <div
                          className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            testRes.ok
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          <span>{testRes.ok ? "✅" : "❌"}</span>
                          <span>{testRes.msg}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => testWebhook(w.id)}
                        disabled={testingId === w.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Send a live test event to this endpoint"
                      >
                        <span>{testingId === w.id ? "⏳" : "⚡"}</span>
                        <span>{testingId === w.id ? "Testing..." : "Test Webhook"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(w.secret || "");
                          alert("Webhook secret copied to clipboard!");
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                        title="Copy HMAC signing secret"
                      >
                        Secret
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteWebhook(w.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
