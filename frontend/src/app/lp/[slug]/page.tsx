"use client";

import React, { useEffect, useState, use } from "react";

interface LandingPageProps {
  params: Promise<{ slug: string }>;
}

export default function PublicLandingPage({ params }: LandingPageProps) {
  const { slug } = use(params);
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const apiBase = typeof window !== "undefined" ? `http://${window.location.hostname}:18001` : "";

  useEffect(() => {
    if (!slug) return;
    fetch(`${apiBase}/lp/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Landing page not found");
        return res.json();
      })
      .then((data) => {
        setPage(data);
        // Initialize form fields
        let fields: string[] = [];
        try {
          if (data.form_fields) {
            fields = typeof data.form_fields === "string" && data.form_fields.startsWith("[")
              ? JSON.parse(data.form_fields)
              : data.form_fields.split(",").map((f: string) => f.trim());
          }
        } catch {
          fields = ["email", "name"];
        }
        const initialForm: Record<string, string> = {};
        fields.forEach((f) => {
          if (f) initialForm[f] = "";
        });
        setFormData(initialForm);
      })
      .catch((err) => {
        setErrorMsg(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug, apiBase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBase}/lp/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to submit. Please ensure page is published.");
      }

      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <div className="text-xs font-semibold text-slate-500">Loading page...</div>
        </div>
      </div>
    );
  }

  if (errorMsg || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Landing Page Not Found</h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            The requested landing page might be in draft mode or the link is incorrect.
          </p>
          <a
            href="/landing-pages"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            Go to Landing Pages
          </a>
        </div>
      </div>
    );
  }

  // Determine theme styles
  const isDark = page.theme === "dark";
  const isMinimal = page.theme === "minimal";
  const isBold = page.theme === "bold";

  let fields: string[] = [];
  try {
    if (page.form_fields) {
      fields = typeof page.form_fields === "string" && page.form_fields.startsWith("[")
        ? JSON.parse(page.form_fields)
        : page.form_fields.split(",").map((f: string) => f.trim());
    }
  } catch {
    fields = ["email", "name"];
  }

  return (
    <div
      className={`min-h-screen flex flex-col justify-between transition-colors ${
        isDark
          ? "bg-[#090d16] text-white"
          : isBold
          ? "bg-gradient-to-br from-indigo-900 via-blue-900 to-indigo-950 text-white"
          : isMinimal
          ? "bg-[#fafafa] text-slate-900"
          : "bg-gradient-to-b from-blue-50/70 via-white to-slate-50 text-slate-900"
      }`}
    >
      {/* Header Bar */}
      <header className="px-6 py-6 max-w-5xl mx-auto w-full flex items-center justify-between">
        <div className="font-black text-lg tracking-tight flex items-center gap-2">
          <span className="text-xl">🚀</span>
          <span>{page.title}</span>
        </div>
        {page.published !== 1 && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
            Preview Mode (Unpublished)
          </span>
        )}
      </header>

      {/* Main Hero & Form */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-4xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left: Headlines & Value Prop */}
          <div className="lg:col-span-7 space-y-5 text-left">
            <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
              Exclusive Access
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.15]">
              {page.subheadline || page.title}
            </h1>

            {page.description && (
              <p
                className={`text-sm sm:text-base leading-relaxed ${
                  isDark || isBold ? "text-slate-300" : "text-slate-600"
                }`}
              >
                {page.description}
              </p>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span className={isDark || isBold ? "text-slate-300" : "text-slate-600"}>
                  Instant Confirmation
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span className={isDark || isBold ? "text-slate-300" : "text-slate-600"}>
                  Zero Spam Guarantee
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span className={isDark || isBold ? "text-slate-300" : "text-slate-600"}>
                  Opt-out Anytime
                </span>
              </div>
            </div>
          </div>

          {/* Right: Lead Capture Form Card */}
          <div className="lg:col-span-5">
            <div
              className={`p-6 sm:p-8 rounded-3xl shadow-2xl transition-all border ${
                isDark
                  ? "bg-white/[0.04] border-white/10 backdrop-blur-md"
                  : isBold
                  ? "bg-white/10 border-white/20 backdrop-blur-md text-white"
                  : isMinimal
                  ? "bg-white border-slate-200"
                  : "bg-white border-slate-100"
              }`}
            >
              {submitted ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-2xl border border-emerald-500/30">
                    🎉
                  </div>
                  <h3 className="text-lg font-bold">Thank You!</h3>
                  <p
                    className={`text-xs ${
                      isDark || isBold ? "text-slate-300" : "text-slate-500"
                    } leading-relaxed`}
                  >
                    Your information has been received successfully. We will reach out shortly!
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="mb-2">
                    <h3 className="text-base font-bold">Get In Touch</h3>
                    <p
                      className={`text-xs ${
                        isDark || isBold ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      Fill out the form below to receive immediate access.
                    </p>
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
                      {errorMsg}
                    </div>
                  )}

                  {fields.map((field) => {
                    const label = field.charAt(0).toUpperCase() + field.slice(1).replace("_", " ");
                    const inputType =
                      field.toLowerCase().includes("email")
                        ? "email"
                        : field.toLowerCase().includes("phone")
                        ? "tel"
                        : "text";

                    return (
                      <div key={field}>
                        <label
                          className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                            isDark || isBold ? "text-slate-300" : "text-slate-700"
                          }`}
                        >
                          {label}
                        </label>
                        <input
                          type={inputType}
                          required={field === "email"}
                          value={formData[field] || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, [field]: e.target.value })
                          }
                          placeholder={`Enter your ${label.toLowerCase()}...`}
                          className={`w-full text-xs px-3.5 py-2.5 rounded-xl outline-none transition-all ${
                            isDark || isBold
                              ? "bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:border-blue-400 focus:bg-white/15"
                              : "bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white"
                          }`}
                        />
                      </div>
                    );
                  })}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full mt-2 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <span>Processing...</span>
                    ) : (
                      <>
                        <span>{page.button_text || "Submit Now"}</span>
                        <span>→</span>
                      </>
                    )}
                  </button>

                  <p
                    className={`text-[10px] text-center pt-1 ${
                      isDark || isBold ? "text-slate-400" : "text-slate-400"
                    }`}
                  >
                    🔒 Your privacy is fully protected.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-4 text-center text-xs opacity-60">
        &copy; {new Date().getFullYear()} {page.title}. Powered by ClientList.
      </footer>
    </div>
  );
}
