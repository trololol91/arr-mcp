import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {registerAppTool, registerAppResource, RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';

import {sonarrGet} from './services/sonarr.js';
import {radarrGet} from './services/radarr.js';
import {serrGet} from './services/seerr.js';
import {sonarrTools} from './tools/sonarr.js';
import {radarrTools} from './tools/radarr.js';
import {qbtTools} from './tools/qbittorrent.js';
import {serrTools, trimDiscoverPage} from './tools/seerr.js';
import {anilistTools} from './tools/anilist.js';
import type {ToolInputSchema, ToolModule} from './tools/types.js';

export const ALL_TOOLS: ToolModule[] = [
    ...sonarrTools,
    ...radarrTools,
    ...qbtTools,
    ...serrTools,
    ...anilistTools,
];

export const TOOL_COUNT = ALL_TOOLS.length + 6; // +2 release browsers, +4 seerr discover

function toZodShape(schema: ToolInputSchema): Record<string, z.ZodTypeAny> {
    const required = new Set(schema.required ?? []);
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, rawProp] of Object.entries(schema.properties)) {
        const prop = rawProp as Record<string, unknown>;
        let zodType: z.ZodTypeAny;

        switch (prop['type']) {
            case 'string':  zodType = z.string(); break;
            case 'number':  zodType = z.number(); break;
            case 'boolean': zodType = z.boolean(); break;
            default:        zodType = z.unknown(); break;
        }

        if (typeof prop['description'] === 'string') {
            zodType = zodType.describe(prop['description']);
        }

        shape[key] = required.has(key) ? zodType : zodType.optional();
    }

    return shape;
}

export const createMcpServer = (): McpServer => {
    const server = new McpServer({name: 'arr-mcp', version: '0.1.0'});

    for (const t of ALL_TOOLS) {
        server.registerTool(t.name, {
            description: t.description,
            inputSchema: toZodShape(t.inputSchema),
        }, async (args) => {
            try {
                const result = await t.handle(args as Record<string, unknown>);
                return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return {content: [{type: 'text', text: message}], isError: true};
            }
        });
    }

    const uiDir = join(dirname(fileURLToPath(import.meta.url)), '../dist/ui');
    const sonarrHtml = readFileSync(join(uiDir, 'sonarr-releases', 'index.html'), 'utf-8');
    const radarrHtml = readFileSync(join(uiDir, 'radarr-releases', 'index.html'), 'utf-8');
    const serrDiscoverHtml = readFileSync(join(uiDir, 'seerr-discover', 'index.html'), 'utf-8');

    registerAppTool(server, 'sonarr_interactive_search_ui', {
        title: 'Sonarr Release Browser',
        description: 'Show an interactive release table for an episode — click Grab to download.',
        inputSchema: {episodeId: z.number().describe('Episode id from sonarr_get_episode')},
        _meta: {ui: {resourceUri: 'ui://arr-mcp/sonarr-releases.html'}},
    }, async ({episodeId}) => {
        const raw = await sonarrGet(`/release?episodeId=${episodeId}`) as Record<string, unknown>[];
        const releases = raw.slice(0, 50).map((r) => ({
            t: r['title'],
            q: (r['quality'] as Record<string, Record<string, string>> | undefined)?.quality?.name ?? '?',
            s: r['size'],
            se: r['seeders'],
            rg: r['releaseGroup'],
            idx: r['indexer'],
            g: r['guid'],
            iid: r['indexerId'],
            p: r['protocol'],
            rej: r['rejected'] ? r['rejections'] : undefined,
        }));
        return {content: [{type: 'text', text: JSON.stringify(releases)}]};
    });

    registerAppResource(server, 'Sonarr Release Browser', 'ui://arr-mcp/sonarr-releases.html',
        {description: 'Interactive release table for Sonarr episodes'},
        async () => ({
            contents: [{uri: 'ui://arr-mcp/sonarr-releases.html', mimeType: RESOURCE_MIME_TYPE, text: sonarrHtml}],
        })
    );

    registerAppTool(server, 'radarr_interactive_search_ui', {
        title: 'Radarr Release Browser',
        description: 'Show an interactive release table for a movie — click Grab to download.',
        inputSchema: {movieId: z.number().describe('Movie id from radarr_find_movie')},
        _meta: {ui: {resourceUri: 'ui://arr-mcp/radarr-releases.html'}},
    }, async ({movieId}) => {
        const raw = await radarrGet(`/release?movieId=${movieId}`) as Record<string, unknown>[];
        const releases = raw.slice(0, 50).map((r) => ({
            t: r['title'],
            q: (r['quality'] as Record<string, Record<string, string>> | undefined)?.quality?.name ?? '?',
            s: r['size'],
            se: r['seeders'],
            rg: r['releaseGroup'],
            idx: r['indexer'],
            g: r['guid'],
            iid: r['indexerId'],
            p: r['protocol'],
            rej: r['rejected'] ? r['rejections'] : undefined,
        }));
        return {content: [{type: 'text', text: JSON.stringify(releases)}]};
    });

    registerAppResource(server, 'Radarr Release Browser', 'ui://arr-mcp/radarr-releases.html',
        {description: 'Interactive release table for Radarr movies'},
        async () => ({
            contents: [{uri: 'ui://arr-mcp/radarr-releases.html', mimeType: RESOURCE_MIME_TYPE, text: radarrHtml}],
        })
    );

    const discoverPaths: Record<string, string> = {
        trending: '/discover/trending',
        popular_movies: '/discover/movies',
        popular_tv: '/discover/tv',
        upcoming: '/discover/movies/upcoming',
    };
    const discoverTitles: Record<string, string> = {
        trending: 'Trending',
        popular_movies: 'Popular Movies',
        popular_tv: 'Popular TV',
        upcoming: 'Upcoming Movies',
    };

    for (const [type, path] of Object.entries(discoverPaths)) {
        registerAppTool(server, `seerr_${type}_ui`, {
            title: `Seerr ${discoverTitles[type]}`,
            description: `Browse ${discoverTitles[type]} in Seerr — click Request to add to your library.`,
            inputSchema: {page: z.number().optional().describe('Page number (default 1)')},
            _meta: {ui: {resourceUri: 'ui://arr-mcp/seerr-discover.html'}},
        }, async ({page}) => {
            const raw = await serrGet(`${path}?page=${page ?? 1}`) as {
                page: number; totalPages: number; results: Record<string, unknown>[];
            };
            return {content: [{type: 'text', text: JSON.stringify(trimDiscoverPage(raw, type))}]};
        });
    }

    registerAppResource(server, 'Seerr Discovery', 'ui://arr-mcp/seerr-discover.html',
        {description: 'Browse trending, popular, and upcoming content in Seerr'},
        async () => ({
            contents: [{
                uri: 'ui://arr-mcp/seerr-discover.html',
                mimeType: RESOURCE_MIME_TYPE,
                text: serrDiscoverHtml,
                _meta: {ui: {csp: {resourceDomains: ['https://image.tmdb.org']}}},
            }],
        })
    );

    return server;
};

export const validateAuthToken = (authHeader: string | undefined): boolean => {
    const expected = process.env.MCP_AUTH_TOKEN;
    if (!expected) throw new Error('MCP_AUTH_TOKEN is not set');
    if (!authHeader?.startsWith('Bearer ')) return false;
    const token = authHeader.slice('Bearer '.length).trim();
    return token === expected;
};
