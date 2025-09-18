import { PropsWithChildren } from "react";

interface CodeBlockProps {
  title?: string;
}

export function CodeBlock({ title, children }: PropsWithChildren<CodeBlockProps>) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      {title && <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{title}</div>}
      <pre className="overflow-x-auto text-sm text-slate-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}
