

## Add API-Football as a Second Data Source

### Why It Works Well
- **No conflict**: API-Football provides match stats (corners, cards, lineups, xG), while The Odds API provides odds/markets. They serve different purposes.
- **Fills gaps**: You currently can't settle Corners O/U and Cards O/U because you lack actual corner/card counts. API-Football solves this.
- **Independent pipelines**: Each API runs in its own edge function, writing to the same database tables.

### What Would Change

**1. New Edge Function: `fetch-stats`**
- Calls API-Football's `/fixtures` and `/fixtures/statistics` endpoints
- Fetches actual match stats (corners, cards, possession, shots) for finished/live matches
- Writes to a new `match_stats` table
- Runs independently from `fetch-odds` — no interference

**2. New Database Table: `match_stats`**
- Columns: `match_id`, `home_corners`, `away_corners`, `home_cards`, `away_cards`, `home_possession`, `away_possession`, `home_shots`, `away_shots`, etc.
- Links to existing `matches` table via `match_id`

**3. Update `settle-predictions`**
- For Corners O/U and Cards O/U markets, look up actual stats from `match_stats` instead of returning `null`
- Full settlement for all markets

**4. Enhanced Prediction Model (optional)**
- Use real xG, possession, and form data from API-Football to improve model accuracy beyond odds-derived probabilities

### Technical Details

- API-Football uses `x-rapidapi-key` header authentication (via RapidAPI or direct)
- Free tier: 100 requests/day — sufficient for ~50 matches' stats
- A new secret `API_FOOTBALL_KEY` would be stored securely
- Team name matching between APIs handled via fuzzy matching or a mapping table
- No changes to existing `fetch-odds` function — zero risk to current flow

### Steps
1. Add `API_FOOTBALL_KEY` secret
2. Create `match_stats` database table with RLS
3. Create `fetch-stats` edge function
4. Update `settle-predictions` to use real stats for Corners/Cards
5. Optionally enhance prediction model with real stats

### Risk Assessment
- **Zero crash risk**: completely separate edge function and table
- **Only risk**: team name mismatches between APIs (solved with mapping)

