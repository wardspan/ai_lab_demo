import { FormEvent, useContext, useEffect, useState } from "react";
import { DemoContext } from "../App";
import { Button } from "../components/Button";
import { Toggle } from "../components/Toggle";
import { api } from "../lib/api";

interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}

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
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [newModel, setNewModel] = useState("");

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
    loadOllamaModels();
  }, []);

  const loadOllamaModels = async () => {
    try {
      const response = await api.listOllamaModels() as { status: string; models?: OllamaModel[]; error?: string };
      if (response.status === "ok" && response.models) {
        setOllamaModels(response.models);
      }
    } catch (error) {
      console.warn("Failed to load Ollama models", error);
    }
  };

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

  const pullModel = async () => {
    if (!newModel.trim()) {
      pushToast({ title: "Model name required", description: "Please enter a model name", variant: "error" });
      return;
    }

    setModelsLoading(true);
    try {
      const result = await api.pullOllamaModel(newModel.trim()) as { status: string; message?: string; error?: string };
      if (result.status === "ok") {
        pushToast({ title: "Model pulled successfully", description: result.message || `Pulled ${newModel}`, variant: "success" });
        setNewModel("");
        loadOllamaModels(); // Refresh the list
      } else {
        pushToast({ title: "Failed to pull model", description: result.error || "Unknown error", variant: "error" });
      }
    } catch (error: any) {
      pushToast({ title: "Pull failed", description: error?.message || "Unexpected error", variant: "error" });
    } finally {
      setModelsLoading(false);
    }
  };

  const removeModel = async (modelName: string) => {
    if (!confirm(`Are you sure you want to remove the model "${modelName}"?`)) {
      return;
    }

    try {
      const result = await api.removeOllamaModel(modelName) as { status: string; message?: string; error?: string };
      if (result.status === "ok") {
        pushToast({ title: "Model removed", description: result.message || `Removed ${modelName}`, variant: "success" });
        loadOllamaModels(); // Refresh the list
      } else {
        pushToast({ title: "Failed to remove model", description: result.error || "Unknown error", variant: "error" });
      }
    } catch (error: any) {
      pushToast({ title: "Remove failed", description: error?.message || "Unexpected error", variant: "error" });
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

      {/* Ollama Model Management */}
      <div className="mt-8 space-y-6">
        <h2 className="text-xl font-semibold text-slate-100">Ollama Model Management</h2>

        {/* Pull New Model */}
        <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <label className="text-sm font-semibold text-slate-200">Pull New Model</label>
          <div className="flex gap-3">
            <input
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="e.g., llama3:8b, mistral, codellama"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <Button onClick={pullModel} loading={modelsLoading} disabled={!newModel.trim()}>
              Pull Model
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Popular models: llama3:8b, llama3:70b, mistral, codellama, phi3, gemma2
          </p>
        </div>

        {/* Installed Models */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-200">Installed Models</label>
            <Button variant="ghost" onClick={loadOllamaModels} disabled={modelsLoading}>
              Refresh
            </Button>
          </div>

          {ollamaModels.length === 0 ? (
            <p className="text-sm text-slate-400">No models installed. Pull a model to get started.</p>
          ) : (
            <div className="space-y-3">
              {ollamaModels.map((model) => (
                <div key={model.name} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200">{model.name}</div>
                    <div className="text-xs text-slate-400">
                      Size: {model.size} • Modified: {model.modified || 'Recently'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setState(prev => ({ ...prev, ollamaModel: model.name }))}
                      disabled={state.ollamaModel === model.name}
                    >
                      {state.ollamaModel === model.name ? 'Selected' : 'Select'}
                    </Button>
                    <Button variant="ghost" onClick={() => removeModel(model.name)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
