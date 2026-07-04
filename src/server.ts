import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';

import {sonarrTools} from './tools/sonarr.js';
import {radarrTools} from './tools/radarr.js';
import {qbtTools} from './tools/qbittorrent.js';
import {serrTools} from './tools/seerr.js';
import type {ToolModule} from './tools/types.js';

export const ALL_TOOLS: ToolModule[] = [
    ...sonarrTools,
    ...radarrTools,
    ...qbtTools,
    ...serrTools
];

export const createMcpServer = (): Server => {
    const server = new Server(
        {name: 'arr-mcp', version: '0.1.0'},
        {capabilities: {tools: {}}}
    );

    server.setRequestHandler(ListToolsRequestSchema, () =>
        Promise.resolve({
            tools: ALL_TOOLS.map(({name, description, inputSchema}) => ({name, description, inputSchema}))
        })
    );

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const {name, arguments: args = {}} = request.params;
        const tool = ALL_TOOLS.find((t) => t.name === name);
        if (!tool) {
            return {content: [{type: 'text', text: `Unknown tool: ${name}`}], isError: true};
        }
        try {
            const result = await tool.handle(args);
            return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}]};
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {content: [{type: 'text', text: message}], isError: true};
        }
    });

    return server;
};

export const validateAuthToken = (authHeader: string | undefined): boolean => {
    const expected = process.env.MCP_AUTH_TOKEN;
    if (!expected) throw new Error('MCP_AUTH_TOKEN is not set');
    if (!authHeader?.startsWith('Bearer ')) return false;
    const token = authHeader.slice('Bearer '.length).trim();
    return token === expected;
};
