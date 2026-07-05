# arr-mcp

A remote MCP server for managing your arr stack via Claude.ai on mobile. Ask Claude to fix bad downloads, block release groups, request new content, and check what's trending — all from your phone.

## Tools (56)

| Service | Count | Highlights |
|---|---|---|
| **Sonarr** | 20 | find series, episode history, delete file, blocklist, interactive search, **interactive search UI**, grab release, add series, queue management |
| **Radarr** | 18 | find movie, history, delete file, blocklist, interactive search, **interactive search UI**, grab release, add movie, queue management |
| **qBittorrent** | 4 | list torrents, delete torrent, add via magnet link, sync VPN port |
| **Seerr** | 12 | search, request movie/TV, approve/decline, trending, popular, upcoming, recommendations |

The interactive search UI tools (`sonarr_interactive_search_ui`, `radarr_interactive_search_ui`) render a release table directly in Claude.ai chat — click **Grab** to send a release to the download client without copy-pasting GUIDs.

## Example workflows

**Fix a bad download**
> "Rick and Morty S09E05 is playing the wrong episode"
> → finds series → gets episode → checks history → deletes file → blocklists release → searches for replacement

**Pick a specific release (interactive UI)**
> "Show me what's available for Severance S02E01"
> → interactive search UI → clickable release table renders in chat → click Grab → downloading

**Manage requests**
> "What requests are pending in Seerr?"
> → lists pending → "approve the first one" → approved

**Add new content**
> "Add Fallout to Sonarr and search for it"
> → find series → add with default quality profile → triggers search

**Fix stalled downloads after VPN reconnect**
> "Downloads are stalled"
> → sync VPN port → qBittorrent updated

## Setup

### Requirements
- Docker with the arr stack running on `arr-net`
- Cloudflare Tunnel exposing the service at an HTTPS URL
- Claude Pro/Max/Team plan for remote MCP connectors

### Deploy

```bash
# 1. Clone
git clone https://github.com/rolim91/arr-mcp ~/Projects/arr-mcp

# 2. Add to ~/Services/arr/docker-compose.yml (see CLAUDE.md for full config)

# 3. Generate auth token
openssl rand -hex 32

# 4. Add to ~/Services/arr/.env
echo "MCP_AUTH_TOKEN=<generated-token>" >> ~/Services/arr/.env

# 5. Build and start
cd ~/Services/arr
docker compose build arr-mcp
docker compose up -d arr-mcp
```

### Connect to Claude.ai

1. claude.ai → Settings → Integrations → Add custom connector
2. URL: `https://your-domain.com/mcp`
3. Complete the OAuth login with your `MCP_AUTH_TOKEN`
