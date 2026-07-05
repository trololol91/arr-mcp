# arr-mcp

A remote MCP server for managing your arr stack via Claude.ai on mobile. Ask Claude to fix bad downloads, block release groups, request new content, browse trending anime, and check what's popular — all from your phone.

## Tools (79)

| Service | Count | Highlights |
|---|---|---|
| **Sonarr** | 25 + 1 UI | find/add/remove/update series, episode history, delete file, blocklist, interactive search, **release browser UI**, grab release, queue management, tags, release profiles |
| **Radarr** | 22 + 1 UI | find/add/remove/update movie, history, delete file, blocklist, interactive search, **release browser UI**, grab release, queue management, tags, release profiles |
| **qBittorrent** | 4 | list torrents, delete torrent, add via magnet, sync VPN port |
| **Seerr** | 16 + 4 UI | search, request movie/TV, approve/decline, trending, popular, upcoming, recommendations, **discovery card UI** (respects language/country/title blocklist) |
| **AniList** | 5 + 4 UI | trending anime, popular, current season, search with recommendations, **anime browser UI** with cover art and one-click Seerr request |

### Interactive UI tools

These render directly in Claude.ai chat as card grids or tables:

| Tool | What it shows |
|---|---|
| `sonarr_interactive_search_ui` | Release table with Grab button — no GUID copy-paste needed |
| `radarr_interactive_search_ui` | Same for movies |
| `seerr_trending_ui` | Trending movies & TV with TMDB posters and Request button |
| `seerr_popular_movies_ui` | Popular movies |
| `seerr_popular_tv_ui` | Popular TV shows |
| `seerr_upcoming_ui` | Upcoming movies |
| `anilist_trending_ui` | Trending anime with cover art and one-click Seerr request |
| `anilist_popular_ui` | All-time popular anime |
| `anilist_seasonal_ui` | Current season anime |
| `anilist_search_ui` | Search anime by title |

## Example workflows

**Fix a bad download**
> "Rick and Morty S09E05 is playing the wrong episode"
> → finds series → gets episode → checks history → deletes file → blocklists release → searches for replacement

**Pick a specific release**
> "Show me available releases for Severance S02E01"
> → interactive search UI renders a clickable release table → click Grab → downloading

**Browse trending / request content**
> "Show me what's trending"
> → Seerr discovery UI loads with poster cards → click Request on anything you want

**Discover anime**
> "What anime is airing this season?"
> → AniList seasonal UI shows cover art, score, genres → click Request → adds via Seerr

**Anime recommendation workflow**
> "Find something similar to Attack on Titan"
> → `anilist_search` returns results + recommendations → "request the top recommendation"
> → searches Seerr by title, requests first TV match

**Manage requests**
> "What requests are pending in Seerr?"
> → lists pending → "approve the first one" → approved

**Fix stalled downloads after VPN reconnect**
> "Downloads are stalled"
> → sync VPN port → qBittorrent updated

## Setup

### Requirements

- Docker with the arr stack running (Sonarr, Radarr, qBittorrent, Seerr/Overseerr)
- A public HTTPS URL pointing to the server (e.g. via Cloudflare Tunnel)
- Claude Pro/Max/Team plan (required for remote MCP connectors)

### Quick start with docker-compose

Copy `docker-compose.example.yml`, fill in your values, and run:

```bash
cp docker-compose.example.yml docker-compose.yml

# Generate a strong auth token
openssl rand -hex 32

# Edit docker-compose.yml — set ISSUER_URL, MCP_AUTH_TOKEN, and all API keys

docker compose up -d
```

Or pull from GHCR (published on version tags):

```bash
docker pull ghcr.io/trololol91/arr-mcp:latest
```

### Build from source

```bash
git clone https://github.com/trololol91/arr-mcp
cd arr-mcp
npm install
npm run build
docker build -t arr-mcp .
```

### Connect to Claude.ai

1. claude.ai → Settings → Integrations → Add custom connector
2. URL: `https://your-domain.com/mcp`
3. Complete the OAuth login with your `MCP_AUTH_TOKEN`

Once connected, Claude will list all 79 tools automatically. No configuration beyond env vars is needed.

## Configuration

See `docker-compose.example.yml` for a full annotated example. Required env vars:

| Variable | Description |
|---|---|
| `ISSUER_URL` | Public HTTPS URL Claude.ai uses to reach this server |
| `MCP_AUTH_TOKEN` | Secret token — entered once during OAuth login |
| `SONARR_API_KEY` | From Sonarr → Settings → General |
| `RADARR_API_KEY` | From Radarr → Settings → General |
| `SEERR_API_KEY` | From Seerr → Settings → General |
| `QBT_URL` | qBittorrent WebUI URL (default: `http://qbittorrent:8080`) |

## CI / CD

GitHub Actions runs on every push to `main`: TypeScript typecheck + full build.

Pushing a version tag (`git tag v1.0.0 && git push --tags`) triggers a Docker build and publishes to GHCR as `ghcr.io/trololol91/arr-mcp:1.0.0`, `:1.0`, and `:1`.
