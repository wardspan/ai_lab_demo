import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import Dashboard from "./pages/Dashboard";
import Demos from "./pages/Demos";
import Logs from "./pages/Logs";
import Metrics from "./pages/Metrics";
import Settings from "./pages/Settings";
import PromptTester from "./pages/PromptTester";
import { api, MetricsSummary } from "./lib/api";

export type DemoKey =
  | "jailbreak"
  | "jailbreak-defense"
  | "rag-injection"
  | "rag-defense"
  | "poisoning"
  | "redaction"
  | "orchestrate";

interface DemoContextValue {
  runDemo: (key: DemoKey) => Promise<void>;
  running: Record<DemoKey, boolean>;
  refreshMetrics: () => Promise<void>;
  metricsHistory: Array<{ timestamp: string; asr?: number; leakage?: number; latency?: number }>;
  latestMetrics: Record<string, any> | null;
  pushToast: (toast: ToastMessage) => void;
}

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant?: "success" | "error" | "info";
}

export const DemoContext = createContext<DemoContextValue | undefined>(undefined);

function ToastContainer({ toasts, remove }: { toasts: ToastMessage[]; remove: (id: number) => void }) {
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const ids = new Set(toasts.map((toast) => toast.id));
    // Clear timers for toasts that are gone
    for (const [id, timer] of Array.from(timersRef.current.entries())) {
      if (!ids.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }
    // Create timers for new toasts
    toasts.forEach((toast) => {
      if (timersRef.current.has(toast.id)) {
        return;
      }
      const timer = setTimeout(() => {
        remove(toast.id);
        timersRef.current.delete(toast.id);
      }, 4500);
      timersRef.current.set(toast.id, timer);
    });
    return () => {
      toasts.forEach((toast) => {
        const timer = timersRef.current.get(toast.id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(toast.id);
        }
      });
    };
  }, [toasts, remove]);

  return (
    <div className="fixed right-4 top-20 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg ${
            toast.variant === "error" ? "border-red-500/40" : toast.variant === "success" ? "border-green-500/30" : ""
          }`}
        >
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-100">{toast.title}</div>
            {toast.description && <div className="mt-1 text-xs text-slate-400">{toast.description}</div>}
          </div>
          <button
            className="text-xs text-slate-500 transition hover:text-slate-300"
            onClick={() => remove(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function AppContainer() {
  const navigate = useNavigate();
  const [running, setRunning] = useState<Record<DemoKey, boolean>>({
    "jailbreak": false,
    "jailbreak-defense": false,
    "rag-injection": false,
    "rag-defense": false,
    "poisoning": false,
    "redaction": false,
    "orchestrate": false,
  });
  const [metricsHistory, setMetricsHistory] = useState<Array<{ timestamp: string; asr?: number; leakage?: number; latency?: number }>>([]);
  const [latestMetrics, setLatestMetrics] = useState<MetricsSummary | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    toastIdRef.current += 1;
    setToasts((prev) => [...prev, { ...toast, id: toastIdRef.current }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const defaultSummary: MetricsSummary = {
    asr: 0,
    leakage_count: 0,
    detection_latency_ms: 0,
    total_prompts: 0,
    timestamp: undefined,
  };

  const deriveSummary = (payload: any): MetricsSummary | null => {
    if (!payload) return null;
    const block = payload.metrics ?? payload;
    if (!block) return null;
    return {
      asr: typeof block.asr === "number" ? block.asr : typeof block.attack_success_rate === "number" ? block.attack_success_rate : 0,
      leakage_count: typeof block.leakage_count === "number" ? block.leakage_count : 0,
      detection_latency_ms: typeof block.detection_latency_ms === "number" ? block.detection_latency_ms : 0,
      total_prompts: typeof block.total_prompts === "number" ? block.total_prompts : 0,
      timestamp: typeof block.timestamp === "string" ? block.timestamp : undefined,
    };
  };

  const pushMetricsPoint = useCallback((summary: MetricsSummary, label?: string) => {
    const displayLabel = label || (summary.timestamp ? new Date(summary.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString());
    // Always update the latest metrics to force a re-render
    setLatestMetrics({...summary});
    setMetricsHistory((prev) => [...prev.slice(-19), {
      timestamp: displayLabel,
      asr: summary.asr ?? 0,
      leakage: summary.leakage_count ?? 0,
      latency: summary.detection_latency_ms ?? 0,
    }]);
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const response = await api.getMetrics();
      if (response.metrics) {
        const summary = response.metrics.summary ?? deriveSummary(response.metrics.data) ?? defaultSummary;
        pushMetricsPoint(summary);
      }
    } catch (error) {
      console.warn("Metrics fetch failed", error);
    }
  }, [pushMetricsPoint]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    const source = new EventSource(`${import.meta.env.VITE_API_BASE || __API_BASE__ || "http://localhost:5055/api"}/logs/stream`);
    source.addEventListener("metrics", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        if (payload?.data) {
          const summary = (payload.data.summary as MetricsSummary) ?? deriveSummary(payload.data.raw) ?? defaultSummary;
          const timestamp = summary.timestamp ? new Date(summary.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
          pushMetricsPoint(summary, timestamp);
        }
      } catch (error) {
        console.warn("metrics event parse failed", error);
      }
    });
    source.addEventListener("demo_completed", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        pushToast({ title: "Demo completed", description: payload.summary, variant: "success" });
      } catch (error) {
        console.warn("demo event parse failed", error);
      }
    });
    return () => {
      source.close();
    };
  }, [pushToast, pushMetricsPoint]);

  const runDemo = useCallback(
    async (key: DemoKey) => {
      setRunning((prev) => ({ ...prev, [key]: true }));
      try {
        let responseData: any = null;
        switch (key) {
          case "jailbreak":
            responseData = await api.runJailbreak();
            break;
          case "jailbreak-defense":
            responseData = await api.runJailbreakDefense();
            break;
          case "rag-injection":
            responseData = await api.runRagInjection();
            break;
          case "rag-defense":
            responseData = await api.runRagDefense();
            break;
          case "poisoning":
            responseData = await api.runPoisoning();
            break;
          case "redaction":
            responseData = await api.runRedaction();
            break;
          case "orchestrate":
            responseData = await api.orchestrate();
            await loadMetrics();
            break;
          default:
            break;
        }
        const summaryFromResponse = responseData?.results?.metrics?.summary || responseData?.summary;
        if (summaryFromResponse) {
          pushMetricsPoint(summaryFromResponse, new Date().toLocaleTimeString());
        }
        pushToast({ title: "Success", description: `${key} executed`, variant: "success" });
      } catch (error: any) {
        pushToast({ title: "Error", description: error?.message || "Demo failed", variant: "error" });
      } finally {
        setRunning((prev) => ({ ...prev, [key]: false }));
        await loadMetrics();
      }
    },
    [loadMetrics, pushMetricsPoint, pushToast]
  );

  useEffect(() => {
    let awaiting = false;
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (!awaiting && event.key === "g") {
        awaiting = true;
        return;
      }
      if (awaiting) {
        const map: Record<string, string> = {
          d: "/",
          l: "/logs",
          m: "/metrics",
          s: "/settings",
        };
        const route = map[event.key.toLowerCase()];
        if (route) {
          navigate(route);
        }
        awaiting = false;
      }
    };
    const reset = () => {
      awaiting = false;
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("click", reset);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", reset);
    };
  }, [navigate]);

  const contextValue = useMemo<DemoContextValue>(
    () => ({
      runDemo,
      running,
      refreshMetrics: loadMetrics,
      metricsHistory,
      latestMetrics,
      pushToast,
    }),
    [runDemo, running, loadMetrics, metricsHistory, latestMetrics, pushToast]
  );

  return (
    <DemoContext.Provider value={contextValue}>
      <div className="flex min-h-screen flex-col bg-slate-950">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/demos" element={<Demos />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/test" element={<PromptTester />} />
          </Routes>
        </main>
        <Footer />
        <ToastContainer toasts={toasts} remove={removeToast} />
      </div>
    </DemoContext.Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContainer />
    </BrowserRouter>
  );
}
