import {tmdbGet, resolveGenreIds, resolveGenreNames} from '../services/tmdb.js';
import {serrGet} from '../services/seerr.js';
import type {ToolModule} from './types.js';

// --- Seerr discover UI helpers ---

const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

type TmdbDiscoverRaw = {page: number; total_pages: number; results: Record<string, unknown>[]};

export const buildStatusMap = async (): Promise<Map<number, number>> => {
    try {
        const media = await serrGet('/media?take=500&skip=0') as {results?: Array<{tmdbId?: number; status?: number}>};
        return new Map(
            (media.results ?? [])
                .filter((m) => m.tmdbId != null)
                .map((m) => [m.tmdbId!, m.status ?? 1])
        );
    } catch {
        return new Map();
    }
};

const TMDB_DISCOVER_CONFIGS: Record<string, {url: string; inferMt: (r: Record<string, unknown>) => 'm' | 't'}> = {
    trending:       {url: '/trending/all/week', inferMt: (r) => r['media_type'] === 'tv' ? 't' : 'm'},
    popular_movies: {url: '/movie/popular',     inferMt: () => 'm'},
    popular_tv:     {url: '/tv/popular',        inferMt: () => 't'},
    upcoming:       {url: '/movie/upcoming',    inferMt: () => 'm'},
};

const trimTmdbDiscoverPage = (
    raw: TmdbDiscoverRaw,
    type: string,
    inferMt: (r: Record<string, unknown>) => 'm' | 't',
    statusMap: Map<number, number>
) => ({
    type,
    page: raw.page,
    totalPages: raw.total_pages,
    items: raw.results.slice(0, 10).map((r) => ({
        mid: r['id'],
        mt: inferMt(r),
        ti: r['title'] ?? r['name'],
        yr: new Date(String(r['release_date'] ?? r['first_air_date'] ?? '1970')).getFullYear(),
        po: r['poster_path'] ? `${TMDB_IMG}${r['poster_path'] as string}` : null,
        ov: r['overview'] ? String(r['overview']).slice(0, 150) : null,
        st: statusMap.get(r['id'] as number) ?? null,
    })),
});

export const fetchTmdbDiscoverPage = async (type: string, page: number) => {
    const cfg = TMDB_DISCOVER_CONFIGS[type];
    if (!cfg) throw new Error(`Unknown discover type: ${type}`);
    const [raw, statusMap] = await Promise.all([
        tmdbGet(cfg.url, {page: String(page)}) as Promise<TmdbDiscoverRaw>,
        buildStatusMap(),
    ]);
    return trimTmdbDiscoverPage(raw, type, cfg.inferMt, statusMap);
};

type TmdbRawResult = Record<string, unknown>;
type TmdbPage = {page: number; total_pages: number; results: TmdbRawResult[]};

const buildMovieParams = async (args: Record<string, unknown>): Promise<Record<string, string>> => {
    const p: Record<string, string> = {
        sort_by: (args['sort_by'] as string | undefined) ?? 'popularity.desc',
        'vote_count.gte': String((args['min_votes'] as number | undefined) ?? 50),
        page: String((args['page'] as number | undefined) ?? 1),
    };
    if (args['year']) p['primary_release_year'] = String(args['year']);
    if (args['year_gte']) p['primary_release_date.gte'] = `${args['year_gte']}-01-01`;
    if (args['year_lte']) p['primary_release_date.lte'] = `${args['year_lte']}-12-31`;
    if (args['min_rating']) p['vote_average.gte'] = String(args['min_rating']);
    if (args['original_language']) p['with_original_language'] = args['original_language'] as string;
    if (Array.isArray(args['genres']) && (args['genres'] as string[]).length > 0) {
        const ids = await resolveGenreIds('movie', args['genres'] as string[]);
        if (ids.length) p['with_genres'] = ids.join(',');
    }
    if (Array.isArray(args['exclude_genres']) && (args['exclude_genres'] as string[]).length > 0) {
        const ids = await resolveGenreIds('movie', args['exclude_genres'] as string[]);
        if (ids.length) p['without_genres'] = ids.join(',');
    }
    if (Array.isArray(args['countries']) && (args['countries'] as string[]).length > 0)
        p['with_origin_country'] = (args['countries'] as string[]).join(',');
    if (Array.isArray(args['exclude_countries']) && (args['exclude_countries'] as string[]).length > 0)
        p['without_origin_country'] = (args['exclude_countries'] as string[]).join(',');
    return p;
};

const buildTvParams = async (args: Record<string, unknown>): Promise<Record<string, string>> => {
    const p: Record<string, string> = {
        sort_by: (args['sort_by'] as string | undefined) ?? 'popularity.desc',
        'vote_count.gte': String((args['min_votes'] as number | undefined) ?? 50),
        page: String((args['page'] as number | undefined) ?? 1),
    };
    if (args['year']) p['first_air_date_year'] = String(args['year']);
    if (args['year_gte']) p['first_air_date.gte'] = `${args['year_gte']}-01-01`;
    if (args['year_lte']) p['first_air_date.lte'] = `${args['year_lte']}-12-31`;
    if (args['min_rating']) p['vote_average.gte'] = String(args['min_rating']);
    if (args['original_language']) p['with_original_language'] = args['original_language'] as string;
    if (Array.isArray(args['genres']) && (args['genres'] as string[]).length > 0) {
        const ids = await resolveGenreIds('tv', args['genres'] as string[]);
        if (ids.length) p['with_genres'] = ids.join(',');
    }
    if (Array.isArray(args['exclude_genres']) && (args['exclude_genres'] as string[]).length > 0) {
        const ids = await resolveGenreIds('tv', args['exclude_genres'] as string[]);
        if (ids.length) p['without_genres'] = ids.join(',');
    }
    if (Array.isArray(args['countries']) && (args['countries'] as string[]).length > 0)
        p['with_origin_country'] = (args['countries'] as string[]).join(',');
    if (Array.isArray(args['exclude_countries']) && (args['exclude_countries'] as string[]).length > 0)
        p['without_origin_country'] = (args['exclude_countries'] as string[]).join(',');
    return p;
};

const trimMovieResult = async (r: TmdbRawResult): Promise<Record<string, unknown>> => ({
    tmdbId: r['id'],
    title: r['title'] ?? '',
    release_date: (r['release_date'] as string | undefined) ?? null,
    vote_average: r['vote_average'],
    vote_count: r['vote_count'],
    genres: await resolveGenreNames('movie', (r['genre_ids'] as number[] | undefined) ?? []),
    original_language: r['original_language'],
    overview: r['overview'] ?? '',
});

const trimTvResult = async (r: TmdbRawResult): Promise<Record<string, unknown>> => ({
    tmdbId: r['id'],
    title: r['name'] ?? '',
    first_air_date: (r['first_air_date'] as string | undefined) ?? null,
    vote_average: r['vote_average'],
    vote_count: r['vote_count'],
    genres: await resolveGenreNames('tv', (r['genre_ids'] as number[] | undefined) ?? []),
    original_language: r['original_language'],
    overview: r['overview'] ?? '',
});

export const tmdbTools: ToolModule[] = [
    {
        name: 'tmdb_discover_page',
        description: 'Fetch a page of discover results for the Seerr discovery UI — used for Load More pagination. type: trending, popular_movies, popular_tv, upcoming.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'trending, popular_movies, popular_tv, or upcoming'},
                page: {type: 'number', description: 'Page number'},
            },
            required: ['type', 'page'],
        },
        handle: async (args) => fetchTmdbDiscoverPage(args['type'] as string, args['page'] as number),
    },
    {
        name: 'tmdb_discover_movie',
        description: 'Discover movies from TMDB with rich filtering — year, genre, rating, language, sort. Returns metadata only; use seerr_* tools to check availability or submit a request.',
        inputSchema: {
            type: 'object',
            properties: {
                year: {type: 'number', description: 'Exact primary release year'},
                year_gte: {type: 'number', description: 'Release year ≥ this value'},
                year_lte: {type: 'number', description: 'Release year ≤ this value'},
                genres: {type: 'array', items: {type: 'string'}, description: 'Genre names to include, e.g. ["Action", "Animation"]'},
                exclude_genres: {type: 'array', items: {type: 'string'}, description: 'Genre names to exclude, e.g. ["Animation"] to filter out anime/cartoons'},
                countries: {type: 'array', items: {type: 'string'}, description: 'ISO 3166-1 country codes to include, e.g. ["US", "GB"]'},
                exclude_countries: {type: 'array', items: {type: 'string'}, description: 'ISO 3166-1 country codes to exclude, e.g. ["JP", "KR"]'},
                min_rating: {type: 'number', description: 'Minimum vote average (0–10)'},
                min_votes: {type: 'number', description: 'Minimum vote count to filter low-sample outliers (default 50)'},
                sort_by: {type: 'string', description: 'popularity.desc (default), popularity.asc, vote_average.desc, vote_average.asc, primary_release_date.desc, primary_release_date.asc, revenue.desc'},
                original_language: {type: 'string', description: 'ISO 639-1 code, e.g. ja, ko, en'},
                page: {type: 'number', description: 'Page number (default 1)'},
            }
        },
        handle: async (args) => {
            const params = await buildMovieParams(args);
            const raw = await tmdbGet('/discover/movie', params) as TmdbPage;
            if (!raw.results?.length) return {page: 1, total_pages: 0, results: []};
            const results = await Promise.all(raw.results.map(trimMovieResult));
            return {page: raw.page, total_pages: raw.total_pages, results};
        }
    },
    {
        name: 'tmdb_discover_tv',
        description: 'Discover TV shows from TMDB with rich filtering — year, genre, rating, language, sort. Returns metadata only; use seerr_* tools to check availability or submit a request.',
        inputSchema: {
            type: 'object',
            properties: {
                year: {type: 'number', description: 'Exact first air year'},
                year_gte: {type: 'number', description: 'First air year ≥ this value'},
                year_lte: {type: 'number', description: 'First air year ≤ this value'},
                genres: {type: 'array', items: {type: 'string'}, description: 'Genre names to include, e.g. ["Drama", "Crime"]'},
                exclude_genres: {type: 'array', items: {type: 'string'}, description: 'Genre names to exclude, e.g. ["Animation"] to filter out anime'},
                countries: {type: 'array', items: {type: 'string'}, description: 'ISO 3166-1 country codes to include, e.g. ["US", "GB"]'},
                exclude_countries: {type: 'array', items: {type: 'string'}, description: 'ISO 3166-1 country codes to exclude, e.g. ["JP", "KR"]'},
                min_rating: {type: 'number', description: 'Minimum vote average (0–10)'},
                min_votes: {type: 'number', description: 'Minimum vote count to filter low-sample outliers (default 50)'},
                sort_by: {type: 'string', description: 'popularity.desc (default), popularity.asc, vote_average.desc, vote_average.asc, first_air_date.desc, first_air_date.asc'},
                original_language: {type: 'string', description: 'ISO 639-1 code, e.g. ja, ko, en'},
                page: {type: 'number', description: 'Page number (default 1)'},
            }
        },
        handle: async (args) => {
            const params = await buildTvParams(args);
            const raw = await tmdbGet('/discover/tv', params) as TmdbPage;
            if (!raw.results?.length) return {page: 1, total_pages: 0, results: []};
            const results = await Promise.all(raw.results.map(trimTvResult));
            return {page: raw.page, total_pages: raw.total_pages, results};
        }
    },
];
