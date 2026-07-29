import {tmdbGet, resolveGenreIds, resolveGenreNames, resolveWatchProviderIds} from '../services/tmdb.js';
import {serrGet} from '../services/seerr.js';
import type {ToolModule} from './types.js';

// --- TMDB discover UI helpers ---

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

export type DiscoverFilters = {
    genres?: string[];
    exclude_genres?: string[];
    genre_match?: 'all' | 'any';
    countries?: string[];
    exclude_countries?: string[];
    min_rating?: number;
    max_rating?: number;
    min_votes?: number;
    original_language?: string;
    sort_by?: string;
    year?: number;
    year_gte?: number;
    year_lte?: number;
    runtime_gte?: number;
    runtime_lte?: number;
    certification?: string;
    certification_country?: string;
    watch_providers?: string[];
    watch_region?: string;
};

type DiscoverConfig = {
    url: string;
    inferMt: (r: Record<string, unknown>) => 'm' | 't';
    mediaType?: 'movie' | 'tv';
    defaultSort?: string;
    defaultMinVotes?: number;
    /** Bound results to episodes airing in a window around today (currently-airing TV). */
    airingWindow?: boolean;
};

const TMDB_DISCOVER_CONFIGS: Record<string, DiscoverConfig> = {
    trending:            {url: '/trending/all/week',   inferMt: (r) => r['media_type'] === 'tv' ? 't' : 'm'},
    trending_day:        {url: '/trending/all/day',    inferMt: (r) => r['media_type'] === 'tv' ? 't' : 'm'},
    trending_movies:     {url: '/trending/movie/week', inferMt: () => 'm'},
    trending_movies_day: {url: '/trending/movie/day',  inferMt: () => 'm'},
    trending_tv:         {url: '/trending/tv/week',    inferMt: () => 't'},
    trending_tv_day:     {url: '/trending/tv/day',     inferMt: () => 't'},
    popular_movies:      {url: '/discover/movie',      inferMt: () => 'm', mediaType: 'movie', defaultSort: 'popularity.desc'},
    popular_tv:          {url: '/discover/tv',         inferMt: () => 't', mediaType: 'tv',    defaultSort: 'popularity.desc'},
    upcoming:            {url: '/discover/movie',      inferMt: () => 'm', mediaType: 'movie', defaultSort: 'primary_release_date.asc', defaultMinVotes: 0},
    airing_tv:           {url: '/discover/tv',         inferMt: () => 't', mediaType: 'tv',    defaultSort: 'popularity.desc', defaultMinVotes: 0, airingWindow: true},
    top_rated_movies:    {url: '/movie/top_rated',     inferMt: () => 'm'},
    top_rated_tv:        {url: '/tv/top_rated',        inferMt: () => 't'},
};

/** Filters shared by every /discover-backed type — genres, rating range, language, runtime, certification, watch providers. */
const applyCommonFilters = async (
    p: Record<string, string>,
    filters: DiscoverFilters,
    mediaType: 'movie' | 'tv'
): Promise<void> => {
    if (filters.min_rating) p['vote_average.gte'] = String(filters.min_rating);
    if (filters.max_rating) p['vote_average.lte'] = String(filters.max_rating);
    if (filters.original_language) p['with_original_language'] = filters.original_language;
    if (filters.runtime_gte) p['with_runtime.gte'] = String(filters.runtime_gte);
    if (filters.runtime_lte) p['with_runtime.lte'] = String(filters.runtime_lte);
    if (filters.certification) {
        p['certification_country'] = filters.certification_country ?? 'US';
        p['certification'] = filters.certification;
    }

    const genreSep = filters.genre_match === 'any' ? '|' : ',';
    if (filters.genres?.length) {
        const ids = await resolveGenreIds(mediaType, filters.genres);
        if (ids.length) p['with_genres'] = ids.join(genreSep);
    }
    if (filters.exclude_genres?.length) {
        const ids = await resolveGenreIds(mediaType, filters.exclude_genres);
        if (ids.length) p['without_genres'] = ids.join(',');
    }
    if (filters.countries?.length) p['with_origin_country'] = filters.countries.join(',');
    if (filters.exclude_countries?.length) p['without_origin_country'] = filters.exclude_countries.join(',');

    if (filters.watch_providers?.length) {
        const region = filters.watch_region ?? 'US';
        const ids = await resolveWatchProviderIds(mediaType, filters.watch_providers, region);
        if (ids.length) {
            p['with_watch_providers'] = ids.join('|');
            p['watch_region'] = region;
        }
    }
};

/** Year filters — field names differ between movies (primary_release_date) and TV (first_air_date). */
const applyYearFilters = (p: Record<string, string>, filters: DiscoverFilters, mediaType: 'movie' | 'tv'): void => {
    if (mediaType === 'movie') {
        if (filters.year) p['primary_release_year'] = String(filters.year);
        if (filters.year_gte) p['primary_release_date.gte'] = `${filters.year_gte}-01-01`;
        if (filters.year_lte) p['primary_release_date.lte'] = `${filters.year_lte}-12-31`;
    } else {
        if (filters.year) p['first_air_date_year'] = String(filters.year);
        if (filters.year_gte) p['first_air_date.gte'] = `${filters.year_gte}-01-01`;
        if (filters.year_lte) p['first_air_date.lte'] = `${filters.year_lte}-12-31`;
    }
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

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

export const fetchTmdbDiscoverPage = async (type: string, page: number, filters: DiscoverFilters = {}) => {
    const cfg = TMDB_DISCOVER_CONFIGS[type];
    if (!cfg) throw new Error(`Unknown discover type: ${type}`);

    const params: Record<string, string> = {page: String(page)};

    if (cfg.mediaType) {
        params['sort_by'] = filters.sort_by ?? cfg.defaultSort ?? 'popularity.desc';
        params['vote_count.gte'] = String(filters.min_votes ?? cfg.defaultMinVotes ?? 50);
        await applyCommonFilters(params, filters, cfg.mediaType);
        applyYearFilters(params, filters, cfg.mediaType);

        if (type === 'upcoming' && !filters.year_gte) {
            params['primary_release_date.gte'] = isoDate(new Date());
        }
        if (cfg.airingWindow) {
            const today = new Date();
            const start = new Date(today);
            start.setDate(start.getDate() - 7);
            const end = new Date(today);
            end.setDate(end.getDate() + 14);
            params['air_date.gte'] = isoDate(start);
            params['air_date.lte'] = isoDate(end);
        }
    }

    const [raw, statusMap] = await Promise.all([
        tmdbGet(cfg.url, params) as Promise<TmdbDiscoverRaw>,
        buildStatusMap(),
    ]);
    return trimTmdbDiscoverPage(raw, type, cfg.inferMt, statusMap);
};

type TmdbRawResult = Record<string, unknown>;
type TmdbPage = {page: number; total_pages: number; results: TmdbRawResult[]};

const buildMovieParams = async (args: Record<string, unknown>): Promise<Record<string, string>> => {
    const filters = args as DiscoverFilters;
    const p: Record<string, string> = {
        sort_by: filters.sort_by ?? 'popularity.desc',
        'vote_count.gte': String(filters.min_votes ?? 50),
        page: String((args['page'] as number | undefined) ?? 1),
    };
    applyYearFilters(p, filters, 'movie');
    await applyCommonFilters(p, filters, 'movie');
    return p;
};

const buildTvParams = async (args: Record<string, unknown>): Promise<Record<string, string>> => {
    const filters = args as DiscoverFilters;
    const p: Record<string, string> = {
        sort_by: filters.sort_by ?? 'popularity.desc',
        'vote_count.gte': String(filters.min_votes ?? 50),
        page: String((args['page'] as number | undefined) ?? 1),
    };
    applyYearFilters(p, filters, 'tv');
    await applyCommonFilters(p, filters, 'tv');
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

const commonFilterSchemaProps = {
    genres: {type: 'array', items: {type: 'string'}, description: 'Genre names to include, e.g. ["Action", "Animation"]'},
    exclude_genres: {type: 'array', items: {type: 'string'}, description: 'Genre names to exclude, e.g. ["Animation"] to filter out anime/cartoons'},
    genre_match: {type: 'string', description: '"all" (default) requires every included genre to match; "any" matches if at least one does'},
    countries: {type: 'array', items: {type: 'string'}, description: 'ISO 3166-1 country codes to include, e.g. ["US", "GB"]'},
    exclude_countries: {type: 'array', items: {type: 'string'}, description: 'ISO 3166-1 country codes to exclude, e.g. ["JP", "KR"]'},
    min_rating: {type: 'number', description: 'Minimum vote average (0–10)'},
    max_rating: {type: 'number', description: 'Maximum vote average (0–10)'},
    min_votes: {type: 'number', description: 'Minimum vote count to filter low-sample outliers (default 50)'},
    original_language: {type: 'string', description: 'ISO 639-1 code, e.g. ja, ko, en'},
    runtime_gte: {type: 'number', description: 'Minimum runtime in minutes'},
    runtime_lte: {type: 'number', description: 'Maximum runtime in minutes'},
    certification: {type: 'string', description: 'Content rating, e.g. "PG-13", "R", "TV-MA" — requires certification_country\'s rating system'},
    certification_country: {type: 'string', description: 'ISO 3166-1 country code whose certification system to use (default "US")'},
    watch_providers: {type: 'array', items: {type: 'string'}, description: 'Streaming service names to filter by, e.g. ["Netflix", "Max"]'},
    watch_region: {type: 'string', description: 'ISO 3166-1 country code for watch provider availability (default "US")'},
} as const;

export const tmdbTools: ToolModule[] = [
    {
        name: 'tmdb_discover_page',
        description: 'Fetch a page of TMDB discover results for the discovery UI — used for Load More pagination. type: trending, trending_day, trending_movies, trending_movies_day, trending_tv, trending_tv_day, popular_movies, popular_tv, upcoming, airing_tv, top_rated_movies, top_rated_tv.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'trending, trending_day, trending_movies, trending_movies_day, trending_tv, trending_tv_day, popular_movies, popular_tv, upcoming, airing_tv, top_rated_movies, or top_rated_tv'},
                page: {type: 'number', description: 'Page number'},
                ...commonFilterSchemaProps,
                sort_by: {type: 'string', description: 'Sort order'},
                year: {type: 'number', description: 'Exact release year'},
                year_gte: {type: 'number', description: 'Release year ≥ this'},
                year_lte: {type: 'number', description: 'Release year ≤ this'},
            },
            required: ['type', 'page'],
        },
        handle: async (args) => fetchTmdbDiscoverPage(args['type'] as string, args['page'] as number, args as DiscoverFilters),
    },
    {
        name: 'tmdb_discover_movie',
        description: 'Discover movies from TMDB with rich filtering — year, genre, rating, language, runtime, certification, watch provider, sort. Returns metadata only; use seerr_* tools to check availability or submit a request.',
        inputSchema: {
            type: 'object',
            properties: {
                year: {type: 'number', description: 'Exact primary release year'},
                year_gte: {type: 'number', description: 'Release year ≥ this value'},
                year_lte: {type: 'number', description: 'Release year ≤ this value'},
                ...commonFilterSchemaProps,
                sort_by: {type: 'string', description: 'popularity.desc (default), popularity.asc, vote_average.desc, vote_average.asc, primary_release_date.desc, primary_release_date.asc, revenue.desc'},
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
        description: 'Discover TV shows from TMDB with rich filtering — year, genre, rating, language, runtime, certification, watch provider, sort. Returns metadata only; use seerr_* tools to check availability or submit a request.',
        inputSchema: {
            type: 'object',
            properties: {
                year: {type: 'number', description: 'Exact first air year'},
                year_gte: {type: 'number', description: 'First air year ≥ this value'},
                year_lte: {type: 'number', description: 'First air year ≤ this value'},
                ...commonFilterSchemaProps,
                sort_by: {type: 'string', description: 'popularity.desc (default), popularity.asc, vote_average.desc, vote_average.asc, first_air_date.desc, first_air_date.asc'},
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
