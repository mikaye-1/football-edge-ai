import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import type { DbMatch } from "@/hooks/useMatches";

interface TeamSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  allMatches: DbMatch[];
}

export function TeamSearchBar({ value, onChange, allMatches }: TeamSearchBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Extract unique teams with their latest match
  const teamSuggestions = useMemo(() => {
    const q = value.toLowerCase().trim();
    if (!q) return [];

    const teamMap = new Map<string, DbMatch>();
    for (const m of allMatches) {
      if (!teamMap.has(m.home_team)) teamMap.set(m.home_team, m);
      if (!teamMap.has(m.away_team)) teamMap.set(m.away_team, m);
    }

    return Array.from(teamMap.entries())
      .filter(([team]) => team.toLowerCase().includes(q))
      .slice(0, 8)
      .map(([team, match]) => ({ team, match }));
  }, [value, allMatches]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const goToMatch = (matchId: string) => {
    setOpen(false);
    onChange("");
    navigate(`/match/${matchId}`);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => value && setOpen(true)}
          placeholder="Search teams..."
          className="w-full h-9 pl-9 pr-8 rounded-md border border-border bg-secondary/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
        />
        {value && (
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && teamSuggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {teamSuggestions.map(({ team, match }) => (
            <button
              key={`${team}-${match.id}`}
              onClick={() => goToMatch(match.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
            >
              <span className="font-medium text-foreground">{team}</span>
              <span className="text-xs text-muted-foreground truncate ml-2">
                {match.home_team} vs {match.away_team}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
