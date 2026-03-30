import type { League } from "@/data/types";
import { leagueFlags } from "@/data/mockData";

const allLeagues: League[] = [
  "Premier League", "La Liga", "Serie A", "Ligue 1",
  "Saudi Pro League", "MLS", "Süper Lig"
];

interface LeagueFilterProps {
  selected: League | "all";
  onSelect: (league: League | "all") => void;
}

export function LeagueFilter({ selected, onSelect }: LeagueFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect("all")}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
          selected === "all"
            ? "gradient-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        }`}
      >
        All Leagues
      </button>
      {allLeagues.map(league => (
        <button
          key={league}
          onClick={() => onSelect(league)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            selected === league
              ? "gradient-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {leagueFlags[league]} {league}
        </button>
      ))}
    </div>
  );
}
