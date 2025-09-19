import { FormEvent, useContext, useEffect, useState } from "react";
import { DemoContext } from "../App";
import { Button } from "../components/Button";
import { api } from "../lib/api";

interface TestResult {
  status: string;
  prompt: string;
  result?: any;
  error?: string;
  latency_ms: number;
}

export default function PromptTester() {
  const context = useContext(DemoContext);
  const [prompt, setPrompt] = useState("");
  const [intent, setIntent] = useState("custom");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentProvider, setCurrentProvider] = useState<string>("mock");
  const [currentModel, setCurrentModel] = useState<string>("N/A");

  useEffect(() => {
    const loadCurrentSettings = async () => {
      try {
        const settings = await api.getSettings();
        if ("missing" in settings && settings.missing) return;

        const provider = settings.LLM_PROVIDER || "mock";
        const model = provider === "ollama" ? (settings.OLLAMA_MODEL || "llama3:8b") : "Simulated";

        setCurrentProvider(provider);
        setCurrentModel(model);
      } catch (error) {
        console.warn("Failed to load settings", error);
      }
    };
    loadCurrentSettings();
  }, []);

  if (!context) {
    return null;
  }
  const { pushToast } = context;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) {
      pushToast({ title: "Empty prompt", description: "Please enter a prompt to test", variant: "error" });
      return;
    }

    setLoading(true);
    try {
      const result = await api.testPrompt({
        text: prompt.trim(),
        intent: intent || "custom",
      });
      setResults((prev) => [result, ...prev.slice(0, 9)]); // Keep last 10 results
      pushToast({ title: "Prompt tested", description: `Response in ${result.latency_ms}ms`, variant: "success" });
    } catch (error: any) {
      pushToast({ title: "Test failed", description: error?.message || "Unexpected error", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Prompt Tester</h1>
          <p className="mt-1 text-sm text-slate-400">
            Send custom prompts to test jailbreak techniques against the current LLM provider.
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className="text-slate-500">Current Provider:</span>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${currentProvider === 'ollama' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {currentProvider === 'ollama' ? '🤖 Ollama' : '🎭 Mock'}
            </span>
            <span className="text-slate-500">Model:</span>
            <span className="font-mono text-slate-300">{currentModel}</span>
          </div>
        </div>
        {results.length > 0 && (
          <Button variant="secondary" onClick={clearResults}>
            Clear Results
          </Button>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-8">
        <div className="grid gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div>
            <label className="text-sm font-medium text-slate-200">Prompt</label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Enter your jailbreak attempt here..."
              rows={6}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-200">Intent</label>
              <input
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                placeholder="custom"
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={loading} className="w-full sm:w-auto">
                Test Prompt
              </Button>
            </div>
          </div>
        </div>
      </form>

      {results.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Recent Tests</h2>
          {results.map((result, index) => (
            <div key={index} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-200">Prompt</div>
                  <div className="mt-1 text-sm text-slate-400">{result.prompt}</div>
                </div>
                <div className="ml-4 flex items-center gap-4 text-xs">
                  <span className="text-slate-500">{result.latency_ms}ms</span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      result.status === "ok"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
              </div>

              {result.status === "ok" && result.result && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="text-xs">
                      <span className="text-slate-500 uppercase tracking-wide">Provider</span>
                      <div className="text-slate-300">{result.result.provider}</div>
                    </div>
                    <div className="text-xs">
                      <span className="text-slate-500 uppercase tracking-wide">Success</span>
                      <div className={result.result.ok ? "text-green-400" : "text-red-400"}>
                        {result.result.ok ? "Yes" : "No"}
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="text-slate-500 uppercase tracking-wide">Reason</span>
                      <div className="text-slate-300">{result.result.reason || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Response</div>
                    <div className="text-sm text-slate-200 bg-slate-950/50 rounded-xl p-3 max-h-32 overflow-y-auto">
                      {result.result.response || <em className="text-slate-500">Empty response</em>}
                    </div>
                  </div>
                </div>
              )}

              {result.status === "error" && (
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Error</div>
                  <div className="text-sm text-red-400 bg-red-500/10 rounded-xl p-3">
                    {result.error}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}