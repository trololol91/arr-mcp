import {sonarrGet, sonarrPost, sonarrPut, sonarrDelete} from '../services/sonarr.js';
import type {ToolModule} from './types.js';

export const sonarrTools: ToolModule[] = [
    {
        name: 'sonarr_find_series',
        description: 'Search for a TV series by name. Returns id, title, year, and status. Use the id in other sonarr tools.',
        inputSchema: {
            type: 'object',
            properties: {term: {type: 'string', description: 'Series title to search for'}},
            required: ['term']
        },
        handle: async (args) => sonarrGet(`/series/lookup?term=${encodeURIComponent(String(args['term']))}`)
    },
    {
        name: 'sonarr_get_episode',
        description: 'Get a specific episode by series id, season number, and episode number.',
        inputSchema: {
            type: 'object',
            properties: {
                seriesId: {type: 'number', description: 'Series id from sonarr_find_series'},
                season: {type: 'number', description: 'Season number'},
                episode: {type: 'number', description: 'Episode number'}
            },
            required: ['seriesId', 'season', 'episode']
        },
        handle: async (args) => {
            const episodes = await sonarrGet(`/episode?seriesId=${args['seriesId']}&seasonNumber=${args['season']}`) as unknown[];
            const ep = (episodes as Array<{episodeNumber: number}>).find(
                (e) => e.episodeNumber === args['episode']
            );
            if (!ep) throw new Error(`Episode S${String(args['season']).padStart(2, '0')}E${String(args['episode']).padStart(2, '0')} not found`);
            return ep;
        }
    },
    {
        name: 'sonarr_get_episode_history',
        description: 'Get download history for a specific episode. Returns grab and import records including release names and history ids for blocklisting.',
        inputSchema: {
            type: 'object',
            properties: {episodeId: {type: 'number', description: 'Episode id from sonarr_get_episode'}},
            required: ['episodeId']
        },
        handle: async (args) => sonarrGet(`/history?episodeId=${args['episodeId']}&pageSize=20`)
    },
    {
        name: 'sonarr_delete_episode_file',
        description: 'Delete an imported episode file from disk and the Sonarr library. Use when a file is corrupt, mislabeled, or wrong content.',
        inputSchema: {
            type: 'object',
            properties: {episodeFileId: {type: 'number', description: 'Episode file id from sonarr_get_episode (episodeFileId field)'}},
            required: ['episodeFileId']
        },
        handle: async (args) => sonarrDelete(`/episodefile/${args['episodeFileId']}`)
    },
    {
        name: 'sonarr_search_episode',
        description: 'Trigger Sonarr to search all indexers for a specific episode and grab the best available release.',
        inputSchema: {
            type: 'object',
            properties: {episodeId: {type: 'number', description: 'Episode id from sonarr_get_episode'}},
            required: ['episodeId']
        },
        handle: async (args) => sonarrPost('/command', {name: 'EpisodeSearch', episodeIds: [args['episodeId']]})
    },
    {
        name: 'sonarr_blocklist_release',
        description: 'Mark a history record as failed and add it to the blocklist so Sonarr will not grab it again.',
        inputSchema: {
            type: 'object',
            properties: {historyId: {type: 'number', description: 'History record id from sonarr_get_episode_history'}},
            required: ['historyId']
        },
        handle: async (args) => sonarrPost(`/history/failed/${args['historyId']}`, {})
    },
    {
        name: 'sonarr_get_release_profiles',
        description: 'List all release profiles including currently blocked release groups.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => sonarrGet('/releaseprofile')
    },
    {
        name: 'sonarr_add_release_profile',
        description: 'Add a release profile to block a release group or term from being grabbed by Sonarr.',
        inputSchema: {
            type: 'object',
            properties: {
                ignored: {type: 'string', description: 'Release group name or term to block (e.g. "SYLiX")'}
            },
            required: ['ignored']
        },
        handle: async (args) => sonarrPost('/releaseprofile', {
            enabled: true,
            required: [],
            ignored: [args['ignored']],
            indexerId: 0,
            tags: []
        })
    },
    {
        name: 'sonarr_delete_release_profile',
        description: 'Delete a release profile (unblock a previously blocked release group).',
        inputSchema: {
            type: 'object',
            properties: {profileId: {type: 'number', description: 'Profile id from sonarr_get_release_profiles'}},
            required: ['profileId']
        },
        handle: async (args) => sonarrDelete(`/releaseprofile/${args['profileId']}`)
    },
    {
        name: 'sonarr_get_queue',
        description: 'Show what is currently downloading or pending in Sonarr.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => sonarrGet('/queue?pageSize=50')
    },
    {
        name: 'sonarr_get_calendar',
        description: 'Show upcoming episode air dates for the next 7 days.',
        inputSchema: {
            type: 'object',
            properties: {
                days: {type: 'number', description: 'Number of days ahead to look (default 7)'}
            }
        },
        handle: async (args) => {
            const start = new Date().toISOString();
            const end = new Date(Date.now() + ((args['days'] as number | undefined) ?? 7) * 86400000).toISOString();
            return sonarrGet(`/calendar?start=${start}&end=${end}`);
        }
    },
    {
        name: 'sonarr_get_missing',
        description: 'List monitored episodes that have not been downloaded yet.',
        inputSchema: {
            type: 'object',
            properties: {
                pageSize: {type: 'number', description: 'Number of results (default 20)'}
            }
        },
        handle: async (args) => sonarrGet(`/wanted/missing?pageSize=${(args['pageSize'] as number | undefined) ?? 20}&sortKey=airDateUtc&sortDir=desc`)
    },
    {
        name: 'sonarr_get_health',
        description: 'Get Sonarr system health warnings and errors.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => sonarrGet('/health')
    },
    {
        name: 'sonarr_get_disk_space',
        description: 'Get available disk space on Sonarr root folders.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => sonarrGet('/diskspace')
    },
    {
        name: 'sonarr_refresh_series',
        description: 'Force Sonarr to refresh metadata and rescan files for a series.',
        inputSchema: {
            type: 'object',
            properties: {
                seriesId: {type: 'number', description: 'Series id to refresh. Omit to refresh all series.'}
            }
        },
        handle: async (args) => {
            const body: Record<string, unknown> = {name: 'RefreshSeries'};
            if (args['seriesId'] !== undefined) body['seriesId'] = args['seriesId'];
            return sonarrPost('/command', body);
        }
    },
    {
        name: 'sonarr_get_series',
        description: 'Get full details of a series already in the Sonarr library: monitored status, quality profile, seasons, root folder path.',
        inputSchema: {
            type: 'object',
            properties: {
                seriesId: {type: 'number', description: 'Series id from sonarr_find_series'}
            },
            required: ['seriesId']
        },
        handle: async (args) => sonarrGet(`/series/${args['seriesId']}`)
    },
    {
        name: 'sonarr_update_series',
        description: 'Update settings on an existing Sonarr series. Only provided fields are changed. Use sonarr_get_tags to resolve tag names.',
        inputSchema: {
            type: 'object',
            properties: {
                seriesId: {type: 'number', description: 'Series id from sonarr_find_series'},
                qualityProfileId: {type: 'number', description: 'New quality profile id'},
                monitored: {type: 'boolean', description: 'Set monitored status'},
                tags: {type: 'array', items: {type: 'string'}, description: 'Replace tags with these labels (e.g. ["debrid"])'},
                path: {type: 'string', description: 'Move series to a different root path'}
            },
            required: ['seriesId']
        },
        handle: async (args) => {
            const series = await sonarrGet(`/series/${args['seriesId']}`) as Record<string, unknown>;
            if (args['qualityProfileId'] !== undefined) series['qualityProfileId'] = args['qualityProfileId'];
            if (args['monitored'] !== undefined) series['monitored'] = args['monitored'];
            if (args['path'] !== undefined) series['path'] = args['path'];
            if (args['tags'] !== undefined) {
                const tagLabels = args['tags'] as string[];
                const allTags = await sonarrGet('/tag') as Array<{id: number; label: string}>;
                series['tags'] = tagLabels.map((label) => {
                    const match = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
                    if (!match) throw new Error(`Unknown Sonarr tag: "${label}". Available: ${allTags.map((t) => t.label).join(', ')}`);
                    return match.id;
                });
            }
            return sonarrPut(`/series/${args['seriesId'] as number}`, series);
        }
    },
    {
        name: 'sonarr_get_tags',
        description: 'List all tags configured in Sonarr.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => sonarrGet('/tag')
    },
    {
        name: 'sonarr_add_series',
        description: 'Add a new TV series to Sonarr. Always call sonarr_get_tags first and ask the user which tag to apply before adding. Supports monitor presets (all/future/missing/existing/first/latest/none) or a specific list of season numbers to monitor.',
        inputSchema: {
            type: 'object',
            properties: {
                tvdbId: {type: 'number', description: 'TVDB id from sonarr_find_series (tvdbId field)'},
                title: {type: 'string', description: 'Series title from sonarr_find_series'},
                qualityProfileId: {type: 'number', description: 'Quality profile id. Omit to use first available profile.'},
                rootFolderPath: {type: 'string', description: 'Root folder path. Omit to use first available root folder.'},
                tags: {type: 'array', items: {type: 'string'}, description: 'Tag labels to apply (e.g. ["debrid"]). Resolved to IDs automatically.'},
                monitor: {type: 'string', description: 'Monitor preset: all (default), future, missing, existing, first, latest, none. Ignored if seasons is provided.'},
                seasons: {type: 'array', items: {type: 'number'}, description: 'Specific season numbers to monitor (e.g. [2,3]). Overrides monitor preset.'},
                searchOnAdd: {type: 'boolean', description: 'Search for missing episodes after adding (default: true)'}
            },
            required: ['tvdbId', 'title', 'tags']
        },
        handle: async (args) => {
            let qualityProfileId = args['qualityProfileId'] as number | undefined;
            let rootFolderPath = args['rootFolderPath'] as string | undefined;
            if (!qualityProfileId) {
                const profiles = await sonarrGet('/qualityprofile') as Array<{id: number}>;
                if (!profiles.length) throw new Error('No quality profiles found in Sonarr');
                qualityProfileId = profiles[0].id;
            }
            if (!rootFolderPath) {
                const folders = await sonarrGet('/rootfolder') as Array<{path: string}>;
                if (!folders.length) throw new Error('No root folders found in Sonarr');
                rootFolderPath = folders[0].path;
            }

            const tagLabels = args['tags'] as string[];
            const allTags = await sonarrGet('/tag') as Array<{id: number; label: string}>;
            const tagIds = tagLabels.map((label) => {
                const match = allTags.find((t) => t.label.toLowerCase() === label.toLowerCase());
                if (!match) throw new Error(`Unknown Sonarr tag: "${label}". Available: ${allTags.map((t) => t.label).join(', ')}`);
                return match.id;
            });

            const specificSeasons = args['seasons'] as number[] | undefined;
            const monitorPreset = specificSeasons ? 'none' : ((args['monitor'] as string | undefined) ?? 'all');

            let seasonsPayload: Array<{seasonNumber: number; monitored: boolean}> | undefined;
            if (specificSeasons) {
                const lookup = await sonarrGet(`/series/lookup?term=tvdb:${args['tvdbId'] as number}`) as Array<{seasons: Array<{seasonNumber: number}>}>;
                const allSeasons = lookup[0]?.seasons ?? [];
                const wanted = new Set(specificSeasons);
                seasonsPayload = allSeasons.map((s) => ({seasonNumber: s.seasonNumber, monitored: wanted.has(s.seasonNumber)}));
            }

            return sonarrPost('/series', {
                tvdbId: args['tvdbId'],
                title: args['title'],
                qualityProfileId,
                rootFolderPath,
                monitored: true,
                seasonFolder: true,
                tags: tagIds,
                ...(seasonsPayload ? {seasons: seasonsPayload} : {}),
                addOptions: {
                    searchForMissingEpisodes: (args['searchOnAdd'] as boolean | undefined) ?? true,
                    searchForCutoffUnmetEpisodes: false,
                    monitor: monitorPreset
                }
            });
        }
    },
    {
        name: 'sonarr_remove_series',
        description: 'Remove or unmonitor a series or season. To change monitoring without deleting: provide monitor preset (all/future/missing/existing/first/latest/none) or seasonNumber with monitor=none. To delete files for a season: provide seasonNumber. To fully remove the series: provide neither monitor nor seasonNumber.',
        inputSchema: {
            type: 'object',
            properties: {
                seriesId: {type: 'number', description: 'Series id from sonarr_find_series'},
                monitor: {type: 'string', description: 'New monitor preset: all, future, missing, existing, first, latest, none. Updates monitoring without deleting anything.'},
                seasonNumber: {type: 'number', description: 'Target a specific season. Combined with monitor=none: unmonitors the season. Without monitor: deletes the season\'s files.'},
                deleteFiles: {type: 'boolean', description: 'Delete media files from disk when removing a season or series (default: true)'}
            },
            required: ['seriesId']
        },
        handle: async (args) => {
            const seriesId = args['seriesId'] as number;
            const monitor = args['monitor'] as string | undefined;
            const seasonNumber = args['seasonNumber'] as number | undefined;
            const deleteFiles = (args['deleteFiles'] as boolean | undefined) ?? true;

            if (monitor !== undefined) {
                // Update monitoring — fetch series, patch seasons/monitored, PUT back
                const series = await sonarrGet(`/series/${seriesId}`) as Record<string, unknown>;
                const seasons = (series['seasons'] as Array<{seasonNumber: number; monitored: boolean}>) ?? [];

                if (seasonNumber !== undefined) {
                    // Unmonitor/remonitor a specific season only
                    series['seasons'] = seasons.map((s) =>
                        s.seasonNumber === seasonNumber ? {...s, monitored: monitor !== 'none'} : s
                    );
                } else {
                    // Apply preset — mirror what Sonarr does internally for each preset
                    const maxSeason = Math.max(...seasons.map((s) => s.seasonNumber));
                    series['seasons'] = seasons.map((s) => {
                        let monitored: boolean;
                        switch (monitor) {
                            case 'all':      monitored = true; break;
                            case 'none':     monitored = false; break;
                            case 'first':    monitored = s.seasonNumber === 1; break;
                            case 'latest':   monitored = s.seasonNumber === maxSeason; break;
                            case 'future':   monitored = false; break; // Sonarr handles future via series-level flag
                            default:         monitored = s.monitored; break;
                        }
                        return {...s, monitored};
                    });
                    if (monitor === 'none') series['monitored'] = false;
                    if (monitor === 'all')  series['monitored'] = true;
                }

                return sonarrPut(`/series/${seriesId}`, series);
            }

            if (seasonNumber !== undefined) {
                // Delete files for the season
                const files = await sonarrGet(`/episodefile?seriesId=${seriesId}&seasonNumber=${seasonNumber}`) as Array<{id: number}>;
                if (!files.length) return {message: 'No files found for that season'};
                if (deleteFiles) await sonarrDelete('/episodefile/bulk', {episodeFileIds: files.map((f) => f.id)});
                return {message: `Deleted ${files.length} file(s) for season ${seasonNumber}`};
            }

            // Full series removal
            return sonarrDelete(`/series/${seriesId}?deleteFiles=${deleteFiles}&addImportListExclusion=false`);
        }
    },
    {
        name: 'sonarr_remove_from_queue',
        description: 'Remove an item from the Sonarr download queue. Optionally blocklist the release so it will not be grabbed again.',
        inputSchema: {
            type: 'object',
            properties: {
                queueId: {type: 'number', description: 'Queue item id from sonarr_get_queue (id field)'},
                blocklist: {type: 'boolean', description: 'Add to blocklist so this release is not grabbed again (default: false)'},
                skipRedownload: {type: 'boolean', description: 'Do not search for a replacement after removing (default: false)'}
            },
            required: ['queueId']
        },
        handle: async (args) => {
            const blocklist = (args['blocklist'] as boolean | undefined) ?? false;
            const skipRedownload = (args['skipRedownload'] as boolean | undefined) ?? false;
            return sonarrDelete(`/queue/${args['queueId']}?removeFromClient=true&blocklist=${blocklist}&skipRedownload=${skipRedownload}`);
        }
    },
    {
        name: 'sonarr_interactive_search',
        description: 'List all available releases for an episode from every indexer — like Sonarr\'s Interactive Search UI. Returns release name, quality, size, seeders, indexer, and release group for each result.',
        inputSchema: {
            type: 'object',
            properties: {
                episodeId: {type: 'number', description: 'Episode id from sonarr_get_episode'}
            },
            required: ['episodeId']
        },
        handle: async (args) => {
            const releases = await sonarrGet(`/release?episodeId=${args['episodeId']}`) as Record<string, unknown>[];
            return releases.filter((r) => !r['rejected']);
        }
    },
    {
        name: 'sonarr_grab_release',
        description: 'Grab a specific release from interactive search results and send it to the download client.',
        inputSchema: {
            type: 'object',
            properties: {
                guid: {type: 'string', description: 'Release guid from sonarr_interactive_search'},
                indexerId: {type: 'number', description: 'Indexer id from sonarr_interactive_search'}
            },
            required: ['guid', 'indexerId']
        },
        handle: async (args) => sonarrPost('/release', {guid: args['guid'], indexerId: args['indexerId']})
    }
];
