import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface MetricPoint {
  timestamp: string;
  asr?: number;
  leakage?: number;
  latency?: number;
}

interface MetricsChartProps {
  data: MetricPoint[];
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "0.75rem",
  color: "#e2e8f0",
  padding: "0.75rem",
};

export function MetricsChart({ data }: MetricsChartProps) {
  const leakageData = data.map((point) => ({ timestamp: point.timestamp, value: point.leakage ?? 0 }));
  const asrData = data.map((point) => ({ timestamp: point.timestamp, value: point.asr ?? 0 }));
  const latencyData = data.map((point) => ({ timestamp: point.timestamp, value: point.latency ?? 0 }));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300">Attack Success Rate</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={asrData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis domain={[0, 1]} stroke="#64748b" tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300">Leakage Count</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leakageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis allowDecimals={false} stroke="#64748b" tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#6366f1" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold text-slate-300">Detection Latency (ms)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
