import { cn } from "../shadcn/utils";
import { PropsWithChildren, ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: ReactNode;
  description?: string;
  accent?: string;
  footer?: ReactNode;
}

export function StatCard({ title, value, description, accent = "bg-brand/10", footer }: PropsWithChildren<StatCardProps>) {
  return (
    <div className={cn("rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg", accent)}>
      <div className="text-sm uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-50">{value}</div>
      {description && <div className="mt-2 text-sm text-slate-400">{description}</div>}
      {footer && <div className="mt-4 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}
