import {tmdbGet, resolveGenreIds, resolveGenreNames} from '../services/tmdb.js';
import type {ToolModule} from './types.js';

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
        name: 'tmdb_discover_movie',
        description: 'Discover movies from TMDB with rich filtering — year, genre, rating, language, sort. Returns metadata only; use seerr_* tools to check availability or submit a request.',
        inputSchema: {
            type: 'object',
            properties: {
                year: {type: 'number', description: 'Exact primary release year'},
                year_gte: {type: 'number', description: 'Release year ≥ this value'},
                year_lte: {type: 'number', description: 'Release year ≤ this value'},
                genres: {type: 'array', items: {type: 'string'}, description: 'Genre names, e.g. ["Action", "Animation"]'},
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
                genres: {type: 'array', items: {type: 'string'}, description: 'Genre names, e.g. ["Drama", "Crime"]'},
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
