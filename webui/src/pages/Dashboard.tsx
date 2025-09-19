import { useContext, useMemo } from "react";
import { DemoContext } from "../App";
import { StatCard } from "../components/StatCard";
import { Button } from "../components/Button";
import { Tooltip } from "../components/Tooltip";

export default function Dashboard() {
  const context = useContext(DemoContext);
  if (!context) {
    return null;
  }
  const { runDemo, running, latestMetrics, metricsHistory } = context;

  const lastRun = useMemo(() => metricsHistory.at(-1)?.timestamp ?? "--", [metricsHistory]);
  const asr = latestMetrics?.asr ?? 0;
  const leakage = latestMetrics?.leakage_count ?? 0;
  const latency = latestMetrics?.detection_latency_ms ?? 0;
  const updatedLabel = latestMetrics?.timestamp ? new Date(latestMetrics.timestamp).toLocaleTimeString() : lastRun;

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
          <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Last updated: {updatedLabel}</p>
          <div className="mt-6 grid gap-3">
            <Tooltip text="Send blocked and bypass prompts to the FastAPI server to showcase guardrails.">
              <Button loading={running["jailbreak"]} onClick={() => runDemo("jailbreak")}>
                Run Jailbreak Demo
              </Button>
            </Tooltip>
            <Tooltip text="Build synthetic docs and run the RAG pipeline without defenses to show injection effects.">
              <Button loading={running["rag-injection"]} onClick={() => runDemo("rag-injection")}>
                Run RAG Injection
              </Button>
            </Tooltip>
            <Tooltip text="Train the classifier, add poisoned samples, and display the accuracy change.">
              <Button loading={running["poisoning"]} onClick={() => runDemo("poisoning")}>
                Run Poisoning Demo
              </Button>
            </Tooltip>
            <Tooltip text="Execute the PII redaction utility to highlight pre-retrieval sanitization.">
              <Button loading={running["redaction"]} onClick={() => runDemo("redaction")}>
                Run RAG Redaction
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Defensive Toggles</h2>
          <p className="mt-1 text-sm text-slate-400">Compare offense vs defense with one click.</p>
          <div className="mt-6 grid gap-3">
            <Tooltip text="Enable STRICT_MODE and rerun the bypass prompt to show tightened policies.">
              <Button loading={running["jailbreak-defense"]} onClick={() => runDemo("jailbreak-defense")}>
                Run Jailbreak Defense
              </Button>
            </Tooltip>
            <Tooltip text="Run the RAG pipeline with strip_instruction_tokens enabled.">
              <Button loading={running["rag-defense"]} onClick={() => runDemo("rag-defense")}>
                Run RAG Sanitizer
              </Button>
            </Tooltip>
            <Tooltip text="Invoke harness/orchestrator.py to compute fresh ASR, leakage, and latency metrics.">
              <Button loading={running["orchestrate"]} onClick={() => runDemo("orchestrate")}>
                Refresh Metrics
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
