import {serrGet, serrPost} from '../services/seerr.js';
import type {ToolModule} from './types.js';

export const serrTools: ToolModule[] = [
    {
        name: 'seerr_search',
        description: 'Search Seerr for movies or TV shows. Returns title, year, mediaType, tmdbId, tvdbId, and current request status.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {type: 'string', description: 'Movie or TV show title to search for'},
                page: {type: 'number', description: 'Page number (default 1)'}
            },
            required: ['query']
        },
        handle: async (args) => serrGet(`/search?query=${encodeURIComponent(String(args['query']))}&page=${(args['page'] as number | undefined) ?? 1}`)
    },
    {
        name: 'seerr_get_requests',
        description: 'List media requests in Seerr. Filter by status to see pending approvals or in-progress downloads.',
        inputSchema: {
            type: 'object',
            properties: {
                filter: {
                    type: 'string',
                    description: 'Status filter: all, approved, pending, declined, processing, available (default: all)'
                },
                pageSize: {type: 'number', description: 'Number of results (default 20)'}
            }
        },
        handle: async (args) => {
            const filter = (args['filter'] as string | undefined) ?? 'all';
            const take = (args['pageSize'] as number | undefined) ?? 20;
            return serrGet(`/request?take=${take}&skip=0&filter=${filter}&sort=added`);
        }
    },
    {
        name: 'seerr_request_movie',
        description: 'Submit a request for a movie. Use seerr_search first to get the tmdbId.',
        inputSchema: {
            type: 'object',
            properties: {
                tmdbId: {type: 'number', description: 'TMDB id from seerr_search (id field for movies)'}
            },
            required: ['tmdbId']
        },
        handle: async (args) => serrPost('/request', {mediaType: 'movie', mediaId: args['tmdbId']})
    },
    {
        name: 'seerr_request_tv',
        description: 'Submit a request for a TV show or specific seasons. Use seerr_search first to get the tvdbId.',
        inputSchema: {
            type: 'object',
            properties: {
                tvdbId: {type: 'number', description: 'TVDB id from seerr_search (tvdbId field for TV shows)'},
                tmdbId: {type: 'number', description: 'TMDB id from seerr_search (id field for TV shows)'},
                seasons: {
                    type: 'array',
                    items: {type: 'number'},
                    description: 'Specific season numbers to request. Omit to request all seasons.'
                }
            },
            required: ['tvdbId', 'tmdbId']
        },
        handle: async (args) => {
            const body: Record<string, unknown> = {
                mediaType: 'tv',
                mediaId: args['tmdbId'],
                tvdbId: args['tvdbId']
            };
            if (args['seasons'] !== undefined) {
                body['seasons'] = args['seasons'];
            }
            return serrPost('/request', body);
        }
    },
    {
        name: 'seerr_approve_request',
        description: 'Approve a pending media request.',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: {type: 'number', description: 'Request id from seerr_get_requests'}
            },
            required: ['requestId']
        },
        handle: async (args) => serrPost(`/request/${args['requestId']}/approve`, {})
    },
    {
        name: 'seerr_decline_request',
        description: 'Decline a pending media request.',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: {type: 'number', description: 'Request id from seerr_get_requests'}
            },
            required: ['requestId']
        },
        handle: async (args) => serrPost(`/request/${args['requestId']}/decline`, {})
    },
    {
        name: 'seerr_trending',
        description: 'Get trending movies and TV shows right now.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {type: 'number', description: 'Page number (default 1)'}
            }
        },
        handle: async (args) => serrGet(`/discover/trending?page=${(args['page'] as number | undefined) ?? 1}`)
    },
    {
        name: 'seerr_popular_movies',
        description: 'Get popular movies.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {type: 'number', description: 'Page number (default 1)'}
            }
        },
        handle: async (args) => serrGet(`/discover/movies?page=${(args['page'] as number | undefined) ?? 1}`)
    },
    {
        name: 'seerr_upcoming_movies',
        description: 'Get upcoming movies releasing soon.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {type: 'number', description: 'Page number (default 1)'}
            }
        },
        handle: async (args) => serrGet(`/discover/movies/upcoming?page=${(args['page'] as number | undefined) ?? 1}`)
    },
    {
        name: 'seerr_popular_tv',
        description: 'Get popular TV shows.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {type: 'number', description: 'Page number (default 1)'}
            }
        },
        handle: async (args) => serrGet(`/discover/tv?page=${(args['page'] as number | undefined) ?? 1}`)
    },
    {
        name: 'seerr_movie_recommendations',
        description: 'Get movie recommendations based on a specific movie.',
        inputSchema: {
            type: 'object',
            properties: {
                tmdbId: {type: 'number', description: 'TMDB id of the movie to base recommendations on'},
                page: {type: 'number', description: 'Page number (default 1)'}
            },
            required: ['tmdbId']
        },
        handle: async (args) => serrGet(`/movie/${args['tmdbId']}/recommendations?page=${(args['page'] as number | undefined) ?? 1}`)
    },
    {
        name: 'seerr_tv_recommendations',
        description: 'Get TV show recommendations based on a specific show.',
        inputSchema: {
            type: 'object',
            properties: {
                tmdbId: {type: 'number', description: 'TMDB id of the TV show to base recommendations on (id field from seerr_search)'},
                page: {type: 'number', description: 'Page number (default 1)'}
            },
            required: ['tmdbId']
        },
        handle: async (args) => serrGet(`/tv/${args['tmdbId']}/recommendations?page=${(args['page'] as number | undefined) ?? 1}`)
    }
];
