"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { BlockType, EmailBlock, EmailSettings, EmailTemplateData } from "./types";
import { STARTER_TEMPLATES, StarterTemplate } from "./starterTemplates";
import { compileToEmailHtml, parseEmailHtml } from "./emailCompiler";
import BlockPalette from "./BlockPalette";
import PropertyInspector from "./PropertyInspector";
import EmailCanvas from "./EmailCanvas";

const CATEGORIES = ["all", "outreach", "follow-up", "promotion", "newsletter", "general"];

const MERGE_TAGS = [
  { tag: "{{name}}", label: "Contact Name", desc: "e.g. John Doe" },
  { tag: "{{company}}", label: "Company Name", desc: "e.g. Acme Corp" },
  { tag: "{{city}}", label: "City / Location", desc: "e.g. Austin, TX" },
  { tag: "{{category}}", label: "Industry / Category", desc: "e.g. Web Design" },
  { tag: "{{email}}", label: "Recipient Email", desc: "e.g. john@example.com" },
  { tag: "{{unsubscribe_link}}", label: "1-Click Unsubscribe", desc: "CAN-SPAM compliance link" },
  { tag: "{{year}}", label: "Current Year", desc: "e.g. 2026" },
];

export default function TemplatesPageWrapper({ defaultMode = "gallery" }: { defaultMode?: "gallery" | "builder" }) {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-slate-400 bg-slate-50">Loading templates...</div>}>
      <TemplatesPage defaultMode={defaultMode} />
    </Suspense>
  );
}

function TemplatesPage({ defaultMode = "gallery" }: { defaultMode?: "gallery" | "builder" }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const modeParam = searchParams.get("mode");
  const idParam = searchParams.get("id");
  const actionParam = searchParams.get("action");

  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Mode: "gallery" | "builder"
  const isInitialBuilder = defaultMode === "builder" || modeParam === "builder" || !!idParam || actionParam === "new";
  const [currentMode, setCurrentMode] = useState<"gallery" | "builder">(isInitialBuilder ? "builder" : "gallery");

  // Builder State
  const [editingId, setEditingId] = useState<number | null>(idParam ? parseInt(idParam, 10) || null : null);
  const [templateName, setTemplateName] = useState("Untitled Template");
  const [templateSubject, setTemplateSubject] = useState("Exciting opportunity for {{company}}");
  const [templateCategory, setTemplateCategory] = useState("outreach");
  const [blocks, setBlocks] = useState<EmailBlock[]>(STARTER_TEMPLATES[0].blocks);
  const [settings, setSettings] = useState<EmailSettings>(STARTER_TEMPLATES[0].settings);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile" | "code">("desktop");
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [showStarterModal, setShowStarterModal] = useState(actionParam === "new" && !idParam);
  const [starterCategory, setStarterCategory] = useState<string>("all");
  const [starterSearch, setStarterSearch] = useState<string>("");
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);

  // Mailchimp Feature Additions
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [showMergeTagsMenu, setShowMergeTagsMenu] = useState(false);
  const [showSpamInspector, setShowSpamInspector] = useState(false);

  // AI Copy Assistant state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiNiche, setAiNiche] = useState("Dental Clinics");
  const [aiOffer, setAiOffer] = useState("10 New Implant Patients / Month Guarantee");
  const [aiTone, setAiTone] = useState("Direct & Conversational");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVariants, setAiVariants] = useState<any[]>([]);

  const apiBase = typeof window !== "undefined" ? `http://${window.location.hostname}:18001` : "";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const updateUrl = (mode: "gallery" | "builder", id?: number | null, action?: string) => {
    const isDedicatedBuilder = typeof window !== "undefined" && window.location.pathname.startsWith("/templates/builder");
    const basePath = isDedicatedBuilder ? "/templates/builder" : "/templates";

    if (mode === "gallery") {
      router.push("/templates");
    } else {
      const params = new URLSearchParams();
      if (!isDedicatedBuilder) {
        params.set("mode", "builder");
      }
      if (id) {
        params.set("id", String(id));
      }
      if (action) {
        params.set("action", action);
      }
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    }
  };

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data || []);
      }
    } catch (e) {
      console.error("Failed to fetch templates", e);
    }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Sync mode with URL search params
  useEffect(() => {
    if (defaultMode === "builder" || modeParam === "builder" || idParam || actionParam === "new") {
      setCurrentMode("builder");
    } else {
      setCurrentMode("gallery");
    }

    if (actionParam === "new" && !idParam) {
      setEditingId(null);
      setShowStarterModal(true);
    }
  }, [modeParam, idParam, actionParam, defaultMode]);

  // Load template by idParam when present
  useEffect(() => {
    if (!idParam || !apiBase) return;
    const numId = parseInt(idParam, 10);
    if (isNaN(numId)) return;

    const found = templates.find((t) => t.id === numId);
    if (found) {
      applyTemplateData(found);
      return;
    }

    // Direct fetch by ID
    fetch(`${apiBase}/api/templates/${numId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.id) {
          applyTemplateData(data);
        }
      })
      .catch(() => {});
  }, [idParam, templates, apiBase]);

  const applyTemplateData = (t: any) => {
    setEditingId(t.id);
    setTemplateName(t.name || "Untitled Template");
    setTemplateSubject(t.subject || "");
    setTemplateCategory(t.category || "general");

    const parsed = parseEmailHtml(t.body || "");
    if (parsed) {
      setBlocks(parsed.blocks);
      setSettings(parsed.settings);
      setSelectedBlockId(parsed.blocks[0]?.id || null);
    } else {
      setBlocks(STARTER_TEMPLATES[0].blocks);
      setSettings(STARTER_TEMPLATES[0].settings);
      setSelectedBlockId(null);
    }
  };

  // Load a starter template
  const loadStarterTemplate = (starter: StarterTemplate) => {
    setTemplateName(starter.name);
    setTemplateSubject(starter.subject);
    setTemplateCategory(starter.category);
    setBlocks(JSON.parse(JSON.stringify(starter.blocks)));
    setSettings(JSON.parse(JSON.stringify(starter.settings)));
    setSelectedBlockId(starter.blocks[0]?.id || null);
    setShowStarterModal(false);
    showToast(`Loaded "${starter.name}" template`);
  };

  // Start new template
  const handleStartNew = () => {
    setEditingId(null);
    setShowStarterModal(true);
    setCurrentMode("builder");
    updateUrl("builder", null, "new");
  };

  // Edit existing template
  const handleEditTemplate = (t: any) => {
    applyTemplateData(t);
    setCurrentMode("builder");
    updateUrl("builder", t.id);
  };

  // Return to gallery
  const handleBackToGallery = () => {
    setCurrentMode("gallery");
    setEditingId(null);
    updateUrl("gallery");
  };

  // Duplicate template
  const handleDuplicateTemplate = async (t: any) => {
    try {
      const res = await fetch(`${apiBase}/api/templates/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${t.name} (Copy)`,
          subject: t.subject,
          body: t.body,
          category: t.category,
          is_public: false,
        }),
      });
      if (res.ok) {
        showToast("Template duplicated successfully!");
        fetchTemplates();
      }
    } catch (e) {
      showToast("Failed to duplicate template");
    }
  };

  // Delete template
  const handleDeleteTemplate = async (id: number) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const res = await fetch(`${apiBase}/api/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Template deleted");
        fetchTemplates();
      }
    } catch (e) {
      showToast("Failed to delete template");
    }
  };

  // Save template (Create or Update)
  const handleSave = async () => {
    if (!templateName.trim()) {
      alert("Please enter a template name");
      return;
    }
    if (!templateSubject.trim()) {
      alert("Please enter a subject line");
      return;
    }

    setSaving(true);
    const compiledHtml = compileToEmailHtml({
      blocks,
      settings,
      subject: templateSubject,
    });

    try {
      if (editingId) {
        // Update existing
        const res = await fetch(`${apiBase}/api/templates/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingId,
            name: templateName,
            subject: templateSubject,
            body: compiledHtml,
            category: templateCategory,
          }),
        });
        if (res.ok) {
          showToast("Template updated successfully!");
          fetchTemplates();
        } else {
          showToast("Failed to update template");
        }
      } else {
        // Create new
        const res = await fetch(`${apiBase}/api/templates/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: templateName,
            subject: templateSubject,
            body: compiledHtml,
            category: templateCategory,
            is_public: false,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setEditingId(data.id);
          updateUrl("builder", data.id);
          showToast("Template saved successfully!");
          fetchTemplates();
        } else {
          showToast("Failed to create template");
        }
      }
    } catch (e) {
      showToast("Error saving template");
    }
    setSaving(false);
  };

  // Add block to canvas
  const handleAddBlock = (type: BlockType) => {
    const newBlock = createDefaultBlock(type);
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
    showToast(`Added ${type} block`);
  };

  // Insert block at specific index
  const handleInsertBlock = (type: BlockType, index: number) => {
    const newBlock = createDefaultBlock(type);
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(index, 0, newBlock);
      return next;
    });
    setSelectedBlockId(newBlock.id);
  };

  // Reorder blocks
  const handleReorderBlocks = (fromIndex: number, toIndex: number) => {
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  // Duplicate block
  const handleDuplicateBlock = (id: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const cloned = JSON.parse(JSON.stringify(original));
      cloned.id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const next = [...prev];
      next.splice(idx + 1, 0, cloned);
      return next;
    });
    showToast("Block duplicated");
  };

  // Delete block
  const handleDeleteBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlockId === id) {
      setSelectedBlockId(null);
    }
    showToast("Block removed");
  };

  // Copy compiled HTML
  const handleCopyHtml = () => {
    const html = compileToEmailHtml({ blocks, settings, subject: templateSubject });
    navigator.clipboard.writeText(html);
    showToast("Email HTML copied to clipboard!");
  };

  // Create default block helper
  const createDefaultBlock = (type: BlockType): EmailBlock => {
    const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    switch (type) {
      case "header":
        return {
          type: "header",
          id,
          logoUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80",
          logoHeight: 36,
          brandName: "Acme Corp",
          tagline: "Your trusted partner",
          align: "center",
          paddingY: 16,
        };
      case "heading":
        return {
          type: "heading",
          id,
          text: "Headline for {{company}}",
          level: "h1",
          color: "#0f172a",
          align: "left",
          fontSize: 24,
          fontWeight: "bold",
          paddingY: 12,
        };
      case "text":
        return {
          type: "text",
          id,
          content: "<p>Hi {{name}},</p><p>We noticed your great work at <strong>{{company}}</strong> in {{city}}...</p>",
          color: "#334155",
          fontSize: 15,
          lineHeight: 1.6,
          align: "left",
          paddingY: 10,
        };
      case "button":
        return {
          type: "button",
          id,
          text: "Click Here to Learn More →",
          url: "https://example.com",
          backgroundColor: "#2563eb",
          textColor: "#ffffff",
          borderRadius: 8,
          paddingY: 12,
          paddingX: 24,
          fullWidth: false,
          align: "center",
        };
      case "image":
        return {
          type: "image",
          id,
          src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80",
          alt: "Showcase Image",
          linkUrl: "https://example.com",
          maxWidth: 100,
          borderRadius: 8,
          align: "center",
          paddingY: 12,
        };
      case "columns":
        return {
          type: "columns",
          id,
          col1: {
            title: "Feature One",
            content: "Highlight your key value proposition here.",
            buttonText: "Read More",
            buttonUrl: "https://example.com",
          },
          col2: {
            title: "Feature Two",
            content: "Highlight another strong benefit for the prospect.",
            buttonText: "Explore",
            buttonUrl: "https://example.com",
          },
          gap: 16,
          paddingY: 14,
          backgroundColor: "#f8fafc",
          borderRadius: 8,
        };
      case "callout":
        return {
          type: "callout",
          id,
          badge: "SPECIAL OFFER",
          title: "Guaranteed Satisfaction",
          content: "Book your demo today and receive an exclusive 30-day trial with full access.",
          backgroundColor: "#f0f9ff",
          borderColor: "#0284c7",
          textColor: "#0369a1",
          padding: 16,
        };
      case "divider":
        return {
          type: "divider",
          id,
          style: "solid",
          color: "#e2e8f0",
          thickness: 1,
          width: 100,
          marginY: 12,
        };
      case "spacer":
        return {
          type: "spacer",
          id,
          height: 24,
        };
      case "social":
        return {
          type: "social",
          id,
          align: "center",
          iconStyle: "colored",
          paddingY: 14,
          links: [
            { platform: "linkedin", url: "https://linkedin.com", label: "LinkedIn" },
            { platform: "twitter", url: "https://x.com", label: "Twitter" },
            { platform: "website", url: "https://example.com", label: "Website" },
          ],
        };
      case "footer":
        return {
          type: "footer",
          id,
          companyName: "Your Company, Inc.",
          address: "123 Business Way, Suite 100, San Francisco, CA",
          unsubscribeText: "Unsubscribe from these emails",
          copyrightText: "© 2026 Your Company. All rights reserved.",
          textColor: "#94a3b8",
          fontSize: 12,
          paddingY: 20,
        };
      case "video":
        return {
          type: "video",
          id,
          videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          thumbnailUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1000&auto=format&fit=crop&q=80",
          title: "Watch Platform Walkthrough & Product Demo",
          alt: "Product Demo Video",
          playButtonColor: "#ef4444",
          borderRadius: 10,
          paddingY: 16,
        };
      case "html":
        return {
          type: "html",
          id,
          htmlContent: `<div style="padding: 16px; background-color: #f1f5f9; border-radius: 8px; text-align: center;">\n  <p style="margin: 0; font-size: 14px; font-weight: 600; color: #334155;">⚡ Custom HTML Block</p>\n  <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Paste your custom tables, embeds, or HTML snippets here.</p>\n</div>`,
          paddingY: 16,
        };
      case "testimonial":
        return {
          type: "testimonial",
          id,
          quote: "This platform completely revolutionized how our sales team engages leads. Our response rate tripled within the first two weeks!",
          authorName: "Sarah Jenkins",
          authorTitle: "Head of Growth at Horizon AI",
          avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80",
          rating: 5,
          ratingColor: "#f59e0b",
          backgroundColor: "#f8fafc",
          borderColor: "#e2e8f0",
          textColor: "#1e293b",
          align: "left",
          paddingY: 16,
        };
      case "product":
        return {
          type: "product",
          id,
          title: "Pro Business Suite 2.0",
          description: "All-in-one client outreach, email verification, and automated campaign workflows for modern sales teams.",
          imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
          price: "$49/mo",
          originalPrice: "$99/mo",
          badge: "POPULAR",
          buttonText: "Claim 50% Off",
          buttonUrl: "https://example.com/checkout",
          buttonColor: "#4f46e5",
          backgroundColor: "#ffffff",
          borderColor: "#e2e8f0",
          layout: "vertical",
          paddingY: 16,
        };
      case "countdown":
        return {
          type: "countdown",
          id,
          headline: "⚡ Flash Deal Expires Soon:",
          targetDate: new Date(Date.now() + 86400000 * 3).toISOString(),
          days: 3,
          hours: 14,
          minutes: 45,
          seconds: 20,
          backgroundColor: "#0f172a",
          digitColor: "#ffffff",
          labelColor: "#94a3b8",
          borderRadius: 12,
          paddingY: 16,
        };
      case "menu":
        return {
          type: "menu",
          id,
          items: [
            { label: "Features", url: "https://example.com/features" },
            { label: "Pricing", url: "https://example.com/pricing" },
            { label: "Case Studies", url: "https://example.com/case-studies" },
            { label: "Sign In", url: "https://example.com/login" },
          ],
          align: "center",
          separator: "•",
          linkColor: "#4f46e5",
          fontSize: 13,
          paddingY: 12,
        };
    }
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) || null;

  // Filter templates in Gallery View
  const filteredTemplates = templates.filter((t) => {
    const matchesCat = selectedCategory === "all" || t.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

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

  const filteredSaved = templates.filter((t: any) => {
    return (
      !starterSearch ||
      t.name.toLowerCase().includes(starterSearch.toLowerCase()) ||
      (t.subject && t.subject.toLowerCase().includes(starterSearch.toLowerCase())) ||
      (t.category && t.category.toLowerCase().includes(starterSearch.toLowerCase()))
    );
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedEmail = localStorage.getItem("last_test_email");
      if (savedEmail) setTestRecipientEmail(savedEmail);
    }
  }, []);

  // Deliverability and Spam Score calculation (Mailchimp Content Optimizer style)
  const deliverabilityDiagnostics = useMemo(() => {
    let score = 100;
    const issues: { type: "critical" | "warning" | "good"; title: string; desc: string }[] = [];

    // Subject line analysis
    if (!templateSubject.trim()) {
      score -= 25;
      issues.push({
        type: "critical",
        title: "Missing Subject Line",
        desc: "Emails without a subject line are heavily penalized or rejected by Gmail and Outlook.",
      });
    } else {
      if (templateSubject.length < 10) {
        score -= 10;
        issues.push({
          type: "warning",
          title: "Subject Line Too Short",
          desc: "Subject lines under 10 characters often look like spam or test messages.",
        });
      } else if (templateSubject.length > 60) {
        score -= 10;
        issues.push({
          type: "warning",
          title: "Subject Line May Cut Off",
          desc: "Mobile screens typically truncate subjects beyond 45–55 characters.",
        });
      } else {
        issues.push({
          type: "good",
          title: "Optimal Subject Length",
          desc: `${templateSubject.length} characters — fits cleanly across desktop and mobile inboxes.`,
        });
      }

      if (templateSubject === templateSubject.toUpperCase() && templateSubject.length > 6) {
        score -= 20;
        issues.push({
          type: "critical",
          title: "ALL CAPS in Subject Line",
          desc: "Spambots heavily penalize all-caps titles. Use natural sentence case instead.",
        });
      }
    }

    // Preheader / Preview Text check
    if (!settings.previewText || !settings.previewText.trim()) {
      score -= 15;
      issues.push({
        type: "warning",
        title: "Missing Preview Text (Preheader)",
        desc: "Without preview text, inboxes pull random body fragments. Adding preheader boosts open rates by 25–40%.",
      });
    } else {
      issues.push({
        type: "good",
        title: "Preview Text Configured",
        desc: `"${settings.previewText.substring(0, 40)}..." provides a clean hook in the inbox.`,
      });
    }

    // Spam words scan
    const fullText = (
      templateSubject +
      " " +
      (settings.previewText || "") +
      " " +
      blocks
        .map((b) =>
          "text" in b
            ? (b as any).text || ""
            : "content" in b
            ? (b as any).content || ""
            : "title" in b
            ? (b as any).title || ""
            : ""
        )
        .join(" ")
    ).toLowerCase();

    const SPAM_TRIGGERS = [
      "100% free",
      "make money",
      "guaranteed",
      "risk free",
      "no cost",
      "urgent",
      "act now",
      "$$$",
      "cash bonus",
      "winner",
      "double your income",
      "instant riches",
    ];

    const detectedTriggers = SPAM_TRIGGERS.filter((trigger) => fullText.includes(trigger));
    if (detectedTriggers.length > 0) {
      score -= detectedTriggers.length * 10;
      issues.push({
        type: "critical",
        title: `Spam Trigger Words Detected (${detectedTriggers.length})`,
        desc: `Words like [${detectedTriggers.join(", ")}] trigger commercial filters. Consider conversational alternatives.`,
      });
    } else {
      issues.push({
        type: "good",
        title: "Zero Spam Trigger Words",
        desc: "Clean conversational wording that avoids commercial spam filter flags.",
      });
    }

    // Unsubscribe & Compliance check
    const hasFooter = blocks.some((b) => b.type === "footer");
    const hasUnsub = fullText.includes("unsubscribe");
    if (!hasFooter && !hasUnsub) {
      score -= 20;
      issues.push({
        type: "critical",
        title: "Missing Unsubscribe Compliance Link",
        desc: "CAN-SPAM & GDPR regulations require a visible unsubscribe link and sender address.",
      });
    } else {
      issues.push({
        type: "good",
        title: "CAN-SPAM & Opt-Out Compliant",
        desc: "Footer and unsubscribe mechanism are present.",
      });
    }

    const finalScore = Math.max(20, Math.min(100, score));
    return { score: finalScore, issues };
  }, [templateSubject, settings.previewText, blocks]);

  // Handler: Send Test Email
  const handleSendTestEmail = async () => {
    if (!testRecipientEmail.trim()) {
      showToast("Please enter an email address for the test.");
      return;
    }
    setSendingTest(true);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("last_test_email", testRecipientEmail.trim());
      }
      const compiledHtml = compileToEmailHtml({
        blocks,
        settings,
        subject: testSubject.trim() || templateSubject || templateName,
      });

      const res = await fetch(`${apiBase}/api/templates/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testRecipientEmail.trim(),
          subject: testSubject.trim() || templateSubject || templateName,
          html: compiledHtml,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(`✨ Test email delivered to ${testRecipientEmail}!`);
        setShowTestEmailModal(false);
      } else {
        showToast(`❌ Error: ${data.error || "Failed to send test email"}`);
      }
    } catch (err: any) {
      showToast(`❌ Connection error: ${err.message}`);
    } finally {
      setSendingTest(false);
    }
  };

  // Handler: Generate AI Cold Email Copy
  const handleGenerateAiCopy = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/ai/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: aiNiche, offer: aiOffer, tone: aiTone }),
      });
      const data = await res.json();
      if (data.variants) {
        setAiVariants(data.variants);
        showToast("✨ Generated 3 AI variants!");
      }
    } catch (e: any) {
      showToast("❌ Failed to generate AI copy: " + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Handler: Apply AI Variant to Canvas
  const applyAiVariantToCanvas = (variant: any) => {
    setTemplateSubject(variant.subject);
    setTemplateName(aiNiche + " Outreach - " + variant.framework);
    setSettings((prev: any) => ({ ...prev, previewText: variant.preheader }));

    const newTextBlock = createDefaultBlock("text");
    if (newTextBlock.type === "text") {
      newTextBlock.content = variant.body;
      newTextBlock.fontSize = 15;
    }

    setBlocks([newTextBlock]);
    setShowAiModal(false);
    showToast(`⚡ Applied ${variant.framework} variant to canvas!`);
  };

  // ==========================================
  // RENDER: BUILDER VIEW
  // ==========================================
  if (currentMode === "builder") {
    return (
      <div className="h-screen flex flex-col bg-slate-100 overflow-hidden select-none">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-bounce">
            <span>✨</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top Navigation Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-40 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToGallery}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Return to templates list"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>Templates</span>
            </button>

            <div className="h-5 w-px bg-slate-200" />

            {/* Editable Template Name */}
            <div className="flex flex-col">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template Name..."
                className="text-sm font-bold text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white px-2 py-0.5 rounded border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none max-w-[220px]"
              />
              <div className="flex items-center gap-2 px-2">
                <input
                  type="text"
                  value={templateSubject}
                  onChange={(e) => setTemplateSubject(e.target.value)}
                  placeholder="Subject: Quick question for {{company}}"
                  className="text-[11px] text-slate-500 bg-transparent hover:bg-slate-50 focus:bg-white px-1 py-0.5 rounded border border-transparent hover:border-slate-200 focus:border-blue-400 outline-none max-w-[280px]"
                />
              </div>
            </div>
          </div>

          {/* Center: Device Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => setViewMode("desktop")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "desktop"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
              </svg>
              Desktop
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "mobile"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
              Mobile
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === "code"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              HTML Code
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <select
              value={templateCategory}
              onChange={(e) => setTemplateCategory(e.target.value)}
              className="text-xs font-medium px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none"
            >
              <option value="outreach">Outreach</option>
              <option value="follow-up">Follow-up</option>
              <option value="promotion">Promotion</option>
              <option value="newsletter">Newsletter</option>
              <option value="general">General</option>
            </select>

            {/* Merge Tags Dropdown Helper */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMergeTagsMenu(!showMergeTagsMenu)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
                title="Insert personalization merge tags"
              >
                <span>🏷️</span>
                <span className="hidden sm:inline">Merge Tags</span>
                <span className="text-[10px] text-slate-400">▾</span>
              </button>

              {showMergeTagsMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-2xl border border-slate-200/80 p-2 z-50 animate-slide-down">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">
                    Click to Copy Merge Tag
                  </div>
                  <div className="space-y-1">
                    {MERGE_TAGS.map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(item.tag);
                          showToast(`Copied ${item.tag} to clipboard!`);
                          setShowMergeTagsMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-indigo-50 transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 font-mono group-hover:text-indigo-600">
                            {item.tag}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.desc}</div>
                        </div>
                        <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 font-semibold text-indigo-600">
                          Copy
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Deliverability & Spam Score Pill */}
            <button
              type="button"
              onClick={() => setShowSpamInspector(true)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                deliverabilityDiagnostics.score >= 90
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  : deliverabilityDiagnostics.score >= 75
                  ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                  : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
              }`}
              title="Mailchimp-grade Inbox Deliverability & Spam Score Inspector"
            >
              <span>{deliverabilityDiagnostics.score >= 90 ? "🛡️" : "⚠️"}</span>
              <span>Health: {deliverabilityDiagnostics.score}/100</span>
            </button>

            {/* Send Test Email Button */}
            <button
              type="button"
              onClick={() => {
                setTestSubject(templateSubject ? `[TEST] ${templateSubject}` : `[TEST] ${templateName}`);
                setShowTestEmailModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Send an instant test email to your real inbox"
            >
              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
              <span>Send Test</span>
            </button>

            {/* AI Cold Email Assistant */}
            <button
              type="button"
              onClick={() => {
                if (aiVariants.length === 0) {
                  handleGenerateAiCopy();
                }
                setShowAiModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Generate high-converting cold email copy with AI"
            >
              <span>✨</span>
              <span>AI Writer</span>
            </button>

            <button
              onClick={handleCopyHtml}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              title="Copy compiled table-based email HTML"
            >
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              <span className="hidden sm:inline">Copy HTML</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span>{editingId ? "Update Template" : "Save Template"}</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main Work Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Block Palette */}
          <BlockPalette
            onAddBlock={handleAddBlock}
            onOpenTemplatesModal={() => setShowStarterModal(true)}
          />

          {/* Center Canvas / HTML Code Preview */}
          {viewMode === "code" ? (
            <div className="flex-1 overflow-auto p-6 bg-slate-900 text-slate-100 flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Generated Email-Safe HTML (Tables & Inline CSS)
                </div>
                <button
                  onClick={handleCopyHtml}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold text-white transition-colors"
                >
                  Copy Code
                </button>
              </div>
              <pre className="flex-1 font-mono text-xs text-blue-200 bg-slate-950 p-4 rounded-xl overflow-auto border border-slate-800">
                <code>{compileToEmailHtml({ blocks, settings, subject: templateSubject })}</code>
              </pre>
            </div>
          ) : (
            <EmailCanvas
              blocks={blocks}
              settings={settings}
              selectedBlockId={selectedBlockId}
              viewMode={viewMode}
              onSelectBlock={(id) => setSelectedBlockId(id)}
              onReorderBlocks={handleReorderBlocks}
              onInsertBlock={handleInsertBlock}
              onDuplicateBlock={handleDuplicateBlock}
              onDeleteBlock={handleDeleteBlock}
              onUpdateBlock={(updated) => {
                setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
              }}
              onUpdateSettings={(newSettings) => setSettings(newSettings)}
            />
          )}

          {/* Right Property & Style Inspector */}
          <PropertyInspector
            selectedBlock={selectedBlock}
            settings={settings}
            onUpdateBlock={(updated) => {
              setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
            }}
            onUpdateSettings={(newSettings) => setSettings(newSettings)}
            onDeselect={() => setSelectedBlockId(null)}
          />
        </div>

        {/* Starter Templates Picker Modal with Left Categories & Right Presets Grid */}
        {showStarterModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
            <div className="bg-white rounded-2xl max-w-5xl w-full h-[85vh] max-h-[780px] flex flex-col shadow-2xl overflow-hidden animate-slide-down border border-slate-100">
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
                    onClick={() => setShowStarterModal(false)}
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
                        ? templates.length
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
                        {filteredSaved.map((tmpl: any) => (
                          <div
                            key={tmpl.id}
                            onClick={() => {
                              handleEditTemplate(tmpl);
                              setShowStarterModal(false);
                            }}
                            className="rounded-xl border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all bg-white text-left group overflow-hidden flex flex-col"
                          >
                            {/* Miniature Live Preview */}
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

                            {/* Info */}
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
                                <span className="group-hover:translate-x-1 transition-transform">Load into editor →</span>
                                <span className="text-slate-400 font-normal">Custom</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-16 text-center text-xs text-slate-400">
                        No custom templates saved yet. Create a new template and click Save to access it here.
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
                            onClick={() => {
                              loadStarterTemplate(starter);
                              setShowStarterModal(false);
                            }}
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

        {/* Send Test Email Modal */}
        {showTestEmailModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-slide-down">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg">
                    📨
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Send Test Email</h3>
                    <p className="text-xs text-slate-500">Test rendering in your real inbox</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTestEmailModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3.5 mb-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Send Test To (Email Address)
                  </label>
                  <input
                    type="email"
                    value={testRecipientEmail}
                    onChange={(e) => setTestRecipientEmail(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-medium"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Delivered via your configured SMTP settings.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Test Subject Line
                  </label>
                  <input
                    type="text"
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                    placeholder="[TEST] Subject Line"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTestEmailModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={sendingTest}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {sendingTest ? (
                    <span>Sending to Inbox...</span>
                  ) : (
                    <>
                      <span>Send Test Now</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Spam & Deliverability Inspector Modal */}
        {showSpamInspector && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-slide-down max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                    deliverabilityDiagnostics.score >= 90
                      ? "bg-emerald-50 text-emerald-600"
                      : deliverabilityDiagnostics.score >= 75
                      ? "bg-amber-50 text-amber-600"
                      : "bg-red-50 text-red-600"
                  }`}>
                    🛡️
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Inbox Health & Spam Inspector</h3>
                    <p className="text-xs text-slate-500">Mailchimp-grade deliverability optimization</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSpamInspector(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-4">
                {/* Score Banner */}
                <div className={`p-4 rounded-xl border flex items-center justify-between ${
                  deliverabilityDiagnostics.score >= 90
                    ? "bg-emerald-50/70 border-emerald-200"
                    : deliverabilityDiagnostics.score >= 75
                    ? "bg-amber-50/70 border-amber-200"
                    : "bg-red-50/70 border-red-200"
                }`}>
                  <div>
                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Overall Inbox Score</div>
                    <div className="text-2xl font-black text-slate-900 mt-0.5">
                      {deliverabilityDiagnostics.score} <span className="text-sm font-normal text-slate-500">/ 100</span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    deliverabilityDiagnostics.score >= 90
                      ? "bg-emerald-600 text-white"
                      : deliverabilityDiagnostics.score >= 75
                      ? "bg-amber-600 text-white"
                      : "bg-red-600 text-white"
                  }`}>
                    {deliverabilityDiagnostics.score >= 90 ? "Excellent Deliverability" : deliverabilityDiagnostics.score >= 75 ? "Good / Minor Fixes" : "High Spam Risk"}
                  </span>
                </div>

                {/* Diagnostics List */}
                <div className="space-y-2.5">
                  {deliverabilityDiagnostics.issues.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        item.type === "good"
                          ? "bg-slate-50/80 border-slate-200/80"
                          : item.type === "warning"
                          ? "bg-amber-50/50 border-amber-200/80"
                          : "bg-red-50/50 border-red-200/80"
                      }`}
                    >
                      <span className="text-base shrink-0">
                        {item.type === "good" ? "✅" : item.type === "warning" ? "⚠️" : "❌"}
                      </span>
                      <div>
                        <div className="font-bold text-slate-800">{item.title}</div>
                        <div className="text-slate-500 mt-0.5 leading-relaxed">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSpamInspector(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Cold Email Copywriter Modal */}
        {showAiModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 animate-slide-down max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-lg text-white shadow-xs">
                    ✨
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">AI Cold Email Copywriter</h3>
                    <p className="text-xs text-slate-500">Generate high-converting sales letters with proven cold email frameworks</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Prompt Controls */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 my-3 space-y-3 shrink-0">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Target Niche / Ideal Prospect
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {["Dental Clinics", "Roofing & Contractors", "Shopify Brands", "SaaS Founders", "Real Estate Agents", "Marketing Agencies"].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAiNiche(n)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          aiNiche === n ? "bg-indigo-600 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={aiNiche}
                    onChange={(e) => setAiNiche(e.target.value)}
                    placeholder="e.g. Cosmetic Dentists in California"
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Value Proposition / Offer Hook
                    </label>
                    <input
                      type="text"
                      value={aiOffer}
                      onChange={(e) => setAiOffer(e.target.value)}
                      placeholder="e.g. 15-Minute Pipeline Audit"
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Tone of Voice
                    </label>
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium"
                    >
                      <option value="Direct & Conversational">Direct & Conversational (Best for Cold B2B)</option>
                      <option value="Pattern Interrupt">Pattern Interrupt & Zero Pitch</option>
                      <option value="Social Proof & Case Study">Social Proof & Case Study</option>
                      <option value="Casual & Short">Casual, Short & Direct</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAiCopy}
                  disabled={aiLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {aiLoading ? (
                    <span>Crafting High-Converting Angles...</span>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Generate 3 High-Converting Variants</span>
                    </>
                  )}
                </button>
              </div>

              {/* Generated Variants Display */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {aiVariants.map((variant: any) => (
                  <div key={variant.id} className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          {variant.framework}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          Preheader: {variant.preheader}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 mb-2">
                        Subject: <span className="font-mono text-indigo-600">{variant.subject}</span>
                      </div>
                      <div
                        className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 font-sans"
                        dangerouslySetInnerHTML={{ __html: variant.body }}
                      />
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-medium">Ready to test</span>
                      <button
                        type="button"
                        onClick={() => applyAiVariantToCanvas(variant)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <span>⚡ Apply to Canvas</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER: GALLERY / LIST VIEW
  // ==========================================
  return (
    <DashboardLayout
      title="Email Templates"
      subtitle="Create, customize, and manage drag-and-drop templates for cold outreach and marketing"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2">
          <span>✨</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all shrink-0 ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search & Create Button */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>

            <button
              onClick={handleStartNew}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm flex items-center gap-1.5 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>New Drag & Drop Email</span>
            </button>
          </div>
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="card p-16 text-center text-sm text-slate-400">
            <div className="animate-spin text-2xl mb-2">⏳</div>
            Loading templates...
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="text-4xl mb-3">✉️</div>
            <h3 className="text-base font-bold text-slate-800">No email templates found</h3>
            <p className="text-xs text-slate-400 mt-1 mb-6 max-w-sm mx-auto">
              Create your first professional email with our drag-and-drop builder or start with a Mailchimp-grade starter preset.
            </p>
            <button
              onClick={handleStartNew}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-xs inline-flex items-center gap-2"
            >
              <span>✨</span>
              <span>Open Email Builder</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map((t: any) => (
              <div
                key={t.id}
                className="card overflow-hidden hover:shadow-lg transition-all duration-200 border border-slate-200/80 flex flex-col group bg-white"
              >
                {/* Visual Preview Header with REAL Template Design */}
                <div className="h-44 bg-slate-100/80 border-b border-slate-100 relative overflow-hidden flex items-center justify-center">
                  {t.body ? (
                    <div className="w-full h-full pointer-events-none relative overflow-hidden flex justify-center items-start pt-1 bg-slate-50/50">
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#f8fafc;-webkit-font-smoothing:antialiased;}*{-ms-overflow-style:none;scrollbar-width:none;}::-webkit-scrollbar{display:none;}</style></head><body>${t.body}</body></html>`}
                        title={t.name}
                        className="w-[600px] h-[650px] border-0 origin-top transform scale-[0.26] shrink-0 pointer-events-none select-none shadow-xs"
                        tabIndex={-1}
                        loading="lazy"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 text-xs gap-1">
                      <span className="text-2xl">✉️</span>
                      <span>No design content</span>
                    </div>
                  )}

                  {/* Hover Overlay Buttons */}
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-3 backdrop-blur-[1px]">
                    <button
                      onClick={() => handleEditTemplate(t)}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                    >
                      <span>✏️</span>
                      <span>Edit in Builder</span>
                    </button>
                    <button
                      onClick={() => setPreviewTemplate(t)}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold transition-all shadow-md active:scale-95"
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {t.name}
                      </h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                        {t.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3 truncate">
                      <span className="font-semibold text-slate-700">Subject:</span> {t.subject}
                    </p>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDuplicateTemplate(t)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Duplicate template"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(t.body || "");
                          showToast("Template HTML copied!");
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Copy raw HTML"
                      >
                        📄
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete template"
                      >
                        🗑️
                      </button>
                    </div>

                    <button
                      onClick={() => handleEditTemplate(t)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Edit →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fullscreen Email Preview Modal */}
        {previewTemplate && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-4xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-down">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{previewTemplate.name}</h3>
                  <p className="text-xs text-slate-500">Subject: {previewTemplate.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      handleEditTemplate(previewTemplate);
                      setPreviewTemplate(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    Open in Builder
                  </button>
                  <button
                    onClick={() => setPreviewTemplate(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-200 p-6 overflow-auto flex justify-center">
                <div className="w-full max-w-[640px] bg-white rounded-xl shadow-lg overflow-hidden h-fit">
                  <iframe
                    srcDoc={previewTemplate.body}
                    title="Template Preview"
                    className="w-full min-h-[600px] border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
