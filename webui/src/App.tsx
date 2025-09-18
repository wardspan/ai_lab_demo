import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import Dashboard from "./pages/Dashboard";
import Demos from "./pages/Demos";
import Logs from "./pages/Logs";
import Metrics from "./pages/Metrics";
import Settings from "./pages/Settings";
import { api } from "./lib/api";

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
  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        remove(toast.id);
      }, 4500)
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [toasts, remove]);

  return (
    <div className="fixed right-4 top-20 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg ${
            toast.variant === "error" ? "border-red-500/40" : toast.variant === "success" ? "border-green-500/30" : ""
          }`}
        >
          <div className="text-sm font-semibold text-slate-100">{toast.title}</div>
          {toast.description && <div className="mt-1 text-xs text-slate-400">{toast.description}</div>}
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
  const [latestMetrics, setLatestMetrics] = useState<Record<string, any> | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    toastIdRef.current += 1;
    setToasts((prev) => [...prev, { ...toast, id: toastIdRef.current }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const response = await api.getMetrics();
      if (response.metrics && response.metrics.data) {
        const data = response.metrics.data;
        const timestamp = new Date().toLocaleTimeString();
        setLatestMetrics(data.metrics || data);
        if (data.metrics) {
          const point = {
            timestamp,
            asr: data.metrics.asr ?? data.metrics.attack_success_rate ?? 0,
            leakage: data.metrics.leakage_count ?? 0,
            latency: data.metrics.detection_latency_ms ?? 0,
          };
          setMetricsHistory((prev) => [...prev.slice(-19), point]);
        }
      }
    } catch (error) {
      console.warn("Metrics fetch failed", error);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    const source = new EventSource(`${import.meta.env.VITE_API_BASE || __API_BASE__ || "http://localhost:5055/api"}/logs/stream`);
    source.addEventListener("metrics", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        if (payload?.data) {
          const timestamp = new Date().toLocaleTimeString();
          setLatestMetrics(payload.data.metrics || payload.data);
          const point = {
            timestamp,
            asr: payload.data.metrics?.asr ?? payload.data.asr ?? 0,
            leakage: payload.data.metrics?.leakage_count ?? payload.data.leakage_count ?? 0,
            latency: payload.data.metrics?.detection_latency_ms ?? payload.data.detection_latency_ms ?? 0,
          };
          setMetricsHistory((prev) => [...prev.slice(-19), point]);
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
  }, [pushToast]);

  const runDemo = useCallback(
    async (key: DemoKey) => {
      setRunning((prev) => ({ ...prev, [key]: true }));
      try {
        switch (key) {
          case "jailbreak":
            await api.runJailbreak();
            break;
          case "jailbreak-defense":
            await api.runJailbreakDefense();
            break;
          case "rag-injection":
            await api.runRagInjection();
            break;
          case "rag-defense":
            await api.runRagDefense();
            break;
          case "poisoning":
            await api.runPoisoning();
            break;
          case "redaction":
            await api.runRedaction();
            break;
          case "orchestrate":
            await api.orchestrate();
            await loadMetrics();
            break;
          default:
            break;
        }
        pushToast({ title: "Success", description: `${key} executed`, variant: "success" });
      } catch (error: any) {
        pushToast({ title: "Error", description: error?.message || "Demo failed", variant: "error" });
      } finally {
        setRunning((prev) => ({ ...prev, [key]: false }));
      }
    },
    [loadMetrics, pushToast]
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
