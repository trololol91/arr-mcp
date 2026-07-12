import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {registerAppTool, registerAppResource, RESOURCE_MIME_TYPE} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';

import {sonarrGet} from './services/sonarr.js';
import {radarrGet} from './services/radarr.js';
import {sonarrTools} from './tools/sonarr.js';
import {radarrTools} from './tools/radarr.js';
import {qbtTools} from './tools/qbittorrent.js';
import {serrTools} from './tools/seerr.js';
import {anilistTools, fetchAnilistUI, trimAnilistItem} from './tools/anilist.js';
import {tmdbTools, fetchTmdbDiscoverPage} from './tools/tmdb.js';
import type {ToolInputSchema, ToolModule} from './tools/types.js';

export const ALL_TOOLS: ToolModule[] = [
    ...sonarrTools,
    ...radarrTools,
    ...qbtTools,
    ...serrTools,
    ...anilistTools,
    ...tmdbTools,
];

export const TOOL_COUNT = ALL_TOOLS.length + 10; // +2 release browsers, +4 seerr discover, +4 anilist

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
            case 'array': {
                const itemType = (prop['items'] as {type?: string} | undefined)?.type === 'number' ? z.number() : z.string();
                zodType = z.array(itemType);
                break;
            }
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
    const tmdbDiscoverHtml = readFileSync(join(uiDir, 'tmdb-discover', 'index.html'), 'utf-8');
    const anilistHtml = readFileSync(join(uiDir, 'anilist', 'index.html'), 'utf-8');

    const trimAnilist = trimAnilistItem;

    registerAppTool(server, 'sonarr_interactive_search_ui', {
        title: 'Sonarr Release Browser',
        description: 'Show an interactive release table for an episode — click Grab to download.',
        inputSchema: {episodeId: z.number().describe('Episode id from sonarr_get_episode')},
        _meta: {ui: {resourceUri: 'ui://arr-mcp/sonarr-releases.html'}},
    }, async ({episodeId}) => {
        const raw = await sonarrGet(`/release?episodeId=${episodeId}`) as Record<string, unknown>[];
        const releases = raw.filter((r) => !r['rejected']).slice(0, 50).map((r) => ({
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
        const releases = raw.filter((r) => !r['rejected']).slice(0, 50).map((r) => ({
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

    const discoverTitles: Record<string, string> = {
        trending: 'Trending',
        popular_movies: 'Popular Movies',
        popular_tv: 'Popular TV',
        upcoming: 'Upcoming Movies',
    };

    for (const [type, title] of Object.entries(discoverTitles)) {
        registerAppTool(server, `tmdb_${type}_ui`, {
            title: `Seerr ${title}`,
            description: `Browse ${title} — click Request to add to your library.`,
            inputSchema: {page: z.number().optional().describe('Page number (default 1)')},
            _meta: {ui: {resourceUri: 'ui://arr-mcp/tmdb-discover.html'}},
        }, async ({page}) => {
            const data = await fetchTmdbDiscoverPage(type, page ?? 1);
            return {content: [{type: 'text', text: JSON.stringify(data)}]};
        });
    }

    const anilistTypes: Record<string, {title: string; desc: string; schema: Record<string, z.ZodTypeAny>}> = {
        trending:  {title: 'AniList Trending',  desc: 'Browse trending anime',          schema: {page: z.number().optional()}},
        popular:   {title: 'AniList Popular',   desc: 'Browse all-time popular anime',  schema: {page: z.number().optional()}},
        seasonal:  {title: 'AniList Seasonal',  desc: 'Browse current season anime',    schema: {page: z.number().optional(), season: z.string().optional().describe('WINTER/SPRING/SUMMER/FALL'), year: z.number().optional()}},
        search:    {title: 'AniList Search',    desc: 'Search anime on AniList',        schema: {query: z.string().describe('Anime title')}},
    };

    for (const [type, cfg] of Object.entries(anilistTypes)) {
        registerAppTool(server, `anilist_${type}_ui`, {
            title: cfg.title,
            description: `${cfg.desc} — click Request to add via Seerr.`,
            inputSchema: cfg.schema,
            _meta: {ui: {resourceUri: 'ui://arr-mcp/anilist.html'}},
        }, async (args) => {
            const {hasNextPage, media} = await fetchAnilistUI(type, {
                page: (args as {page?: number}).page ?? 1,
                query: (args as {query?: string}).query,
                season: (args as {season?: string}).season,
                year: (args as {year?: number}).year,
            });
            const payload = {type, page: (args as {page?: number}).page ?? 1, hasNextPage, items: media.map(trimAnilist)};
            return {content: [{type: 'text', text: JSON.stringify(payload)}]};
        });
    }

    registerAppResource(server, 'AniList Browser', 'ui://arr-mcp/anilist.html',
        {description: 'Browse trending, popular, and seasonal anime from AniList'},
        async () => ({
            contents: [{
                uri: 'ui://arr-mcp/anilist.html',
                mimeType: RESOURCE_MIME_TYPE,
                text: anilistHtml,
                _meta: {ui: {csp: {resourceDomains: ['https://s4.anilist.co']}}},
            }],
        })
    );

    registerAppResource(server, 'TMDB Discovery', 'ui://arr-mcp/tmdb-discover.html',
        {description: 'Browse trending, popular, and upcoming content from TMDB'},
        async () => ({
            contents: [{
                uri: 'ui://arr-mcp/tmdb-discover.html',
                mimeType: RESOURCE_MIME_TYPE,
                text: tmdbDiscoverHtml,
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
