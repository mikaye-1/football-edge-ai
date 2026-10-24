"""League configuration.

The application is never hard-coded around a single league: each entry maps a
stable slug to the football source's tournament id. Season ids are resolved at
sync time from the live seasons list, so a new campaign needs no code change.
"""

LEAGUES: dict[str, dict] = {
    "premier-league": {"name": "Premier League", "tournament_id": 17, "country": "England"},
    "championship": {"name": "Championship", "tournament_id": 18, "country": "England"},
    "la-liga": {"name": "La Liga", "tournament_id": 8, "country": "Spain"},
    "serie-a": {"name": "Serie A", "tournament_id": 23, "country": "Italy"},
    "ligue-1": {"name": "Ligue 1", "tournament_id": 34, "country": "France"},
    "bundesliga": {"name": "Bundesliga", "tournament_id": 35, "country": "Germany"},
    "eredivisie": {"name": "Eredivisie", "tournament_id": 37, "country": "Netherlands"},
    "liga-portugal": {"name": "Liga Portugal", "tournament_id": 238, "country": "Portugal"},
    "uefa-champions-league": {"name": "UEFA Champions League", "tournament_id": 7, "country": "Europe"},
    "saudi-pro-league": {"name": "Saudi Pro League", "tournament_id": 638, "country": "Saudi Arabia"},
    "mls": {"name": "Major League Soccer", "tournament_id": 242, "country": "USA"},
    "super-lig": {"name": "Süper Lig", "tournament_id": 52, "country": "Turkey"},
}


class LeagueNotConfiguredError(Exception):
    pass


def get_league(slug: str) -> dict:
    league = LEAGUES.get(slug)
    if not league:
        raise LeagueNotConfiguredError(
            f"Unknown league '{slug}'. Supported: {', '.join(sorted(LEAGUES))}"
        )
    return league


def list_leagues() -> list[dict]:
    return [
        {"slug": slug, **info}
        for slug, info in sorted(LEAGUES.items(), key=lambda kv: kv[1]["name"])
    ]
