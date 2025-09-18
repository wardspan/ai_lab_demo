import { useContext, useState } from "react";
import { DemoContext } from "../App";
import { LogsPane } from "../components/LogsPane";
import type { KnownLog } from "../lib/api";

export default function Logs() {
  const context = useContext(DemoContext);
  const [activeLog, setActiveLog] = useState<KnownLog>("jailbreak");

  if (!context) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Live Logs</h1>
        <p className="mt-1 text-sm text-slate-400">Streaming events from controller and demo services. Filter and copy as needed.</p>
      </div>
      <LogsPane activeLog={activeLog} onActiveLogChange={setActiveLog} />
    </div>
  );
}
