import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
}

/**
 * A filterable, keyboard-navigable dropdown — a plain <select> gets
 * unusable once there are dozens of products, and restaurant staff need to
 * be able to type "chick" and see Chicken Breast instead of scrolling.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  allowCreate,
  onCreateNew,
}: {
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCreate?: boolean;
  onCreateNew?: (typed: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)).slice(0, 50);
  }, [options, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const choose = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={rootRef}>
      <input
        className="input"
        placeholder={placeholder}
        value={open ? query : selected?.label ?? ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlight]) choose(filtered[highlight].value);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 && !allowCreate && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${i === highlight ? "bg-brand-50" : "hover:bg-slate-50"}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(o.value)}
            >
              <span className="font-medium text-slate-800">{o.label}</span>
              {o.sublabel && <span className="text-xs text-slate-400">{o.sublabel}</span>}
            </button>
          ))}
          {allowCreate && query.trim() && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
              onClick={() => {
                onCreateNew?.(query.trim());
                setOpen(false);
              }}
            >
              + Create "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
