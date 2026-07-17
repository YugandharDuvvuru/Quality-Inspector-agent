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

export async function submitInspectionWithProgress(payload, options = {}) {
  const response = await fetch(`${API_BASE_URL}/api/inspections/stream`, {
    method: "POST",
    credentials: "include",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "Request failed";

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // Streaming endpoints return JSON only before the stream starts.
    }

    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Inspection progress stream is not available in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inspectionResult = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split("\n\n");
    buffer = eventBlocks.pop() || "";

    for (const eventBlock of eventBlocks) {
      const event = parseStreamEvent(eventBlock);

      if (!event) {
        continue;
      }

      if (event.type === "inspection_failed") {
        throw new Error(event.message || "Inspection failed");
      }

      if (event.type === "inspection_completed") {
        inspectionResult = event.result;
        continue;
      }

      options.onProgress?.(event);
    }
  }

  if (!inspectionResult) {
    throw new Error("Inspection stream ended before the final result was returned.");
  }

  return inspectionResult;
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

function parseStreamEvent(eventBlock) {
  const data = eventBlock
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (!data) {
    return null;
  }

  return JSON.parse(data);
}
