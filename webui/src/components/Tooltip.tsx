import { PropsWithChildren, ReactNode, useState } from "react";
import { cn } from "../shadcn/utils";

interface TooltipProps {
  text: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({ text, placement = "top", className, children }: PropsWithChildren<TooltipProps>) {
  const [open, setOpen] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 -translate-y-2",
    bottom: "top-full left-1/2 -translate-x-1/2 translate-y-2",
    left: "right-full top-1/2 -translate-y-1/2 -translate-x-2",
    right: "left-full top-1/2 -translate-y-1/2 translate-x-2",
  };

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-64 rounded-xl border border-slate-800 bg-slate-900/95 px-4 py-3 text-sm text-slate-200 shadow-lg transition-opacity duration-150",
          open ? "opacity-100" : "opacity-0",
          positionClasses[placement]
        )}
      >
        {text}
      </div>
    </div>
  );
}
