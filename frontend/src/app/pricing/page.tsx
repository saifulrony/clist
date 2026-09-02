"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface Plan {
  id: string;
  name: string;
  price: number;
  emails: number;
  contacts: number;
  features: string[];
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [currentPlan, setCurrentPlan] = useState("free");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const apiBase = typeof window !== "undefined" ? `http://${window.location.hostname}:18001` : "";

  useEffect(() => {
    fetch(`${apiBase}/api/pricing`)
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data)) setPlans(data);
      })
      .catch(() => {});

    fetch(`${apiBase}/api/subscription`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.plan) setCurrentPlan(data.plan);
      })
      .catch(() => {});
  }, [apiBase]);

  const handleOpenCheckout = (plan: Plan) => {
    setSelectedPlan(plan);
    setCheckoutModalOpen(true);
  };

  const handleConfirmUpgrade = async () => {
    if (!selectedPlan) return;
    setProcessing(true);

    try {
      const res = await fetch(`${apiBase}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan.id,
          interval: billingCycle === "annual" ? "year" : "month",
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.checkout_url && data.checkout_url !== "#" && data.checkout_url !== "") {
          window.location.href = data.checkout_url;
          return;
        }
        setCurrentPlan(selectedPlan.id);
        setSuccessMsg(data.message || `Successfully upgraded to ${selectedPlan.name}!`);
        setTimeout(() => {
          setCheckoutModalOpen(false);
          setSuccessMsg(null);
        }, 2200);
      } else {
        alert(data.error || "Failed to initiate checkout");
      }
    } catch (e) {
      alert("Checkout connection failed");
    }
    setProcessing(false);
  };

  const getPrice = (basePrice: number) => {
    if (billingCycle === "annual") {
      return Math.round(basePrice * 0.8);
    }
    return basePrice;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 py-12 px-4 select-none">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100/80 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
            🚀 Commercial B2B Growth Plans
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-xl mx-auto">
            Unlimited scraping, verified emails, and high-deliverability cold outreach for agencies and growth teams.
          </p>

          {/* Billing Cycle Toggle */}
          <div className="mt-8 inline-flex items-center bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                billingCycle === "monthly"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingCycle === "annual"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-extrabold uppercase">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isPro = plan.id === "pro";
            const price = getPrice(plan.price);

            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl p-6 bg-white transition-all flex flex-col justify-between border-2 ${
                  isPro
                    ? "border-blue-600 shadow-xl shadow-blue-500/10 scale-102 z-10"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-md"
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full px-3.5 py-1 shadow-md">
                    MOST POPULAR FOR AGENCIES
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="mt-2 mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-slate-900">${price}</span>
                      <span className="text-slate-500 text-xs font-semibold">/month</span>
                    </div>
                    {billingCycle === "annual" && plan.price > 0 && (
                      <div className="text-[11px] text-green-600 font-semibold mt-1">
                        Billed annually (${price * 12}/yr)
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl mb-5 space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Monthly Emails:</span>
                      <span className="font-bold text-slate-900">{plan.emails.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lead Storage:</span>
                      <span className="font-bold text-slate-900">{plan.contacts.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Included Features:
                  </div>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{f}</span>
                      </li>
                    ))}
                    <li className="flex items-start gap-2 text-xs text-slate-700">
                      <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Real-time MX Email Verification</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs text-slate-700">
                      <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Drag & Drop Mailchimp-Grade Builder</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleOpenCheckout(plan)}
                  disabled={isCurrent}
                  className={`w-full py-3 rounded-2xl text-xs font-bold transition-all shadow-xs ${
                    isCurrent
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : isPro
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {isCurrent ? "Current Plan" : plan.price === 0 ? "Get Started Free" : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ Section for Commercial Trust */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 mb-12 shadow-xs">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
            <p className="text-sm text-slate-500">Everything you need to know about our lead generation platform</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <div className="p-4 bg-slate-50 rounded-2xl">
              <h4 className="font-bold text-sm text-slate-900 mb-1">How does email verification protect my domain?</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Before sending campaigns, our verification engine runs syntax tests, disposable domain filters, MX record checks, and polite SMTP handshakes to ensure you only email live inboxes, keeping your bounce rate under 2%.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl">
              <h4 className="font-bold text-sm text-slate-900 mb-1">Can I use my own SMTP email accounts?</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Yes! You can connect custom SMTP credentials from Google Workspace, Microsoft 365, SendGrid, Amazon SES, or private mail servers with automated throttling and Spintax support.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl">
              <h4 className="font-bold text-sm text-slate-900 mb-1">How does the Chrome Extension work?</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                The Chrome extension extracts local businesses directly from Google Maps and Yelp tabs using your residential IP, eliminating Cloudflare bot-blocks and syncing leads straight to your database.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl">
              <h4 className="font-bold text-sm text-slate-900 mb-1">Can I cancel or change plans anytime?</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Yes, there are no long-term contracts. You can upgrade, downgrade, or cancel your subscription at any time directly from this page.
              </p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link href="/crawl" className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Checkout Confirmation Modal */}
      {checkoutModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-slide-down">
            {successMsg ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">🎉</div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Upgrade Confirmed!</h3>
                <p className="text-xs text-slate-500">{successMsg}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Confirm Subscription</h3>
                    <p className="text-xs text-slate-400">Upgrade to {selectedPlan.name} Tier</p>
                  </div>
                  <button
                    onClick={() => setCheckoutModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>

                {/* Plan Summary */}
                <div className="p-4 bg-slate-50 rounded-2xl mb-5 space-y-2">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Plan:</span>
                    <span className="font-bold text-slate-900">{selectedPlan.name}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Billing Cycle:</span>
                    <span className="font-bold capitalize text-slate-900">{billingCycle}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Included Emails:</span>
                    <span className="font-bold text-slate-900">{selectedPlan.emails.toLocaleString()}/mo</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200/80 flex justify-between text-sm">
                    <span className="font-bold text-slate-900">Total Due Today:</span>
                    <span className="font-extrabold text-blue-600">
                      ${billingCycle === "annual" ? getPrice(selectedPlan.price) * 12 : getPrice(selectedPlan.price)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 rounded-xl mb-6 flex items-center gap-2.5 text-xs text-blue-800">
                  <span>🔒</span>
                  <span>SSL Encrypted Checkout • Instant Access Guaranteed</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleConfirmUpgrade}
                    disabled={processing}
                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processing ? "Activating Plan..." : `Confirm & Activate ${selectedPlan.name}`}
                  </button>
                  <button
                    onClick={() => setCheckoutModalOpen(false)}
                    className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
