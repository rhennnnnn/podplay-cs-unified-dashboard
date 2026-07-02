"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TrackingMultiSelectProps {
  selected: string[];
  roster: string[];
  onChange: (names: string[]) => void;
}

// Deliberately NOT a Radix DropdownMenu — its content portals to
// document.body, which sits outside the parent Dialog's DOM subtree.
// Dialog's outside-click detection then sees every click inside the
// dropdown as "outside," closing the whole form before a selection could
// be made. This renders as a plain absolutely-positioned div that's a
// real DOM child of the Dialog, so clicks inside it are unambiguously
// "inside" and never trigger the Dialog to dismiss.
export function TrackingMultiSelect({ selected, roster, onChange }: TrackingMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Union so a name already selected on this record but no longer on the
  // team roster stays visible and toggleable (legacy data isn't silently
  // dropped) — this is the ONLY place old names should appear, never in
  // the base roster itself.
  const options = Array.from(new Set([...roster, ...selected]));

  function toggle(name: string) {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        {selected.length > 0 ? selected.join(" | ") : "Select tracking..."}
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No team members yet.</p>
          ) : (
            options.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", selected.includes(name) ? "opacity-100" : "opacity-0")} />
                {name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
