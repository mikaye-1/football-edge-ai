import { useMemo } from "react";
import { Filter } from "lucide-react";

interface MarketFilterProps {
  markets: string[];
  selected: string[];
  onToggle: (market: string) => void;
}

export function MarketFilter({ markets, selected, onToggle }: MarketFilterProps) {
  const sorted = useMemo(() => [...markets].sort(), [markets]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
        <Filter className="w-3.5 h-3.5" />
        <span>Markets:</span>
      </div>
      {sorted.map(m => {
        const active = selected.includes(m);
        return (
          <button
            key={m}
            onClick={() => onToggle(m)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
              active
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-secondary/50 text-muted-foreground border-border hover:border-primary/20"
            }`}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
