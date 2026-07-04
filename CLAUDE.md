# arr-mcp

MCP server for managing Sonarr, Radarr, qBittorrent, and Seerr via Claude.ai on mobile.

## Project layout

```
src/
  index.ts              Entry point — validates env, starts HTTP server
  server.ts             MCP server, tool registry (ALL_TOOLS), request handlers
  http-transport.ts     Express server, OAuth 2.1 (mcpAuthRouter), /mcp sessions
  oauth-provider.ts     OAuthServerProvider — in-memory client/code stores, login form
  services/
    sonarr.ts           sonarrGet / sonarrPost / sonarrDelete
    radarr.ts           radarrGet / radarrPost / radarrDelete
    qbittorrent.ts      qbtGet / qbtPost
    seerr.ts            serrGet / serrPost
  tools/
    types.ts            ToolModule interface
    sonarr.ts           18 Sonarr tools
    radarr.ts           16 Radarr tools
    qbittorrent.ts      4 qBittorrent tools
    seerr.ts            12 Seerr tools
```

## Adding a new tool

1. Add an entry to the relevant `src/tools/*.ts` array following the `ToolModule` interface in `src/tools/types.ts`.
2. No registration needed — `ALL_TOOLS` in `src/server.ts` spreads all tool arrays automatically.
3. Run `npm run typecheck` to verify, then rebuild and redeploy.

## Build & dev

```bash
npm install          # install deps
npm run typecheck    # TypeScript check (no emit)
npm run build        # compile to dist/
npm run dev          # run with tsx (requires .env file)
npm run lint         # eslint --fix
```

## Deployment

Source lives here (`~/Projects/arr-mcp`). Deployment is in `~/Services/arr/docker-compose.yml`.

```bash
cd ~/Services/arr
docker compose build arr-mcp
docker compose up -d arr-mcp
docker exec arr-mcp wget -qO- http://localhost:3000/health
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MCP_AUTH_TOKEN` | — | Required. Bearer token for MCP auth (from `~/Services/arr/.env`) |
| `ISSUER_URL` | `http://localhost:3000` | OAuth issuer URL — must be HTTPS in production |
| `SONARR_URL` | `http://sonarr:8989` | Sonarr base URL |
| `SONARR_API_KEY` | — | Sonarr API key |
| `RADARR_URL` | `http://radarr:7878` | Radarr base URL |
| `RADARR_API_KEY` | — | Radarr API key |
| `QBT_URL` | `http://gluetun:9081` | qBittorrent WebUI URL (via gluetun network namespace) |
| `SEERR_URL` | `http://seerr:5055` | Seerr base URL |
| `SEERR_API_KEY` | — | Seerr API key |
| `MCP_PORT` | `3000` | HTTP port |

## Network

All services communicate on `arr-net` (172.28.0.0/16). qBittorrent shares gluetun's network namespace — always reach it via `http://gluetun:9081`, never `http://qbittorrent:9081`.

## OAuth flow

Claude.ai authenticates via OAuth 2.1 authorization code + PKCE:
1. Claude.ai registers at `POST /register`
2. Browser redirects to `GET /authorize` — login form appears
3. User enters `MCP_AUTH_TOKEN` and submits to `POST /oauth/submit`
4. Server redirects back with auth code → Claude.ai exchanges for token
5. Token is `MCP_AUTH_TOKEN` — used as Bearer on all `/mcp` calls

The in-memory client/code stores reset on container restart. Claude.ai re-authenticates automatically using its stored token; re-entry of the token is only needed if `MCP_AUTH_TOKEN` changes.
