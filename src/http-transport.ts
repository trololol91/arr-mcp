import {createHash} from 'node:crypto';

import express from 'express';
import {mcpAuthRouter} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';

import {createMcpServer, validateAuthToken, TOOL_COUNT} from './server.js';
import {createOAuthProvider, createAuthorizationCode} from './oauth-provider.js';

const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionEntry {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    tokenHash: string;
    lastAccessedAt: number;
}

const extractBearerToken = (authHeader: string | undefined): string | null => {
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice('Bearer '.length).trim();
    return token || null;
};

export const startHttpServer = async (): Promise<void> => {
    const port = parseInt(process.env.MCP_PORT ?? '3000', 10);
    const issuerUrl = new URL(process.env.ISSUER_URL ?? `http://localhost:${port}`);

    const oauthProvider = createOAuthProvider();
    const sessions = new Map<string, SessionEntry>();

    const app = express();

    app.use(mcpAuthRouter({provider: oauthProvider, issuerUrl}));

    app.post('/oauth/submit', express.urlencoded({extended: false}), (req, res) => {
        const {token, redirect_uri, code_challenge, state} = req.body as Record<string, string>;

        const expected = process.env.MCP_AUTH_TOKEN;
        if (!token || !expected || token !== expected) {
            res.status(401).type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>arr-mcp</title></head>
<body style="font-family:system-ui;text-align:center;padding:48px;color:#c00">
<h2>Invalid token</h2><p><a href="javascript:history.back()">Try again</a></p>
</body></html>`);
            return;
        }

        const code = createAuthorizationCode(code_challenge);
        const callback = new URL(redirect_uri);
        callback.searchParams.set('code', code);
        if (state) callback.searchParams.set('state', state);
        res.redirect(302, callback.toString());
    });

    app.get('/health', (_req, res) => {
        res.json({status: 'ok', tools: TOOL_COUNT});
    });

    app.all('/mcp', async (req, res) => {
        const sessionId = req.method === 'POST' ? req.headers['mcp-session-id'] as string | undefined : undefined;
        console.error(`[arr-mcp] ${req.method} /mcp session=${sessionId ?? 'none'} auth=${req.headers.authorization ? 'yes' : 'NO'}`);

        const token = extractBearerToken(req.headers.authorization);
        if (!token) {
            res.status(401).json({error: 'Unauthorized'});
            return;
        }

        if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk as Buffer);
            }
            const bodyText = Buffer.concat(chunks).toString('utf-8');
            let parsedBody: unknown;
            try {
                parsedBody = bodyText ? JSON.parse(bodyText) : undefined;
            } catch {
                res.status(400).json({error: 'Invalid JSON'});
                return;
            }

            const sessionId = req.headers['mcp-session-id'] as string | undefined;

            if (sessionId && sessions.has(sessionId)) {
                const entry = sessions.get(sessionId)!;
                const requestTokenHash = createHash('sha256').update(token).digest('hex');
                if (requestTokenHash !== entry.tokenHash) {
                    res.status(400).json({jsonrpc: '2.0', error: {code: -32000, message: 'Bad Request: No valid session ID provided'}, id: null});
                    return;
                }
                entry.lastAccessedAt = Date.now();
                await entry.transport.handleRequest(req, res, parsedBody);
                return;
            }

            if (isInitializeRequest(parsedBody)) {
                if (!validateAuthToken(req.headers.authorization)) {
                    res.status(401).json({error: 'Unauthorized'});
                    return;
                }
                const tokenHash = createHash('sha256').update(token).digest('hex');
                // Deterministic session ID: same token → same ID after every restart.
                // Claude.ai gets the same session ID back after re-initializing, so it
                // never notices the container restarted.
                const deterministicSessionId = tokenHash.slice(0, 36);
                const newServer = createMcpServer();
                const newTransport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: (): string => deterministicSessionId,
                    onsessioninitialized: (newSessionId: string): void => {
                        sessions.set(newSessionId, {
                            server: newServer,
                            transport: newTransport,
                            tokenHash,
                            lastAccessedAt: Date.now()
                        });
                    }
                });
                newTransport.onclose = (): void => {
                    const sid = newTransport.sessionId;
                    if (sid) sessions.delete(sid);
                };
                await newServer.connect(newTransport);
                await newTransport.handleRequest(req, res, parsedBody);
                return;
            }

            if (sessionId) {
                res.status(404).json({jsonrpc: '2.0', error: {code: -32001, message: 'Session not found'}, id: null});
            } else {
                res.status(400).json({jsonrpc: '2.0', error: {code: -32000, message: 'Bad Request: No valid session ID provided'}, id: null});
            }
            return;
        }

        if (req.method === 'GET' || req.method === 'DELETE') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            if (!sessionId || !sessions.has(sessionId)) {
                res.status(404).json({error: 'Session not found'});
                return;
            }
            const entry = sessions.get(sessionId)!;
            const requestTokenHash = createHash('sha256').update(token).digest('hex');
            if (requestTokenHash !== entry.tokenHash) {
                res.status(400).json({error: 'Invalid or missing session ID'});
                return;
            }
            entry.lastAccessedAt = Date.now();
            await entry.transport.handleRequest(req, res);
            return;
        }

        res.status(405).json({error: 'Method Not Allowed'});
    });

    setInterval((): void => {
        const cutoff = Date.now() - SESSION_TTL_MS;
        for (const [sid, entry] of sessions) {
            if (entry.lastAccessedAt < cutoff) {
                sessions.delete(sid);
                entry.transport.close().catch(() => undefined);
            }
        }
    }, SESSION_TTL_MS).unref();

    await new Promise<void>((resolve, reject) => {
        app.listen(port, () => {
            console.error(`[arr-mcp] HTTP transport listening on port ${port}`);
            resolve();
        }).on('error', reject);
    });
};
