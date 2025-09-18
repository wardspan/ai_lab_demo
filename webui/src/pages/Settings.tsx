import { FormEvent, useContext, useEffect, useState } from "react";
import { DemoContext } from "../App";
import { Button } from "../components/Button";
import { Toggle } from "../components/Toggle";
import { api } from "../lib/api";

interface SettingsState {
  provider: "mock" | "ollama";
  strictMode: boolean;
  bypassToken: string;
  ollamaModel: string;
}

const defaultState: SettingsState = {
  provider: "mock",
  strictMode: true,
  bypassToken: "roleplay",
  ollamaModel: "llama3:8b",
};

export default function Settings() {
  const context = useContext(DemoContext);
  const [state, setState] = useState<SettingsState>(defaultState);
  const [loading, setLoading] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await api.getSettings();
        if ("missing" in response && response.missing) {
          return;
        }
        setState({
          provider: (response.LLM_PROVIDER as SettingsState["provider"]) || "mock",
          strictMode: (response.STRICT_MODE?.toLowerCase?.() ?? "true") === "true",
          bypassToken: response.BYPASS_TOKEN || "roleplay",
          ollamaModel: response.OLLAMA_MODEL || "llama3:8b",
        });
      } catch (error) {
        console.warn("Failed to load settings", error);
      }
    }
    fetchSettings();
  }, []);

  if (!context) {
    return null;
  }
  const { pushToast } = context;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setRestartMessage(null);
    try {
      await api.saveSettings({
        provider: state.provider,
        strictMode: state.strictMode,
        bypassToken: state.bypassToken,
        ollamaModel: state.ollamaModel,
      });
      pushToast({ title: "Settings saved", description: "Restart mock-llm to apply.", variant: "success" });
      setRestartMessage("Settings updated. Restart mock-llm to apply changes.");
    } catch (error: any) {
      pushToast({ title: "Failed to save", description: error?.message || "Unexpected error", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const restart = async (service: string) => {
    try {
      const result = await api.restartService(service);
      if (result.status === "ok") {
        pushToast({ title: `Restarted ${service}`, description: result.output || "", variant: "success" });
      } else {
        pushToast({ title: `Could not restart ${service}`, description: result.message || "", variant: "error" });
      }
    } catch (error: any) {
      pushToast({ title: `Restart failed`, description: error?.message || "Unexpected error", variant: "error" });
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
      <p className="mt-1 text-sm text-slate-400">Adjust provider configuration and runtime toggles. Changes persist to .env.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <label className="text-sm font-semibold text-slate-200">Provider</label>
          <div className="flex flex-wrap gap-3 text-sm">
            <Button
              type="button"
              variant={state.provider === "mock" ? "primary" : "secondary"}
              onClick={() => setState((prev) => ({ ...prev, provider: "mock" }))}
            >
              Mock Provider
            </Button>
            <Button
              type="button"
              variant={state.provider === "ollama" ? "primary" : "secondary"}
              onClick={() => setState((prev) => ({ ...prev, provider: "ollama" }))}
            >
              Ollama
            </Button>
          </div>
          <Toggle
            label="Strict Mode"
            checked={state.strictMode}
            onChange={(checked) => setState((prev) => ({ ...prev, strictMode: checked }))}
            description="Require client intent metadata and block bypass tokens."
          />
          <div>
            <label className="text-sm font-medium text-slate-200">Bypass Token</label>
            <input
              value={state.bypassToken}
              onChange={(event) => setState((prev) => ({ ...prev, bypassToken: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-200">Ollama Model</label>
            <input
              value={state.ollamaModel}
              onChange={(event) => setState((prev) => ({ ...prev, ollamaModel: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading}>
            Save Settings
          </Button>
          <Button type="button" variant="secondary" onClick={() => restart("mock-llm")}>
            Restart mock-llm
          </Button>
          <Button type="button" variant="ghost" onClick={() => restart("controller_api")}>
            Restart controller
          </Button>
        </div>
        {restartMessage && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">{restartMessage}</div>}
      </form>
    </div>
  );
}
