import {radarrGet, radarrPost, radarrPut, radarrDelete} from '../services/radarr.js';
import type {ToolModule} from './types.js';

export const radarrTools: ToolModule[] = [
    {
        name: 'radarr_find_movie',
        description: 'Search for a movie by title. Returns id, title, year, and status. Use the id in other radarr tools.',
        inputSchema: {
            type: 'object',
            properties: {term: {type: 'string', description: 'Movie title to search for'}},
            required: ['term']
        },
        handle: async (args) => radarrGet(`/movie/lookup?term=${encodeURIComponent(String(args['term']))}`)
    },
    {
        name: 'radarr_get_movie_history',
        description: 'Get download history for a movie. Returns grab and import records including release names and history ids for blocklisting.',
        inputSchema: {
            type: 'object',
            properties: {movieId: {type: 'number', description: 'Movie id from radarr_find_movie'}},
            required: ['movieId']
        },
        handle: async (args) => radarrGet(`/history?movieId=${args['movieId']}&pageSize=20`)
    },
    {
        name: 'radarr_delete_movie_file',
        description: 'Delete an imported movie file from disk and the Radarr library.',
        inputSchema: {
            type: 'object',
            properties: {movieFileId: {type: 'number', description: 'Movie file id from radarr_find_movie (movieFileId field)'}},
            required: ['movieFileId']
        },
        handle: async (args) => radarrDelete(`/moviefile/${args['movieFileId']}`)
    },
    {
        name: 'radarr_search_movie',
        description: 'Trigger Radarr to search all indexers for a movie and grab the best available release.',
        inputSchema: {
            type: 'object',
            properties: {movieId: {type: 'number', description: 'Movie id from radarr_find_movie'}},
            required: ['movieId']
        },
        handle: async (args) => radarrPost('/command', {name: 'MoviesSearch', movieIds: [args['movieId']]})
    },
    {
        name: 'radarr_blocklist_release',
        description: 'Mark a history record as failed and add it to the blocklist so Radarr will not grab it again.',
        inputSchema: {
            type: 'object',
            properties: {historyId: {type: 'number', description: 'History record id from radarr_get_movie_history'}},
            required: ['historyId']
        },
        handle: async (args) => radarrPost(`/history/failed/${args['historyId']}`, {})
    },
    {
        name: 'radarr_get_release_profiles',
        description: 'List all release profiles including currently blocked release groups.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => radarrGet('/releaseprofile')
    },
    {
        name: 'radarr_add_release_profile',
        description: 'Add a release profile to block a release group or term from being grabbed by Radarr.',
        inputSchema: {
            type: 'object',
            properties: {
                ignored: {type: 'string', description: 'Release group name or term to block (e.g. "SYLiX")'}
            },
            required: ['ignored']
        },
        handle: async (args) => radarrPost('/releaseprofile', {
            enabled: true,
            required: [],
            ignored: [args['ignored']],
            indexerId: 0,
            tags: []
        })
    },
    {
        name: 'radarr_delete_release_profile',
        description: 'Delete a release profile (unblock a previously blocked release group).',
        inputSchema: {
            type: 'object',
            properties: {profileId: {type: 'number', description: 'Profile id from radarr_get_release_profiles'}},
            required: ['profileId']
        },
        handle: async (args) => radarrDelete(`/releaseprofile/${args['profileId']}`)
    },
    {
        name: 'radarr_get_queue',
        description: 'Show what is currently downloading or pending in Radarr.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => radarrGet('/queue?pageSize=50')
    },
    {
        name: 'radarr_get_missing',
        description: 'List monitored movies that have not been downloaded yet.',
        inputSchema: {
            type: 'object',
            properties: {
                pageSize: {type: 'number', description: 'Number of results (default 20)'}
            }
        },
        handle: async (args) => radarrGet(`/wanted/missing?pageSize=${(args['pageSize'] as number | undefined) ?? 20}&sortKey=inCinemas&sortDir=desc`)
    },
    {
        name: 'radarr_get_health',
        description: 'Get Radarr system health warnings and errors.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => radarrGet('/health')
    },
    {
        name: 'radarr_get_disk_space',
        description: 'Get available disk space on Radarr root folders.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => radarrGet('/diskspace')
    },
    {
        name: 'radarr_get_calendar',
        description: 'Show upcoming movie release dates.',
        inputSchema: {
            type: 'object',
            properties: {
                days: {type: 'number', description: 'Number of days ahead to look (default 30)'}
            }
        },
        handle: async (args) => {
            const start = new Date().toISOString();
            const end = new Date(Date.now() + ((args['days'] as number | undefined) ?? 30) * 86400000).toISOString();
            return radarrGet(`/calendar?start=${start}&end=${end}`);
        }
    },
    {
        name: 'radarr_get_movie',
        description: 'Get full details of a movie already in the Radarr library: monitored status, quality profile, file path.',
        inputSchema: {
            type: 'object',
            properties: {
                movieId: {type: 'number', description: 'Movie id from radarr_find_movie'}
            },
            required: ['movieId']
        },
        handle: async (args) => radarrGet(`/movie/${args['movieId']}`)
    },
    {
        name: 'radarr_update_movie',
        description: 'Update settings on an existing Radarr movie. Only provided fields are changed. Use radarr_get_tags to resolve tag names.',
        inputSchema: {
            type: 'object',
            properties: {
                movieId: {type: 'number', description: 'Movie id from radarr_find_movie'},
                qualityProfileId: {type: 'number', description: 'New quality profile id'},
                monitored: {type: 'boolean', description: 'Set monitored status'},
                tags: {type: 'array', items: {type: 'string'}, description: 'Replace tags with these labels (e.g. ["debrid"])'},
                path: {type: 'string', description: 'Move movie to a different path'},
                minimumAvailability: {type: 'string', description: 'When to consider available: announced, inCinemas, released, tba'}
            },
            required: ['movieId']
        },
        handle: async (args) => {
            const movie = await radarrGet(`/movie/${args['movieId']}`) as Record<string, unknown>;
            if (args['qualityProfileId'] !== undefined) movie['qualityProfileId'] = args['qualityProfileId'];
            if (args['monitored'] !== undefined) movie['monitored'] = args['monitored'];
            if (args['path'] !== undefined) movie['path'] = args['path'];
            if (args['minimumAvailability'] !== undefined) movie['minimumAvailability'] = args['minimumAvailability'];
            if (args['tags'] !== undefined) {
                const tagLabels = args['tags'] as string[];
                const allTags = await radarrGet('/tag') as Array<{id: number; label: string}>;
                movie['tags'] = tagLabels.map((label) => {
                    const match = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
                    if (!match) throw new Error(`Unknown Radarr tag: "${label}". Available: ${allTags.map((t) => t.label).join(', ')}`);
                    return match.id;
                });
            }
            return radarrPut(`/movie/${args['movieId'] as number}`, movie);
        }
    },
    {
        name: 'radarr_get_tags',
        description: 'List all tags configured in Radarr.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => radarrGet('/tag')
    },
    {
        name: 'radarr_add_movie',
        description: 'Add a new movie to Radarr for monitoring and downloading. Always call radarr_get_tags first and ask the user which tag to apply before adding.',
        inputSchema: {
            type: 'object',
            properties: {
                tmdbId: {type: 'number', description: 'TMDB id from radarr_find_movie (tmdbId field)'},
                title: {type: 'string', description: 'Movie title from radarr_find_movie'},
                qualityProfileId: {type: 'number', description: 'Quality profile id. Omit to use first available profile.'},
                rootFolderPath: {type: 'string', description: 'Root folder path. Omit to use first available root folder.'},
                tags: {type: 'array', items: {type: 'string'}, description: 'Tag labels to apply (e.g. ["debrid"]). Resolved to IDs automatically.'},
                searchOnAdd: {type: 'boolean', description: 'Search for the movie after adding (default: true)'}
            },
            required: ['tmdbId', 'title', 'tags']
        },
        handle: async (args) => {
            let qualityProfileId = args['qualityProfileId'] as number | undefined;
            let rootFolderPath = args['rootFolderPath'] as string | undefined;
            if (!qualityProfileId) {
                const profiles = await radarrGet('/qualityprofile') as Array<{id: number}>;
                if (!profiles.length) throw new Error('No quality profiles found in Radarr');
                qualityProfileId = profiles[0].id;
            }
            if (!rootFolderPath) {
                const folders = await radarrGet('/rootfolder') as Array<{path: string}>;
                if (!folders.length) throw new Error('No root folders found in Radarr');
                rootFolderPath = folders[0].path;
            }
            const tagLabels = args['tags'] as string[];
            const allTags = await radarrGet('/tag') as Array<{id: number; label: string}>;
            const tagIds = tagLabels.map((label) => {
                const match = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
                if (!match) throw new Error(`Unknown Radarr tag: "${label}". Available: ${allTags.map((t) => t.label).join(', ')}`);
                return match.id;
            });
            return radarrPost('/movie', {
                tmdbId: args['tmdbId'],
                title: args['title'],
                qualityProfileId,
                rootFolderPath,
                monitored: true,
                tags: tagIds,
                addOptions: {
                    searchForMovie: (args['searchOnAdd'] as boolean | undefined) ?? true
                }
            });
        }
    },
    {
        name: 'radarr_remove_movie',
        description: 'Remove a movie from Radarr.',
        inputSchema: {
            type: 'object',
            properties: {
                movieId: {type: 'number', description: 'Movie id from radarr_find_movie'},
                deleteFiles: {type: 'boolean', description: 'Delete media files from disk (default: true)'}
            },
            required: ['movieId']
        },
        handle: async (args) => {
            const deleteFiles = (args['deleteFiles'] as boolean | undefined) ?? true;
            return radarrDelete(`/movie/${args['movieId']}?deleteFiles=${deleteFiles}&addImportExclusion=false`);
        }
    },
    {
        name: 'radarr_remove_from_queue',
        description: 'Remove an item from the Radarr download queue. Optionally blocklist the release so it will not be grabbed again.',
        inputSchema: {
            type: 'object',
            properties: {
                queueId: {type: 'number', description: 'Queue item id from radarr_get_queue (id field)'},
                blocklist: {type: 'boolean', description: 'Add to blocklist so this release is not grabbed again (default: false)'},
                skipRedownload: {type: 'boolean', description: 'Do not search for a replacement after removing (default: false)'}
            },
            required: ['queueId']
        },
        handle: async (args) => {
            const blocklist = (args['blocklist'] as boolean | undefined) ?? false;
            const skipRedownload = (args['skipRedownload'] as boolean | undefined) ?? false;
            return radarrDelete(`/queue/${args['queueId']}?removeFromClient=true&blocklist=${blocklist}&skipRedownload=${skipRedownload}`);
        }
    },
    {
        name: 'radarr_interactive_search',
        description: 'List all available releases for a movie from every indexer — like Radarr\'s Interactive Search UI. Returns release name, quality, size, seeders, indexer, and release group for each result.',
        inputSchema: {
            type: 'object',
            properties: {
                movieId: {type: 'number', description: 'Movie id from radarr_find_movie'}
            },
            required: ['movieId']
        },
        handle: async (args) => radarrGet(`/release?movieId=${args['movieId']}`)
    },
    {
        name: 'radarr_grab_release',
        description: 'Grab a specific release from interactive search results and send it to the download client.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {type: 'string', description: 'Release guid from radarr_interactive_search'},
                indexerId: {type: 'number', description: 'Indexer id from radarr_interactive_search'}
            },
            required: ['guid', 'indexerId']
        },
        handle: async (args) => radarrPost('/release', {guid: args['guid'], indexerId: args['indexerId']})
    }
];
