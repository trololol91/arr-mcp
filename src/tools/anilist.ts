import {anilistQuery, currentSeason} from '../services/anilist.js';
import type {ToolModule} from './types.js';

const MEDIA_FIELDS = `
    id
    idMal
    title { romaji english native }
    type
    episodes
    season
    seasonYear
    status
    genres
    averageScore
    meanScore
    popularity
    description(asHtml: false)
    studios(isMain: true) { nodes { name } }
`;

const PAGE_QUERY = (mediaFilter: string) => `
    query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
            media(${mediaFilter}, type: ANIME, isAdult: false) {
                ${MEDIA_FIELDS}
            }
        }
    }
`;

const formatMedia = (m: Record<string, unknown>) => ({
    anilistId: m['id'],
    malId: m['idMal'],
    title: {
        romaji: (m['title'] as Record<string, string>)['romaji'],
        english: (m['title'] as Record<string, string>)['english'],
    },
    episodes: m['episodes'],
    season: m['season'] ? `${m['season'] as string} ${m['seasonYear'] as number}` : null,
    status: m['status'],
    genres: m['genres'],
    score: m['averageScore'],
    studio: ((m['studios'] as {nodes: Array<{name: string}>})?.nodes?.[0])?.name ?? null,
    description: m['description'] ? String(m['description']).replace(/<[^>]+>/g, '').slice(0, 300) : null,
});

export const anilistTools: ToolModule[] = [
    {
        name: 'anilist_trending',
        description: 'Get currently trending anime from AniList.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {type: 'number', description: 'Page number (default 1)'},
                perPage: {type: 'number', description: 'Results per page, max 50 (default 20)'}
            }
        },
        handle: async (args) => {
            const data = await anilistQuery(PAGE_QUERY('sort: TRENDING_DESC'), {
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 20, 50),
            }) as {Page: {media: Record<string, unknown>[]}};
            return data.Page.media.map(formatMedia);
        }
    },
    {
        name: 'anilist_popular',
        description: 'Get all-time most popular anime from AniList.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {type: 'number', description: 'Page number (default 1)'},
                perPage: {type: 'number', description: 'Results per page, max 50 (default 20)'}
            }
        },
        handle: async (args) => {
            const data = await anilistQuery(PAGE_QUERY('sort: POPULARITY_DESC'), {
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 20, 50),
            }) as {Page: {media: Record<string, unknown>[]}};
            return data.Page.media.map(formatMedia);
        }
    },
    {
        name: 'anilist_seasonal',
        description: 'Get anime airing in a specific season. Defaults to the current season.',
        inputSchema: {
            type: 'object',
            properties: {
                season: {type: 'string', description: 'Season: WINTER, SPRING, SUMMER, or FALL. Defaults to current season.'},
                year: {type: 'number', description: 'Year. Defaults to current year.'},
                page: {type: 'number', description: 'Page number (default 1)'},
                perPage: {type: 'number', description: 'Results per page, max 50 (default 20)'}
            }
        },
        handle: async (args) => {
            const {season: defaultSeason, year: defaultYear} = currentSeason();
            const data = await anilistQuery(`
                query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
                            ${MEDIA_FIELDS}
                        }
                    }
                }
            `, {
                season: (args['season'] as string | undefined) ?? defaultSeason,
                year: (args['year'] as number | undefined) ?? defaultYear,
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 20, 50),
            }) as {Page: {media: Record<string, unknown>[]}};
            return data.Page.media.map(formatMedia);
        }
    },
    {
        name: 'anilist_search',
        description: 'Search for an anime on AniList by title. Also returns recommendations for the top result.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Anime title to search for'},
                page: {type: 'number', description: 'Page number (default 1)'},
                perPage: {type: 'number', description: 'Results per page, max 50 (default 10)'}
            },
            required: ['query']
        },
        handle: async (args) => {
            const data = await anilistQuery(`
                query ($search: String, $page: Int, $perPage: Int) {
                    Page(page: $page, perPage: $perPage) {
                        media(search: $search, type: ANIME, isAdult: false) {
                            ${MEDIA_FIELDS}
                            recommendations(sort: RATING_DESC, perPage: 10) {
                                nodes {
                                    mediaRecommendation {
                                        id
                                        idMal
                                        title { romaji english }
                                        episodes
                                        season
                                        seasonYear
                                        status
                                        genres
                                        averageScore
                                        studios(isMain: true) { nodes { name } }
                                    }
                                }
                            }
                        }
                    }
                }
            `, {
                search: args['query'],
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 10, 50),
            }) as {Page: {media: Record<string, unknown>[]}};

            return data.Page.media.map((m) => ({
                ...formatMedia(m),
                recommendations: ((m['recommendations'] as {nodes: Array<{mediaRecommendation: Record<string, unknown>}>})?.nodes ?? [])
                    .map((n) => n.mediaRecommendation)
                    .filter(Boolean)
                    .map(formatMedia),
            }));
        }
    },
];
