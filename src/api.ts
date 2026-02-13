const API_BASE = import.meta.env.VITE_API_URL || "/api";

export async function api(
  endpoint: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Cache-bust GET requests to avoid stale data
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = method === "GET"
    ? `${API_BASE}/${endpoint}${separator}_t=${Date.now()}`
    : `${API_BASE}/${endpoint}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}