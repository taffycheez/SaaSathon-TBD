function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAnalysisBackendUrl() {
  return trimTrailingSlash(
    process.env.ANALYSIS_BACKEND_URL ||
      process.env.NEXT_PUBLIC_ANALYSIS_BACKEND_URL ||
      "http://127.0.0.1:3001"
  );
}

export function getCvWorkerUrl() {
  const raw = process.env.ANALYSIS_WORKER_URL || process.env.NEXT_PUBLIC_ANALYSIS_WORKER_URL || "";
  return raw ? trimTrailingSlash(raw) : "";
}

export function getAnalysisMode() {
  return process.env.ANALYSIS_MODE || "backend";
}
