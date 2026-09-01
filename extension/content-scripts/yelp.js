(() => {
  const log = (msg) => console.log("[ClientList:Yelp]", msg);
  let enrichRunning = false;
  let enrichProgress = { current: 0, total: 0, status: "idle" };

  function extractFromYelp() {
    const businesses = [];
    const seen = new Set();

    // Multiple selector strategies for cards
    const cards = document.querySelectorAll(
      '[class*="businessName"], [class*="business-result"], [data-testid="serp-ia-card"], .container__09f24__qRbBq'
    );

    cards.forEach((card) => {
      try {
        // Name
        const nameEl = card.querySelector("a") || card;
        const name = nameEl?.textContent?.trim();
        if (!name || seen.has(name.toLowerCase()) || name.length > 120) return;
        seen.add(name.toLowerCase());

        // Find parent container
        const parent = card.closest('[class*="businessResult"], [class*="container__"], [data-testid="serp-ia-card"]')
          || card.parentElement?.parentElement?.parentElement
          || card.parentElement;

        // Rating
        const ratingEl = parent?.querySelector('[class*="i-stars"], [aria-label*="star"]');
        let rating = 0;
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute("aria-label") || "";
          const match = ariaLabel.match(/([\d.]+)/);
          if (match) rating = parseFloat(match[1]);
        }

        // Review count
        const reviewCountEl = parent?.querySelector('[class*="reviewCount"], span[aria-label*="review"]');
        let totalRating = 0;
        if (reviewCountEl) {
          const text = reviewCountEl.textContent?.replace(/[()]/g, "");
          totalRating = parseInt(text) || 0;
        }

        // Address
        const addressEl = parent?.querySelector('[class*="secondaryText"], address, [class*="address"]');
        const address = addressEl?.textContent?.trim() || "";

        // Phone - try multiple selectors
        let phone = "";
        const phoneSelectors = [
          'a[href^="tel:"]',
          '[class*="phone"]',
          "span[aria-label*='phone']",
          '[class*="secondaryText"] span',
        ];
        for (const sel of phoneSelectors) {
          const el = parent?.querySelector(sel);
          if (el) {
            const text = el.textContent?.trim() || "";
            const href = el.getAttribute("href")?.replace("tel:", "") || "";
            phone = text || href;
            // Validate it looks like a phone number
            if (phone && /[\d\-\(\)\+\s]{7,}/.test(phone)) break;
            phone = "";
          }
        }

        // Category
        const categoryEls = parent?.querySelectorAll('[class*="categoryStr"], [class*="css-11bijt4"], [class*="category"]');
        let category = "";
        categoryEls?.forEach((el) => {
          const t = el.textContent?.trim();
          if (t && !category) category = t;
        });

        // Link to detail page
        const linkEl = card.querySelector("a[href*='/biz/']") || parent?.querySelector("a[href*='/biz/']");
        const detailUrl = linkEl?.href || "";

        businesses.push({
          name,
          address,
          category,
          phone,
          website: "",
          email: "",
          facebook: "",
          rating,
          total_rating: totalRating,
          latitude: 0,
          longitude: 0,
          source: "yelp_extension",
          place_url: detailUrl,
        });
      } catch (e) {
        log("Parse error: " + e.message);
      }
    });

    return businesses;
  }

  // Extract from detail page
  function extractFromDetailPage() {
    const businesses = [];

    const nameEl = document.querySelector("h1, [class*='businessName']");
    const name = nameEl?.textContent?.trim();
    if (!name) return [];

    // Address
    const addressEl = document.querySelector("address, [class*='address'], [class*='secondaryText']");
    const address = addressEl?.textContent?.trim() || "";

    // Phone
    let phone = "";
    const phoneEl = document.querySelector('a[href^="tel:"]');
    if (phoneEl) phone = phoneEl.textContent?.trim() || phoneEl.href.replace("tel:", "") || "";

    // Website
    let website = "";
    const websiteSelectors = [
      '[class*="website"] a',
      'a[href^="http"]:not([href*="yelp.com"]):not([href*="google"]):not([href*="facebook"])',
      'a[rel="nofollow"]',
    ];
    for (const sel of websiteSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.href && !el.href.includes("yelp.com") && !el.href.includes("google")) {
          website = el.href;
          break;
        }
      }
      if (website) break;
    }

    // Category
    const categoryEl = document.querySelector('[class*="category"], [class*="css-11bijt4"]');
    const category = categoryEl?.textContent?.trim() || "";

    log(`Detail: ${name} | phone=${!!phone} web=${!!website}`);

    return [{
      name, address, category, phone, website,
      email: "", facebook: "",
      rating: 0, total_rating: 0,
      latitude: 0, longitude: 0,
      source: "yelp_extension",
      place_url: window.location.href,
    }];
  }

  async function autoEnrich() {
    if (enrichRunning) return { error: "Already running" };
    enrichRunning = true;
    const results = [];

    const links = document.querySelectorAll("a[href*='/biz/']");
    const validLinks = [];
    const seenUrls = new Set();
    links.forEach((l) => {
      if (l.href && !seenUrls.has(l.href) && l.textContent?.trim().length > 1) {
        seenUrls.add(l.href);
        validLinks.push(l);
      }
    });

    enrichProgress = { current: 0, total: validLinks.length, status: "starting" };
    log(`Auto-enrich: ${validLinks.length} businesses`);

    for (let i = 0; i < validLinks.length; i++) {
      if (!enrichRunning) break;
      const link = validLinks[i];
      const name = link.textContent?.trim() || `Business ${i + 1}`;
      enrichProgress = { current: i + 1, total: validLinks.length, status: name };

      link.click();
      await sleep(3000);

      const detail = extractFromDetailPage();
      if (detail.length > 0) {
        results.push(detail[0]);
        log(`Enriched ${i + 1}/${validLinks.length}: ${name}`);
      }

      window.history.back();
      await sleep(2000);
    }

    enrichProgress = { current: results.length, total: validLinks.length, status: "done" };
    enrichRunning = false;
    return { businesses: results, count: results.length };
  }

  function stopEnrich() {
    enrichRunning = false;
    enrichProgress.status = "stopped";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  chrome.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === "PING") { respond({ ok: true }); return true; }
    if (msg.type === "EXTRACT") {
      respond(extractFromYelp());
      return true;
    }
    if (msg.type === "GET_COUNT") {
      respond({ count: extractFromYelp().length });
      return true;
    }
    if (msg.type === "AUTO_ENRICH") {
      autoEnrich().then((r) => respond(r));
      return true;
    }
    if (msg.type === "STOP_ENRICH") {
      stopEnrich();
      respond({ ok: true });
      return true;
    }
    if (msg.type === "ENRICH_STATUS") {
      respond(enrichProgress);
      return true;
    }
  });
})();
