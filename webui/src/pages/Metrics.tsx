import { useContext } from "react";
import { DemoContext } from "../App";
import { Button } from "../components/Button";
import { MetricsChart } from "../components/MetricsChart";

export default function Metrics() {
  const context = useContext(DemoContext);
  if (!context) {
    return null;
  }
  const { runDemo, running, metricsHistory, latestMetrics } = context;
  const updatedLabel = latestMetrics?.timestamp ? new Date(latestMetrics.timestamp).toLocaleTimeString() : "--";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Metrics</h1>
          <p className="mt-1 text-sm text-slate-400">Visualize orchestrator outputs: ASR, leakage, and detection latency.</p>
        </div>
        <Button loading={running["orchestrate"]} onClick={() => runDemo("orchestrate")}>Run Orchestrator</Button>
      </div>
      <div className="mt-6 grid gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-slate-500">ASR</div>
              <div className="text-xl font-semibold text-slate-100">
                {((latestMetrics?.asr ?? 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Leakage Count</div>
              <div className="text-xl font-semibold text-slate-100">
                {latestMetrics?.leakage_count ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Detection Latency</div>
              <div className="text-xl font-semibold text-slate-100">
                {latestMetrics?.detection_latency_ms ?? 0} ms
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">Total prompts: {latestMetrics?.total_prompts ?? 0} • Last updated: {updatedLabel}</div>
        </div>
        <MetricsChart data={metricsHistory} />
      </div>
    </div>
  );
}
