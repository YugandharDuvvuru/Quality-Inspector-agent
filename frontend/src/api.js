const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function submitInspection(payload) {
  const response = await fetch(`${API_BASE_URL}/api/inspections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Inspection request failed");
  }

  return data;
}

export async function fetchInspections() {
  const response = await fetch(`${API_BASE_URL}/api/inspections`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Could not load inspections");
  }

  return data.inspections;
}
