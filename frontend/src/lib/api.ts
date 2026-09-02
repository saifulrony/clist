import { SearchRequest, SearchResponse } from "@/types";

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:18001";
  return `http://${window.location.hostname}:18001`;
}

export async function searchBusinesses(
  request: SearchRequest
): Promise<SearchResponse> {
  const response = await fetch(`${getApiBase()}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Search failed");
  }

  return response.json();
}

export async function exportCSV(request: SearchRequest): Promise<Blob> {
  const response = await fetch(`${getApiBase()}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Export failed");
  }

  return response.blob();
}
