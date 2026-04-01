const leagueFlags: Record<string, string> = {
  "Premier League": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "La Liga": "🇪🇸",
  "Serie A": "🇮🇹",
  "Ligue 1": "🇫🇷",
  "Saudi Pro League": "🇸🇦",
  "MLS": "🇺🇸",
  "Süper Lig": "🇹🇷",
};

const allLeagues = [
  "Premier League", "La Liga", "Serie A", "Ligue 1",
  "Saudi Pro League", "MLS", "Süper Lig"
];

interface LeagueFilterProps {
  selected: string;
  onSelect: (league: string) => void;
}

export function LeagueFilter({ selected, onSelect }: LeagueFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2 overflow-x-auto scrollbar-thin pb-1">
      <button
        onClick={() => onSelect("all")}
        className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
          selected === "all"
            ? "gradient-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        }`}
      >
        All
      </button>
      {allLeagues.map(league => (
        <button
          key={league}
          onClick={() => onSelect(league)}
          className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
            selected === league
              ? "gradient-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {leagueFlags[league]} <span className="hidden sm:inline">{league}</span>
        </button>
      ))}
    </div>
  );
}
