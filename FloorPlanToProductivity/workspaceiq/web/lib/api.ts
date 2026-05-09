import { getAnalysisBackendUrl, getAnalysisMode, getCvWorkerUrl } from "@/lib/config";

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function analyseRoomWithConfiguredBackend(image: string) {
  const mode = getAnalysisMode();
  const workerUrl = getCvWorkerUrl();

  if (mode === "worker" && workerUrl) {
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ image })
    });

    if (!workerResponse.ok) {
      const errorPayload = await parseJsonSafely(workerResponse);
      throw new Error(errorPayload?.error || "Python analysis worker failed.");
    }

    return workerResponse.json();
  }

  const backendResponse = await fetch(`${getAnalysisBackendUrl()}/analyse-room`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ image })
  });

  if (!backendResponse.ok) {
    const errorPayload = await parseJsonSafely(backendResponse);
    throw new Error(errorPayload?.error || "Analysis backend failed.");
  }

  return backendResponse.json();
}

export async function generateLayoutWithConfiguredBackend(payload: unknown) {
  const backendResponse = await fetch(`${getAnalysisBackendUrl()}/generate-layout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!backendResponse.ok) {
    const errorPayload = await parseJsonSafely(backendResponse);
    throw new Error(errorPayload?.error || "Layout backend failed.");
  }

  return backendResponse.json();
}
