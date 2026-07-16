const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function registerAccount(payload) {
  return requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginAccount(payload) {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser() {
  return requestJson("/api/auth/me");
}

export async function logoutAccount() {
  return requestJson("/api/auth/logout", {
    method: "POST",
  });
}

export async function submitInspection(payload, options = {}) {
  return requestJson("/api/inspections", {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify(payload),
  });
}

export async function fetchInspectionByTrace(traceId) {
  return requestJson(`/api/inspections/trace/${encodeURIComponent(traceId)}`);
}

export async function downloadInspectionReport(traceId) {
  const response = await fetch(
    `${API_BASE_URL}/api/inspections/trace/${encodeURIComponent(traceId)}/report.pdf`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    let message = "Could not download inspection report";

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // The report endpoint normally returns JSON only for errors.
    }

    throw new Error(message);
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const pdfBytes = await response.arrayBuffer();

  return {
    blob: new Blob([pdfBytes], { type: "application/pdf" }),
    filename: filenameMatch?.[1] || `inspection-report-${traceId}.pdf`,
  };
}

export async function fetchInspections() {
  const data = await requestJson("/api/inspections");
  return data.inspections;
}

export async function deleteInspections(traceIds) {
  return requestJson("/api/inspections", {
    method: "DELETE",
    body: JSON.stringify({ trace_ids: traceIds }),
  });
}

export async function fetchHealthStatus() {
  return requestJson("/api/health");
}

async function requestJson(path, options = {}) {
  const { headers, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}
