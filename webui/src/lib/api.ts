const API_BASE = import.meta.env.VITE_API_BASE || __API_BASE__ || "http://localhost:5055/api";

type Method = "GET" | "POST";

async function request<T>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse JSON", error);
    throw error;
  }
}

export interface MetricsResponse {
  metrics: {
    data: any;
    summary?: MetricsSummary;
    missing?: boolean;
  };
  redteam: {
    data: any;
    missing?: boolean;
  };
}

export interface MetricsSummary {
  asr?: number;
  leakage_count?: number;
  detection_latency_ms?: number;
  total_prompts?: number;
  timestamp?: string;
}

export const api = {
  runJailbreak: () => request("/demo/jailbreak/run", "POST"),
  runJailbreakDefense: () => request("/demo/jailbreak/defense", "POST"),
  runRagInjection: () => request("/demo/rag/injection", "POST"),
  runRagDefense: () => request("/demo/rag/defense", "POST"),
  runPoisoning: () => request("/demo/poisoning/run", "POST"),
  runRedaction: () => request("/demo/redaction/run", "POST"),
  orchestrate: () => request("/metrics/orchestrate", "POST"),
  getMetrics: () => request<MetricsResponse>("/metrics"),
  getSettings: () => request<Record<string, string> | { missing: boolean }>("/settings"),
  saveSettings: (payload: any) => request("/settings", "POST", payload),
  restartService: (service: string) => request("/services/restart", "POST", { service }),
  clearLog: (name: string) => request("/logs/clear", "POST", { name }),
  tailLog: (name: string, lines = 200) => request(`/logs/tail?name=${encodeURIComponent(name)}&lines=${lines}`),
  testPrompt: (payload: { text: string; intent?: string; meta?: any }) => request("/test/prompt", "POST", payload),
};

export type KnownLog =
  | "jailbreak"
  | "rag_injection"
  | "rag_defense"
  | "poisoning"
  | "redaction"
  | "requests";

export const knownLogs: { value: KnownLog; label: string }[] = [
  { value: "jailbreak", label: "Jailbreak Demo" },
  { value: "rag_injection", label: "RAG Injection" },
  { value: "rag_defense", label: "RAG Defense" },
  { value: "poisoning", label: "Poisoning Demo" },
  { value: "redaction", label: "Redaction Demo" },
  { value: "requests", label: "Server Requests" },
];
