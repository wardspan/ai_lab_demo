interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

export function Toggle({ label, checked, onChange, description }: ToggleProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div>
        <div className="font-medium text-slate-100">{label}</div>
        {description && <div className="text-xs text-slate-400">{description}</div>}
      </div>
      <div className="relative inline-flex h-6 w-11 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <div className="h-full w-full rounded-full bg-slate-700 transition peer-checked:bg-brand" />
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
      </div>
    </label>
  );
}
