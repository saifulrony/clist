let extractedBusinesses = [];
let currentTab = null;

const els = {
  status: document.getElementById("status"),
  pageType: document.getElementById("pageType"),
  businessCount: document.getElementById("businessCount"),
  extractBtn: document.getElementById("extractBtn"),
  enrichBtn: document.getElementById("enrichBtn"),
  saveBtn: document.getElementById("saveBtn"),
  clearBtn: document.getElementById("clearBtn"),
  extractedList: document.getElementById("extractedList"),
  apiBase: document.getElementById("apiBase"),
  saveSettings: document.getElementById("saveSettings"),
  toast: document.getElementById("toast"),
  enrichProgress: document.getElementById("enrichProgress"),
};

function showToast(msg, type = "success") {
  els.toast.textContent = msg;
  els.toast.className = `toast ${type}`;
  els.toast.style.display = "block";
  setTimeout(() => (els.toast.style.display = "none"), 4000);
}

function detectPageType(url) {
  if (url.includes("google.com/maps") || url.includes("maps.google.com")) return "Google Maps";
  if (url.includes("yelp.com")) return "Yelp";
  if (url.includes("yellowpages.com")) return "Yellow Pages";
  return "Unknown";
}

function mergeBusinesses(existing, incoming) {
  const merged = [...existing];
  for (const biz of incoming) {
    const key = biz.name.toLowerCase();
    const idx = merged.findIndex((m) => m.name.toLowerCase() === key);
    if (idx >= 0) {
      const old = merged[idx];
      merged[idx] = {
        ...old,
        name: biz.name || old.name,
        address: biz.address || old.address,
        phone: biz.phone || old.phone,
        website: biz.website || old.website,
        category: biz.category || old.category,
        email: biz.email || old.email,
        facebook: biz.facebook || old.facebook,
        rating: biz.rating || old.rating,
        total_rating: biz.total_rating || old.total_rating,
        latitude: biz.latitude || old.latitude,
        longitude: biz.longitude || old.longitude,
        place_url: biz.place_url || old.place_url,
      };
    } else {
      merged.push(biz);
    }
  }
  return merged;
}

function renderExtractedList() {
  if (extractedBusinesses.length === 0) {
    els.extractedList.style.display = "none";
    els.saveBtn.disabled = true;
    els.clearBtn.disabled = true;
    return;
  }
  els.extractedList.style.display = "block";
  els.saveBtn.disabled = false;
  els.clearBtn.disabled = false;

  const hasData = (b) => b.email || b.address || b.phone || b.website;
  const complete = extractedBusinesses.filter(hasData).length;
  const incomplete = extractedBusinesses.length - complete;

  let header = "";
  if (incomplete > 0) {
    header = `<div style="padding:4px 8px;font-size:10px;color:#f59e0b;background:#78350f;border-radius:4px;margin-bottom:4px;">
      ${complete}/${extractedBusinesses.length} have full data.
    </div>`;
  } else {
    header = `<div style="padding:4px 8px;font-size:10px;color:#22c55e;background:#052e16;border-radius:4px;margin-bottom:4px;">
      All ${extractedBusinesses.length} businesses have data.
    </div>`;
  }

  els.extractedList.innerHTML = header + extractedBusinesses.slice(0, 50).map((b) => {
    const indicators = [b.email ? "📧" : "", b.address ? "📍" : "", b.phone ? "📞" : "", b.website ? "🌐" : ""].filter(Boolean).join(" ");
    const details = [b.email, b.address, b.phone, b.website].filter(Boolean);
    return `<div class="extracted-item">
      <div style="flex:1;min-width:0;">
        <div class="extracted-name">${b.name}</div>
        <div class="extracted-info" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${details.join(" · ") || "<i>No details yet</i>"}
        </div>
      </div>
      <div style="font-size:10px;margin-left:4px;">${indicators}</div>
    </div>`;
  }).join("");
}

function getContentScript(url) {
  if (url.includes("google.com/maps") || url.includes("maps.google.com")) return "content-scripts/google-maps.js";
  if (url.includes("yelp.com")) return "content-scripts/yelp.js";
  if (url.includes("yellowpages.com")) return "content-scripts/yellowpages.js";
  return "";
}

// Promise-based sendToTab
function sendToTab(message, timeout = 5000) {
  return new Promise((resolve) => {
    if (!currentTab?.id) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), timeout);
    chrome.tabs.sendMessage(currentTab.id, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(response);
    });
  });
}

// Inject content script and verify it loaded
async function ensureContentScript() {
  // First check if already running
  let res = await sendToTab({ type: "PING" });
  if (res?.ok) return true;

  // Try injecting
  const script = getContentScript(currentTab.url);
  if (!script) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: [script],
    });
  } catch (e) {
    console.error("[Popup] executeScript failed:", e);
    return false;
  }

  // Wait for script to initialize
  await new Promise((r) => setTimeout(r, 2000));

  // Verify
  res = await sendToTab({ type: "PING" });
  if (res?.ok) return true;

  // One more try
  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: [script],
    });
  } catch (e) {
    console.error("[Popup] executeScript retry failed:", e);
    return false;
  }

  await new Promise((r) => setTimeout(r, 2000));
  res = await sendToTab({ type: "PING" });
  return !!res?.ok;
}

// ── EXTRACT ──
async function extractFromPage() {
  if (!currentTab) return;
  els.extractBtn.disabled = true;
  els.extractBtn.innerHTML = '<div class="spinner"></div> Extracting...';

  const ready = await ensureContentScript();
  if (!ready) {
    showToast("Cannot connect. Refresh the page first, then try again.", "error");
    els.extractBtn.disabled = false;
    els.extractBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Extract from Page`;
    return;
  }

  const results = await sendToTab({ type: "EXTRACT" }, 10000);
  if (results && results.length > 0) {
    extractedBusinesses = mergeBusinesses(extractedBusinesses, results);
    els.businessCount.textContent = `${extractedBusinesses.length} businesses`;
    els.businessCount.className = "status-value green";
    renderExtractedList();
    showToast(`Found ${results.length} businesses! (total: ${extractedBusinesses.length})`);
  } else {
    showToast("No businesses found on this page", "error");
  }

  els.extractBtn.disabled = false;
  els.extractBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Extract from Page`;
}

// ── AUTO-ENRICH ──
let enrichPolling = null;

async function startAutoEnrich() {
  if (!currentTab) return;
  els.enrichBtn.disabled = true;
  els.enrichBtn.innerHTML = '<div class="spinner"></div> Enriching...';
  els.enrichProgress.style.display = "block";
  els.enrichProgress.textContent = "Connecting...";

  const ready = await ensureContentScript();
  if (!ready) {
    showToast("Cannot connect. Refresh the page first, then try again.", "error");
    resetEnrichBtn();
    return;
  }

  const response = await sendToTab({ type: "AUTO_ENRICH" }, 300000);
  if (!response) {
    showToast("Cannot connect. Refresh the page first, then try again.", "error");
    resetEnrichBtn();
    return;
  }
  if (response.error) {
    showToast(response.error, "error");
    resetEnrichBtn();
    return;
  }
  if (response.businesses?.length > 0) {
    extractedBusinesses = mergeBusinesses(extractedBusinesses, response.businesses);
    els.businessCount.textContent = `${extractedBusinesses.length} businesses`;
    els.businessCount.className = "status-value green";
    renderExtractedList();
    showToast(`Enriched ${response.count} businesses!`);
  } else {
    showToast("No details found. Scroll to load businesses first.", "error");
  }
  resetEnrichBtn();

  enrichPolling = setInterval(async () => {
    const s = await sendToTab({ type: "ENRICH_STATUS" });
    if (s && s.total > 0) els.enrichProgress.textContent = `${s.current}/${s.total} - ${s.status}`;
    if (s?.status === "done" || s?.status === "idle") clearInterval(enrichPolling);
  }, 2000);
}

function resetEnrichBtn() {
  els.enrichBtn.disabled = false;
  els.enrichBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg> Auto-Enrich All`;
  els.enrichProgress.style.display = "none";
}

// ── SAVE ──
async function saveToDB() {
  if (extractedBusinesses.length === 0) return;
  els.saveBtn.disabled = true;
  els.saveBtn.innerHTML = '<div class="spinner"></div> Saving...';
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "SAVE_TO_DB", businesses: extractedBusinesses }, (r) => resolve(r));
    });
    if (response?.error) {
      showToast("Error: " + response.error, "error");
    } else {
      showToast(`Saved ${response?.saved || extractedBusinesses.length} businesses!`);
      extractedBusinesses = [];
      renderExtractedList();
      els.businessCount.textContent = "0 businesses";
      els.businessCount.className = "status-value";
    }
  } catch (err) {
    showToast("Save failed: " + err.message, "error");
  }
  els.saveBtn.disabled = false;
  els.saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8"/></svg> Save to DB`;
}

function clearResults() {
  extractedBusinesses = [];
  renderExtractedList();
  els.businessCount.textContent = "0 businesses";
  els.businessCount.className = "status-value";
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  if (tab) {
    const pageType = detectPageType(tab.url);
    els.pageType.textContent = pageType;
    if (pageType !== "Unknown") {
      els.status.textContent = "Supported";
      els.status.className = "badge green";
      els.extractBtn.disabled = false;
      els.enrichBtn.disabled = false;
    } else {
      els.status.textContent = "Not supported";
      els.status.className = "badge amber";
      els.extractBtn.disabled = true;
      els.enrichBtn.disabled = true;
    }
  }
  const result = await chrome.storage.local.get("apiBase");
  if (result.apiBase) els.apiBase.value = result.apiBase;

  // Quick check if content script is already there
  const count = await sendToTab({ type: "GET_COUNT" });
  if (count?.count > 0) {
    els.businessCount.textContent = `${count.count} businesses`;
    els.businessCount.className = "status-value green";
  }
}

els.extractBtn.addEventListener("click", extractFromPage);
els.enrichBtn.addEventListener("click", startAutoEnrich);
els.saveBtn.addEventListener("click", saveToDB);
els.clearBtn.addEventListener("click", clearResults);
els.saveSettings.addEventListener("click", async () => {
  const v = els.apiBase.value.trim();
  if (!v) return;
  chrome.runtime.sendMessage({ type: "SET_API_BASE", apiBase: v });
  showToast("Settings saved!");
});

init();
