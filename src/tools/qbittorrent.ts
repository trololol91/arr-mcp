import {qbtGet, qbtPost} from '../services/qbittorrent.js';
import type {ToolModule} from './types.js';

export const qbtTools: ToolModule[] = [
    {
        name: 'qbt_list_torrents',
        description: 'List all torrents with their state, download speed, upload speed, and seed count.',
        inputSchema: {
            type: 'object',
            properties: {
                filter: {
                    type: 'string',
                    description: 'Filter by state: all, downloading, seeding, completed, paused, stalled, error (default: all)'
                }
            }
        },
        handle: async (args) => {
            const filter = (args['filter'] as string | undefined) ?? 'all';
            return qbtGet(`/api/v2/torrents/info?filter=${filter}`);
        }
    },
    {
        name: 'qbt_delete_torrent',
        description: 'Delete a torrent from qBittorrent. Optionally delete the downloaded files from disk.',
        inputSchema: {
            type: 'object',
            properties: {
                hash: {type: 'string', description: 'Torrent hash from qbt_list_torrents'},
                deleteFiles: {type: 'boolean', description: 'Also delete downloaded files from disk (default: false)'}
            },
            required: ['hash']
        },
        handle: async (args) => {
            const params = new URLSearchParams({
                hashes: String(args['hash']),
                deleteFiles: String((args['deleteFiles'] as boolean | undefined) ?? false)
            });
            return qbtPost('/api/v2/torrents/delete', params);
        }
    },
    {
        name: 'qbt_sync_vpn_port',
        description: 'Read the current VPN forwarded port from gluetun and update qBittorrent listen port to match. Run this if downloads are stalled after a VPN reconnect.',
        inputSchema: {type: 'object', properties: {}},
        handle: async () => {
            const portFile = '/tmp/gluetun/forwarded_port';
            const {readFile} = await import('node:fs/promises');
            let port: number;
            try {
                const raw = await readFile(portFile, 'utf-8');
                port = parseInt(raw.trim(), 10);
                if (isNaN(port)) throw new Error(`Invalid port in ${portFile}: ${raw}`);
            } catch (err) {
                throw new Error(`Could not read gluetun forwarded port: ${String(err)}`);
            }
            const params = new URLSearchParams({
                json: JSON.stringify({listen_port: port, random_port: false, upnp: false})
            });
            await qbtPost('/api/v2/app/setPreferences', params);
            return {updated: true, listen_port: port};
        }
    },
    {
        name: 'qbt_add_torrent',
        description: 'Add a torrent to qBittorrent via magnet link or torrent URL.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {type: 'string', description: 'Magnet link (magnet:?xt=...) or URL to a .torrent file'},
                savePath: {type: 'string', description: 'Download destination path. Omit to use qBittorrent default.'},
                category: {type: 'string', description: 'Category label to assign (optional)'},
                paused: {type: 'boolean', description: 'Add in paused state (default: false)'}
            },
            required: ['url']
        },
        handle: async (args) => {
            const params = new URLSearchParams({urls: String(args['url'])});
            if (args['savePath']) params.set('savepath', String(args['savePath']));
            if (args['category']) params.set('category', String(args['category']));
            if (args['paused'] === true) params.set('paused', 'true');
            return qbtPost('/api/v2/torrents/add', params);
        }
    }
];
