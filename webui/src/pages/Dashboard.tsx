import { useContext, useMemo } from "react";
import { DemoContext } from "../App";
import { StatCard } from "../components/StatCard";
import { Button } from "../components/Button";

export default function Dashboard() {
  const context = useContext(DemoContext);
  if (!context) {
    return null;
  }
  const { runDemo, running, latestMetrics, metricsHistory } = context;

  const lastRun = useMemo(() => metricsHistory.at(-1)?.timestamp ?? "--", [metricsHistory]);
  const asr = latestMetrics?.metrics?.asr ?? latestMetrics?.asr ?? 0;
  const leakage = latestMetrics?.metrics?.leakage_count ?? latestMetrics?.leakage_count ?? 0;
  const latency = latestMetrics?.metrics?.detection_latency_ms ?? latestMetrics?.detection_latency_ms ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-6 md:grid-cols-3">
        <StatCard title="Attack Success Rate" value={`${(asr * 100).toFixed(1)}%`} description="Share of prompts that bypassed controls" />
        <StatCard title="Leakage Count" value={leakage} description="Synthetic secrets observed in responses" />
        <StatCard title="Detection Latency" value={`${latency?.toFixed?.(1) ?? latency} ms`} description="Time to first alert" footer={`Last orchestrator run: ${lastRun}`} />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Run Demos</h2>
          <p className="mt-1 text-sm text-slate-400">Trigger key workloads with safe, synthetic prompts.</p>
          <div className="mt-6 grid gap-3">
            <Button loading={running["jailbreak"]} onClick={() => runDemo("jailbreak")}>Run Jailbreak Demo</Button>
            <Button loading={running["rag-injection"]} onClick={() => runDemo("rag-injection")}>Run RAG Injection</Button>
            <Button loading={running["poisoning"]} onClick={() => runDemo("poisoning")}>Run Poisoning Demo</Button>
            <Button loading={running["redaction"]} onClick={() => runDemo("redaction")}>Run RAG Redaction</Button>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Defensive Toggles</h2>
          <p className="mt-1 text-sm text-slate-400">Compare offense vs defense with one click.</p>
          <div className="mt-6 grid gap-3">
            <Button loading={running["jailbreak-defense"]} onClick={() => runDemo("jailbreak-defense")}>Run Jailbreak Defense</Button>
            <Button loading={running["rag-defense"]} onClick={() => runDemo("rag-defense")}>Run RAG Sanitizer</Button>
            <Button loading={running["orchestrate"]} onClick={() => runDemo("orchestrate")}>Refresh Metrics</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
