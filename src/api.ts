const API_BASE = import.meta.env.VITE_API_URL || "";

export const api = async (url: string, method: string = "GET", body?: any) => {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_BASE}/api/${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
  }

  const data = await res.json();

  if (Array.isArray(data)) {
    return data.map(d => ({ ...d, id: d._id || d.id }));
  }

  if (data?._id) {
    data.id = data._id;
  }

  return data;
};
