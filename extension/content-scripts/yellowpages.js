(() => {
  const log = (msg) => console.log("[ClientList:YP]", msg);
  let enrichRunning = false;
  let enrichProgress = { current: 0, total: 0, status: "idle" };

  function extractFromYellowPages() {
    const businesses = [];
    const seen = new Set();

    // Try multiple selector strategies for cards
    const cards = document.querySelectorAll(
      ".result, .srp-listing, .organic, [data-aid='SERP_LISTING'], .result-container .result"
    );

    cards.forEach((card) => {
      try {
        // Name
        const nameEl = card.querySelector(
          ".business-name, .n a, h2 a, [class*='business-name'], [data-aid='result-title'] a"
        );
        const name = nameEl?.textContent?.trim();
        if (!name || seen.has(name.toLowerCase()) || name.length > 120) return;
        seen.add(name.toLowerCase());

        // Address
        const streetEl = card.querySelector(
          ".adr .street-address, .street-address, .adj-addr, [class*='street-address']"
        );
        const localityEl = card.querySelector(
          ".adr .locality, .locality, [class*='locality']"
        );
        const address = [streetEl?.textContent?.trim(), localityEl?.textContent?.trim()]
          .filter(Boolean)
          .join(", ");

        // Phone - try multiple selectors
        let phone = "";
        const phoneSelectors = [
          ".phones .phone",
          "a[href^='tel:']",
          ".phone",
          "[class*='phone']",
          "[data-aid='result-phone']",
          ".phones a",
        ];
        for (const sel of phoneSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            phone = el.textContent?.trim() || el.getAttribute("href")?.replace("tel:", "") || "";
            if (phone) break;
          }
        }

        // Category
        const categoryEl = card.querySelector(
          ".categories a, .links .first, [class*='categories'] a"
        );
        const category = categoryEl?.textContent?.trim() || "";

        // Rating
        const ratingEl = card.querySelector(
          ".ratings .result-rating, [class*='rating'], [class*='star']"
        );
        let rating = 0;
        if (ratingEl) {
          const className = ratingEl.className || ratingEl.getAttribute("aria-label") || "";
          const match = className.match(/star-(\d)/) || className.match(/([\d.]+)/);
          if (match) rating = parseFloat(match[1]);
        }

        // Website link (to detail page)
        const linkEl = card.querySelector(
          "a.track-visit-website, h2 a, .business-name a, [data-aid='result-title'] a"
        );
        const detailUrl = linkEl?.href || "";

        // Try to get actual website from data attribute or nearby link
        let website = "";
        const websiteEl = card.querySelector(
          "a.track-visit-website, [class*='website'], a[href*='http']:not([href*='yellowpages'])"
        );
        if (websiteEl && !websiteEl.href.includes("yellowpages.com")) {
          website = websiteEl.href;
        }

        // Email from search results card
        let email = "";
        const emailLink = card.querySelector('a[href^="mailto:"]');
        if (emailLink) {
          email = emailLink.href.replace("mailto:", "").split("?")[0].trim();
        }
        if (!email) {
          const emailEl = card.querySelector('[class*="email"] a, a[class*="email"]');
          if (emailEl) {
            const text = emailEl.textContent?.trim() || "";
            if (text.includes("@")) email = text;
          }
        }

        businesses.push({
          name,
          address,
          category,
          phone,
          website,
          email: email || "",
          facebook: "",
          rating,
          total_rating: 0,
          latitude: 0,
          longitude: 0,
          source: "yellowpages_extension",
          place_url: detailUrl,
        });
      } catch (e) {
        log("Parse error: " + e.message);
      }
    });

    return businesses;
  }

  // Extract from detail page (when user clicks into a business)
  function extractFromDetailPage() {
    const businesses = [];

    // Business name
    const nameEl = document.querySelector(
      "h1.business-name, h1, [class*='business-name']"
    );
    const name = nameEl?.textContent?.trim();
    if (!name) return [];

    // Address
    const streetEl = document.querySelector(
      ".adr .street-address, .street-address, [class*='street-address']"
    );
    const localityEl = document.querySelector(
      ".adr .locality, .locality, [class*='locality']"
    );
    const address = [streetEl?.textContent?.trim(), localityEl?.textContent?.trim()]
      .filter(Boolean)
      .join(", ");

    // Phone
    let phone = "";
    const phoneSelectors = [
      ".phones .phone",
      "a[href^='tel:']",
      ".phone",
      "[class*='phone']",
      "[data-aid='result-phone']",
    ];
    for (const sel of phoneSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        phone = el.textContent?.trim() || el.getAttribute("href")?.replace("tel:", "") || "";
        if (phone) break;
      }
    }

    // Website
    let website = "";
    const websiteSelectors = [
      "a.track-visit-website",
      "[class*='website'] a",
      "a[href*='http']:not([href*='yellowpages.com']):not([href*='google']):not([href*='facebook'])",
    ];
    for (const sel of websiteSelectors) {
      const el = document.querySelector(sel);
      if (el && el.href && !el.href.includes("yellowpages.com")) {
        website = el.href;
        break;
      }
    }

    // Email - multiple strategies
    let email = "";
    // Strategy 1: mailto: link
    const mailtoEl = document.querySelector('a[href^="mailto:"]');
    if (mailtoEl) {
      email = mailtoEl.href.replace("mailto:", "").split("?")[0].trim();
    }
    // Strategy 2: email link with class
    if (!email) {
      const emailEl = document.querySelector('[class*="email"] a, a[class*="email"], [data-aid="email"]');
      if (emailEl) {
        const text = emailEl.textContent?.trim() || emailEl.href?.replace("mailto:", "") || "";
        if (text.includes("@")) email = text.split("?")[0].trim();
      }
    }
    // Strategy 3: look for email pattern in page text
    if (!email) {
      const bodyText = document.body.innerText || "";
      const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) email = emailMatch[0];
    }

    // Category
    const categoryEl = document.querySelector(
      ".categories a, .links .first, [class*='categories']"
    );
    const category = categoryEl?.textContent?.trim() || "";

    // Hours
    const hoursEl = document.querySelector(
      ".hours-table, [class*='hours'], [data-aid='hours']"
    );
    const hours = hoursEl?.textContent?.trim() || "";

    log(`Detail: ${name} | phone=${!!phone} web=${!!website} email=${!!email}`);

    return [{
      name, address, category, phone, website,
      email: email || "", facebook: "",
      rating: 0, total_rating: 0,
      latitude: 0, longitude: 0,
      source: "yellowpages_extension",
      place_url: window.location.href,
      hours,
    }];
  }

  // Auto-enrich: click each business, extract detail, go back
  async function autoEnrich() {
    if (enrichRunning) return { error: "Already running" };
    enrichRunning = true;
    const results = [];

    // Find all business links
    const links = document.querySelectorAll(
      ".result h2 a, .business-name a, [data-aid='result-title'] a"
    );
    const validLinks = [];
    links.forEach((l) => {
      if (l.href && (l.href.includes("/biz/") || l.href.includes("/mip/"))) validLinks.push(l);
    });

    enrichProgress = { current: 0, total: validLinks.length, status: "starting" };
    log(`Auto-enrich: ${validLinks.length} businesses`);

    for (let i = 0; i < validLinks.length; i++) {
      if (!enrichRunning) break;
      const link = validLinks[i];
      const name = link.textContent?.trim() || `Business ${i + 1}`;
      enrichProgress = { current: i + 1, total: validLinks.length, status: name };

      // Click to go to detail page
      link.click();
      await sleep(3000);

      // Extract from detail page
      const detail = extractFromDetailPage();
      if (detail.length > 0) {
        results.push(detail[0]);
        log(`Enriched ${i + 1}/${validLinks.length}: ${name}`);
      }

      // Go back
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

  // Message handler for popup
  chrome.runtime.onMessage.addListener((msg, _, respond) => {
    if (msg.type === "PING") { respond({ ok: true }); return true; }
    if (msg.type === "EXTRACT") {
      // Try search results first, then detail page
      let results = extractFromYellowPages();
      if (results.length === 0) {
        results = extractFromDetailPage();
      }
      respond(results);
      return true;
    }
    if (msg.type === "GET_COUNT") {
      let count = extractFromYellowPages().length;
      if (count === 0) {
        const detail = extractFromDetailPage();
        count = detail.length;
      }
      respond({ count });
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
