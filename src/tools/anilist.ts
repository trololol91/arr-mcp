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
    description(asHtml: false)
    studios(isMain: true) { nodes { name } }
    coverImage { large }
`;

const SORT_MAP: Record<string, string> = {
    'score-desc': 'SCORE_DESC',
    'score-asc': 'SCORE_ASC',
    'title': 'TITLE_ROMAJI',
    'ep-desc': 'EPISODES_DESC',
};
const toGqlSort = (sort?: string): string => SORT_MAP[sort ?? 'score-desc'] ?? 'SCORE_DESC';

const PAGE_QUERY = (extraFilter = '') => `
    query ($page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage }
            media(${extraFilter}sort: $sort, type: ANIME, isAdult: false) {
                ${MEDIA_FIELDS}
            }
        }
    }
`;

const SEASONAL_QUERY = `
    query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage }
            media(season: $season, seasonYear: $year, type: ANIME, sort: $sort, isAdult: false) {
                ${MEDIA_FIELDS}
            }
        }
    }
`;

const SEARCH_SIMPLE_QUERY = `
    query ($search: String, $page: Int, $perPage: Int, $sort: [MediaSort]) {
        Page(page: $page, perPage: $perPage) {
            pageInfo { hasNextPage }
            media(search: $search, type: ANIME, sort: $sort, isAdult: false) {
                ${MEDIA_FIELDS}
            }
        }
    }
`;

type PageResponse = {Page: {pageInfo: {hasNextPage: boolean}; media: Record<string, unknown>[]}};

const formatMedia = (m: Record<string, unknown>) => ({
    anilistId: m['id'],
    malId: m['idMal'],
    title: {
        romaji: (m['title'] as Record<string, string>)['romaji'],
        english: (m['title'] as Record<string, string | null>)['english'] ?? null,
    },
    episodes: m['episodes'] ?? null,
    season: m['season'] ? `${m['season'] as string} ${m['seasonYear'] as number}` : null,
    status: m['status'],
    genres: m['genres'],
    score: m['averageScore'] ?? null,
    studio: ((m['studios'] as {nodes: Array<{name: string}>})?.nodes?.[0])?.name ?? null,
    description: m['description'] ? String(m['description']).replace(/<[^>]+>/g, '').slice(0, 300) : null,
    img: (m['coverImage'] as {large?: string} | undefined)?.large ?? null,
});

export type AnilistMedia = ReturnType<typeof formatMedia>;

export const trimAnilistItem = (m: AnilistMedia) => ({
    id: m.anilistId,
    ro: m.title.romaji,
    en: m.title.english ?? null,
    ep: m.episodes ?? null,
    sc: m.score ?? null,
    st: m.status,
    ss: m.season ?? null,
    ge: ((m.genres as string[]) ?? []).slice(0, 3),
    su: m.studio ?? null,
    dsc: m.description ? String(m.description).slice(0, 120) : null,
    img: m.img ?? null,
});

export const fetchAnilistUI = async (
    type: string,
    opts: {page?: number; season?: string; year?: number; query?: string; sort?: string}
): Promise<{hasNextPage: boolean; media: AnilistMedia[]}> => {
    const page = opts.page ?? 1;
    const sort = [toGqlSort(opts.sort)];
    let data: PageResponse;

    switch (type) {
        case 'trending':
            data = await anilistQuery(PAGE_QUERY(), {page, perPage: 10, sort}) as PageResponse;
            break;
        case 'popular':
            data = await anilistQuery(PAGE_QUERY(), {page, perPage: 10, sort}) as PageResponse;
            break;
        case 'seasonal': {
            const {season: defSeason, year: defYear} = currentSeason();
            data = await anilistQuery(SEASONAL_QUERY, {
                season: opts.season ?? defSeason,
                year: opts.year ?? defYear,
                page, perPage: 10, sort,
            }) as PageResponse;
            break;
        }
        case 'search': {
            if (!opts.query) throw new Error('query is required for type=search');
            data = await anilistQuery(SEARCH_SIMPLE_QUERY, {search: opts.query, page, perPage: 10, sort}) as PageResponse;
            break;
        }
        default:
            throw new Error(`Unknown AniList UI type: ${type}`);
    }

    return {hasNextPage: data.Page.pageInfo.hasNextPage, media: data.Page.media.map(formatMedia)};
};

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
            const data = await anilistQuery(PAGE_QUERY(), {
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 20, 50),
                sort: ['TRENDING_DESC'],
            }) as PageResponse;
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
            const data = await anilistQuery(PAGE_QUERY(), {
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 20, 50),
                sort: ['POPULARITY_DESC'],
            }) as PageResponse;
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
            const data = await anilistQuery(SEASONAL_QUERY, {
                season: (args['season'] as string | undefined) ?? defaultSeason,
                year: (args['year'] as number | undefined) ?? defaultYear,
                page: (args['page'] as number | undefined) ?? 1,
                perPage: Math.min((args['perPage'] as number | undefined) ?? 20, 50),
                sort: ['POPULARITY_DESC'],
            }) as PageResponse;
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
                        pageInfo { hasNextPage }
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
                                        coverImage { large }
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
            }) as PageResponse & {Page: {media: Array<Record<string, unknown> & {recommendations: {nodes: Array<{mediaRecommendation: Record<string, unknown>}>}}> }};

            return (data.Page.media as Array<Record<string, unknown>>).map((m) => ({
                ...formatMedia(m),
                recommendations: ((m['recommendations'] as {nodes: Array<{mediaRecommendation: Record<string, unknown>}>})?.nodes ?? [])
                    .map((n) => n.mediaRecommendation)
                    .filter(Boolean)
                    .map(formatMedia),
            }));
        }
    },
    {
        name: 'anilist_ui_page',
        description: 'Fetch a page of anime for the AniList browser UI — used for Load More pagination. type: trending, popular, seasonal, search.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {type: 'string', description: 'trending, popular, seasonal, or search'},
                page: {type: 'number', description: 'Page number'},
                query: {type: 'string', description: 'Search query (required for type=search)'},
                season: {type: 'string', description: 'Override season for type=seasonal (WINTER/SPRING/SUMMER/FALL)'},
                year: {type: 'number', description: 'Override year for type=seasonal'},
                sort: {type: 'string', description: 'Sort order: score-desc (default), score-asc, title, ep-desc'},
            },
            required: ['type', 'page']
        },
        handle: async (args) => {
            const {hasNextPage, media} = await fetchAnilistUI(
                args['type'] as string,
                {
                    page: args['page'] as number,
                    query: args['query'] as string | undefined,
                    season: args['season'] as string | undefined,
                    year: args['year'] as number | undefined,
                    sort: args['sort'] as string | undefined,
                }
            );
            return {type: args['type'], page: args['page'], hasNextPage, items: media.map(trimAnilistItem)};
        }
    },
];
