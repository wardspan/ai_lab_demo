import { useEffect, useMemo, useState } from "react";
import { knownLogs, KnownLog, api } from "../lib/api";
import { Button } from "./Button";
import { Search, Copy } from "lucide-react";

interface LogsPaneProps {
  activeLog: KnownLog;
  onActiveLogChange: (log: KnownLog) => void;
}

interface LogEvent {
  source: string;
  line: string;
}

export function LogsPane({ activeLog, onActiveLogChange }: LogsPaneProps) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`${import.meta.env.VITE_API_BASE || __API_BASE__ || "http://localhost:5055/api"}/logs/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("log", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as LogEvent;
        setEvents((prev) => [...prev.slice(-499), data]);
      } catch (error) {
        console.error("Failed to parse log event", error);
      }
    });
    return () => {
      source.close();
    };
  }, []);

  useEffect(() => {
    api.tailLog(activeLog).then((res) => {
      if (res.lines) {
        setEvents(res.lines.map((line: string) => ({ source: activeLog, line })));
      }
    });
  }, [activeLog]);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (filter && !event.line.toLowerCase().includes(filter.toLowerCase())) {
        return false;
      }
      return event.source === activeLog;
    });
  }, [events, filter, activeLog]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map((entry) => entry.line).join("\n"));
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
          {connected ? "Live stream connected" : "Disconnected"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter logs"
              className="w-48 rounded-xl border border-slate-800 bg-slate-900/70 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <Button variant="secondary" onClick={copyToClipboard}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <select
            value={activeLog}
            onChange={(event) => onActiveLogChange(event.target.value as KnownLog)}
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
          >
            {knownLogs.map((log) => (
              <option key={log.value} value={log.value}>
                {log.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="h-[420px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4 font-mono text-xs leading-relaxed text-slate-300">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-600">
            No log entries yet. Run a demo to generate output.
          </div>
        ) : (
          filtered.map((event, index) => (
            <div key={`${event.source}-${index}`} className="whitespace-pre-wrap">
              {event.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
