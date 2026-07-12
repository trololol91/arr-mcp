# TMDB Discover Tools — Implementation Spec for arr-mcp

## Motivation

Seerr's wrapped endpoints (`seerr_popular_tv`, `seerr_trending`, `seerr_discover_page`) don't expose TMDB's real filtering
capabilities — no year, genre, rating, or sort control. TMDB's own `/discover/movie` and `/discover/tv` endpoints support
all of this natively. This spec adds two new read-only tools that call TMDB directly, while keeping Seerr/Sonarr/Radarr
as the request/availability layer (unchanged).

**Design principle:** TMDB discover tools return raw metadata only. Availability checking and requesting continue to go
through the existing `seerr_*`, `sonarr_*`, and `radarr_*` tools. Do not duplicate request logic here.

---

## Prerequisites

- A TMDB API key (v3 auth). Free, register at https://www.themoviedb.org/settings/api
- Store as an environment variable: `TMDB_API_KEY`
- Base URL: `https://api.themoviedb.org/3`
- Auth: append `?api_key=${TMDB_API_KEY}` or use `Authorization: Bearer <v4_token>` header (v4 token preferred if
  already using one elsewhere in the stack)

---

## Tool 1: `tmdb_discover_movie`

Wraps `GET /discover/movie`.

### Parameters

| Param | Type | Notes |
|---|---|---|
| `year` | number, optional | Maps to `primary_release_year` |
| `year_gte` / `year_lte` | number, optional | Maps to `primary_release_date.gte` / `.lte` (format as `YYYY-01-01` / `YYYY-12-31`) |
| `genres` | string[], optional | Genre names (e.g. `["Animation", "Action"]`) — resolve to TMDB genre IDs via `/genre/movie/list` (cache this lookup, it rarely changes) |
| `min_rating` | number, optional | Maps to `vote_average.gte` |
| `min_votes` | number, optional | Maps to `vote_count.gte` — **strongly recommend defaulting this to 50** if unset, since low-vote-count items skew misleadingly high/low |
| `sort_by` | enum, optional | One of: `popularity.desc`, `popularity.asc`, `vote_average.desc`, `vote_average.asc`, `primary_release_date.desc`, `primary_release_date.asc`, `revenue.desc`. Default: `popularity.desc` |
| `original_language` | string, optional | ISO 639-1 code (e.g. `ja`, `ko`, `en`) |
| `page` | number, optional | Default 1 |

### Output shape

Return a trimmed array, not the full TMDB payload:

```json
{
  "page": 1,
  "total_pages": 42,
  "results": [
    {
      "tmdbId": 1280738,
      "title": "The Furious",
      "release_date": "2026-06-20",
      "vote_average": 7.8,
      "vote_count": 412,
      "genres": ["Action"],
      "original_language": "zh",
      "overview": "..."
    }
  ]
}
```

---

## Tool 2: `tmdb_discover_tv`

Wraps `GET /discover/tv`. Same shape as above, with these differences:

| Param | Type | Notes |
|---|---|---|
| `year` | number, optional | Maps to `first_air_date_year` |
| `year_gte` / `year_lte` | number, optional | Maps to `first_air_date.gte` / `.lte` |
| `status` | enum, optional | Not a native TMDB discover param — TMDB doesn't filter airing status directly. Fetch results, then optionally filter client-side using `/tv/{id}` details if the user asks for "currently airing" specifically. Don't over-engineer this for v1; skip unless requested. |

Genre IDs for TV come from `/genre/tv/list` (separate from movie genre IDs — don't reuse the movie genre cache).

---

## Cross-referencing availability (used by Claude at call time, not baked into the tool)

These tools are metadata-only. To show what's already available, the calling layer (Claude, in conversation) should:

1. Call `tmdb_discover_movie` / `tmdb_discover_tv` to get candidate `tmdbId`s
2. For each result the person cares about, call `seerr_search` (title-based) or match by `tmdbId` if Seerr exposes a
   direct lookup-by-id endpoint — check `mediaInfo.status` to know if it's already requested/available
3. Present combined result: TMDB metadata + Seerr availability status

Do not implement this cross-referencing inside the TMDB tools themselves — keep them single-purpose and fast.

---

## Error handling

- TMDB rate limits: ~50 requests/second, generous — unlikely to be hit in normal use, but wrap in try/catch and surface
  a clean error rather than letting a raw TMDB error object propagate to the model.
- Missing `TMDB_API_KEY` env var: fail fast at server startup with a clear log message, not on first tool call.
- Empty results: return `{ "page": 1, "total_pages": 0, "results": [] }` rather than throwing.

---

## File/module suggestions (matches typical arr-mcp Node structure)

```
src/
  tools/
    tmdb-discover-movie.ts
    tmdb-discover-tv.ts
  lib/
    tmdb-client.ts       // shared fetch wrapper + genre ID cache
```

`tmdb-client.ts` should own:
- Base fetch wrapper with API key injection
- Genre name→ID resolution + in-memory cache (refresh every 24h, genre lists almost never change)
- Shared response trimming logic (both tools use the same trimmed shape)

---

## Out of scope for this pass

- Requesting/adding media (stays in Seerr/Sonarr/Radarr tools)
- Person/company discovery endpoints
- Watch-provider filtering (TMDB supports `with_watch_providers`, could be a good v2 addition since it maps well to
  "is this available on a service I subscribe to")
