export function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Local-only classroom demo. Synthetic data only.</p>
        <p>Version {__APP_VERSION__}</p>
      </div>
    </footer>
  );
}
