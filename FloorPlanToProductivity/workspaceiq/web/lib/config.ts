function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getCvWorkerUrl() {
  const raw = process.env.ANALYSIS_WORKER_URL || process.env.NEXT_PUBLIC_ANALYSIS_WORKER_URL || "";
  return raw ? trimTrailingSlash(raw) : "";
}
