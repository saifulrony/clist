const API_BASE_KEY = "apiBase";

async function getApiBase() {
  const result = await chrome.storage.local.get(API_BASE_KEY);
  if (result[API_BASE_KEY]) return result[API_BASE_KEY];
  return "http://192.168.10.203:18001";
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACTED_BUSINESSES") {
    handleExtractedBusinesses(msg.data, msg.source)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === "SAVE_TO_DB") {
    saveToDatabase(msg.businesses, msg.token)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === "SET_API_BASE") {
    chrome.storage.local.set({ [API_BASE_KEY]: msg.apiBase });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_API_BASE") {
    getApiBase().then((base) => sendResponse({ apiBase: base }));
    return true;
  }
});

async function handleExtractedBusinesses(businesses, source) {
  const apiBase = await getApiBase();

  const res = await fetch(`${apiBase}/api/extension/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businesses, source }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned: " + text.slice(0, 200)); }
  if (!res.ok) throw new Error(data.error || "Import failed");
  return data;
}

async function saveToDatabase(businesses, token) {
  const apiBase = await getApiBase();

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/api/extension/import`, {
    method: "POST",
    headers,
    body: JSON.stringify({ businesses }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned: " + text.slice(0, 200)); }
  if (!res.ok) throw new Error(data.error || "Save failed");
  return data;
}
