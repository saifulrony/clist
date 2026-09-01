(() => {
  const log = (msg) => console.log("[ClientList]", msg);

  function getNameFromUrl(href) {
    const m = href.match(/maps\/place\/([^/@?#]+)/);
    if (m) return decodeURIComponent(m[1]).replace(/\+/g, " ").replace(/,/g, "").trim();
    return "";
  }

  function getCoordsFromUrl(href) {
    let latitude = 0, longitude = 0;
    const latM = href.match(/!3d([\d.\-]+)/);
    const lngM = href.match(/!4d([\d.\-]+)/);
    if (latM) latitude = parseFloat(latM[1]) || 0;
    if (lngM) longitude = parseFloat(lngM[1]) || 0;
    return { latitude, longitude };
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ═══ FEED EXTRACTION (for counting) ═══

  function findBusinessCards() {
    const results = [];
    const seen = new Set();

    const allLinks = document.querySelectorAll('a[href*="/maps/place/"]');
    log(`Place links on page: ${allLinks.length}`);

    allLinks.forEach((link) => {
      const href = link.href || "";
      if (!href.includes("/maps/place/")) return;

      let name = getNameFromUrl(href);

      if (!name) {
        const aria = link.getAttribute("aria-label");
        if (aria && aria.length >= 3 && aria.length <= 120 && !/^\d/.test(aria) && !/results?|rating|menu|filter|directions/i.test(aria)) {
          name = aria;
        }
      }

      if (!name) {
        const h = link.querySelector('[role="heading"]');
        if (h) {
          const t = h.textContent?.trim();
          if (t && t.length >= 3 && t.length <= 120 && !/results?|rating/i.test(t)) name = t;
        }
      }

      if (!name || name.length < 3 || name.length > 120) return;
      if (seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      results.push({ name, place_url: href });
    });

    log(`Total cards found: ${results.length}`);
    return results;
  }

  // ═══ DETAIL PANEL ═══

  function extractDetailPanel() {
    if (!window.location.href.includes("/maps/place/")) return [];

    const main = document.querySelector('[role="main"]');
    if (!main) return [];

    let name = getNameFromUrl(window.location.href);
    if (!name) {
      const h1 = main.querySelector("h1") || document.querySelector("h1");
      name = h1?.textContent?.trim() || "";
    }
    if (!name || name.length < 2) return [];

    let address = "", phone = "", website = "", category = "";

    main.querySelectorAll("[data-item-id]").forEach((el) => {
      const id = el.getAttribute("data-item-id") || "";
      const text = el.textContent?.trim() || "";
      if (id === "address" && !address) address = text;
      if (id === "phone" && !phone) phone = text;
      if (id === "website" && !website) { const a = el.querySelector("a"); website = a?.href || ""; }
    });

    if (!phone || !website) {
      main.querySelectorAll("button, a").forEach((el) => {
        const label = (el.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("phone") && !phone) phone = el.textContent?.trim() || "";
        if (label.includes("website") && !website && el.href && !el.href.includes("google")) website = el.href;
      });
    }

    if (!phone) { const tel = document.querySelector('a[href^="tel:"]'); if (tel) phone = tel.textContent?.trim() || tel.href.replace("tel:", ""); }
    if (!website) {
      for (const l of main.querySelectorAll('a[href^="http"]')) {
        if (l.href && !l.href.includes("google") && !l.href.includes("gstatic")) { website = l.href; break; }
      }
    }
    if (!category) { const c = main.querySelector('.Io6YTe, .DkEaL'); if (c) category = c.textContent?.trim() || ""; }

    const { latitude, longitude } = getCoordsFromUrl(window.location.href);
    log(`Detail: ${name} | addr=${!!address} phone=${!!phone} web=${!!website}`);

    return [{ name, address, category, phone, website, email: "", facebook: "", rating: 0, total_rating: 0, latitude, longitude, source: "google_maps_extension", place_url: window.location.href }];
  }

  // ═══ CLICK CARD & EXTRACT DETAIL ═══

  async function clickCardAndExtract(cardEl) {
    const href = cardEl.href || "";
    const name = getNameFromUrl(href) || cardEl.getAttribute("aria-label") || `#${Date.now()}`;

    cardEl.click();
    await sleep(600);

    let panel = null;
    for (let w = 0; w < 15; w++) {
      await sleep(400);
      panel = document.querySelector('[role="main"] h1');
      if (panel) break;
    }

    if (!panel) {
      window.history.back();
      await sleep(500);
      return null;
    }

    const detail = extractDetailPanel();
    if (detail.length > 0) {
      log(`Extracted detail: ${detail[0].name} | web=${!!detail[0].website} phone=${!!detail[0].phone}`);
    }

    window.history.back();
    await sleep(600);
    for (let w = 0; w < 10; w++) {
      await sleep(300);
      if (document.querySelector('[role="feed"] a[href*="/maps/place/"]')) break;
    }

    return detail.length > 0 ? detail[0] : null;
  }

  // ═══ EXTRACT FROM FEED (navigate to detail pages) ═══

  async function extractFromFeed() {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return [];

    const cards = [];
    const seenHrefs = new Set();
    feed.querySelectorAll('a[href*="/maps/place/"]').forEach((a) => {
      const href = a.href || "";
      if (!href.includes("/maps/place/")) return;
      if (seenHrefs.has(href)) return;
      seenHrefs.add(href);
      cards.push(a);
    });

    if (cards.length === 0) return [];

    const results = [];
    const seenNames = new Set();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardName = getNameFromUrl(card.href) || `#${i + 1}`;

      if (seenNames.has(cardName.toLowerCase())) continue;

      const detail = await clickCardAndExtract(card);

      if (detail) {
        if (!seenNames.has(detail.name.toLowerCase())) {
          seenNames.add(detail.name.toLowerCase());
          results.push(detail);
          log(`[${i + 1}/${cards.length}] ${detail.name} | web=${!!detail.website} phone=${!!detail.phone} addr=${!!detail.address}`);
        }
      }
    }

    log(`Feed extract done: ${results.length}/${cards.length}`);
    return results;
  }

  // ═══ MAIN ═══

  async function extract() {
    if (window.location.href.includes("/maps/place/")) {
      const detail = extractDetailPanel();
      if (detail.length > 0) return detail;
    }
    return await extractFromFeed();
  }

  // ═══ MESSAGES ═══

  chrome.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === "PING") { respond({ ok: true }); return true; }
    if (msg.type === "EXTRACT") { respond(extract()); return true; }
    if (msg.type === "GET_COUNT") { respond({ count: findBusinessCards().length }); return true; }
    if (msg.type === "AUTO_ENRICH") { autoEnrich().then((r) => respond(r)); return true; }
    if (msg.type === "STOP_ENRICH") { respond({ ok: true }); return true; }
    if (msg.type === "ENRICH_STATUS") { respond({ current: 0, total: 0, status: "idle" }); return true; }
  });

  // ═══ AUTO-ENRICH ═══

  async function autoEnrich() {
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return { error: "No search results found. Search first." };

    const cards = [];
    const seenHrefs = new Set();
    feed.querySelectorAll('a[href*="/maps/place/"]').forEach((a) => {
      const href = a.href || "";
      if (!href.includes("/maps/place/")) return;
      if (seenHrefs.has(href)) return;
      seenHrefs.add(href);
      cards.push(a);
    });

    if (cards.length === 0) return { error: "No businesses found. Scroll to load results." };

    const results = [];
    const seenNames = new Set();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardName = getNameFromUrl(card.href) || card.getAttribute("aria-label") || `#${i + 1}`;

      if (seenNames.has(cardName.toLowerCase())) continue;

      const detail = await clickCardAndExtract(card);

      if (detail) {
        if (!seenNames.has(detail.name.toLowerCase())) {
          seenNames.add(detail.name.toLowerCase());
          results.push(detail);
          log(`Enriched ${i + 1}/${cards.length}: ${cardName} -> ${detail[0].name}`);
        }
      }
    }

    return { businesses: results, count: results.length };
  }
})();