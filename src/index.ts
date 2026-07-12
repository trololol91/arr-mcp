import {startHttpServer} from './http-transport.js';
import {ALL_TOOLS} from './server.js';

const required = ['MCP_AUTH_TOKEN', 'SONARR_API_KEY', 'RADARR_API_KEY', 'TMDB_API_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`[arr-mcp] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
}

console.error(`[arr-mcp] Starting with ${ALL_TOOLS.length} tools`);

void startHttpServer().catch((err: unknown) => {
    console.error('[arr-mcp] Failed to start HTTP server:', err);
    process.exit(1);
});
