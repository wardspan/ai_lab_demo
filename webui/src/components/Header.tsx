import { NavLink } from "react-router-dom";
import { cn } from "../shadcn/utils";
import { Shield, Activity } from "lucide-react";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/demos", label: "Demos" },
  { to: "/test", label: "Prompt Tester" },
  { to: "/logs", label: "Logs" },
  { to: "/metrics", label: "Metrics" },
  { to: "/settings", label: "Settings" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3 text-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/20">
            <Shield className="h-6 w-6 text-brand" />
          </div>
          <div>
            <div className="text-lg font-semibold">AI Security Lab</div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Activity className="h-3.5 w-3.5" />
              Live Demo Dashboard
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "rounded-xl px-3 py-2 transition",
                  isActive ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-100"
                )
              }
              end={link.to === "/"}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
