import {randomUUID} from 'node:crypto';

import type {OAuthServerProvider} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {OAuthClientInformationFull, OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {AuthInfo} from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {Response} from 'express';

interface PendingCode {
    codeChallenge: string;
    expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const pendingCodes = new Map<string, PendingCode>();

export const createAuthorizationCode = (codeChallenge: string): string => {
    const code = randomUUID();
    pendingCodes.set(code, {codeChallenge, expiresAt: Date.now() + 5 * 60 * 1000});
    return code;
};

const authToken = (): string => {
    const t = process.env.MCP_AUTH_TOKEN;
    if (!t) throw new Error('MCP_AUTH_TOKEN is not set');
    return t;
};

export const createOAuthProvider = (): OAuthServerProvider => ({
    clientsStore: {
        getClient: (clientId: string) => clients.get(clientId),
        registerClient: (client: OAuthClientInformationFull) => {
            clients.set(client.client_id, client);
            return client;
        }
    },

    authorize: async (client: OAuthClientInformationFull, params, res: Response): Promise<void> => {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>arr-mcp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f0f13;color:#e2e2e2;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#1a1a24;border:1px solid #2a2a38;border-radius:12px;padding:32px;width:100%;max-width:360px}
    h1{font-size:18px;font-weight:600;margin-bottom:6px}
    p{font-size:13px;color:#888;margin-bottom:24px}
    input[type=password]{width:100%;padding:10px 12px;background:#0f0f13;border:1px solid #2a2a38;border-radius:6px;color:#e2e2e2;font-size:14px;outline:none;margin-bottom:16px}
    input[type=password]:focus{border-color:#5b5bd6}
    button{width:100%;padding:10px;background:#5b5bd6;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:500}
    button:hover{background:#6e6ede}
  </style>
</head>
<body>
  <div class="card">
    <h1>arr-mcp</h1>
    <p>Enter the access token to connect Claude.ai to your arr stack.</p>
    <form method="POST" action="/oauth/submit">
      <input type="hidden" name="client_id" value="${client.client_id}" />
      <input type="hidden" name="redirect_uri" value="${params.redirectUri}" />
      <input type="hidden" name="code_challenge" value="${params.codeChallenge}" />
      <input type="hidden" name="state" value="${params.state ?? ''}" />
      <input type="password" name="token" placeholder="Access token" required autofocus />
      <button type="submit">Connect</button>
    </form>
  </div>
</body>
</html>`;
        res.type('html').send(html);
    },

    challengeForAuthorizationCode: async (_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> => {
        const entry = pendingCodes.get(authorizationCode);
        if (!entry || entry.expiresAt < Date.now()) {
            throw new Error('Invalid or expired authorization code');
        }
        return entry.codeChallenge;
    },

    exchangeAuthorizationCode: async (_client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens> => {
        const entry = pendingCodes.get(authorizationCode);
        if (!entry || entry.expiresAt < Date.now()) {
            throw new Error('Invalid or expired authorization code');
        }
        pendingCodes.delete(authorizationCode);
        return {access_token: authToken(), token_type: 'bearer'};
    },

    exchangeRefreshToken: async (): Promise<OAuthTokens> => {
        return {access_token: authToken(), token_type: 'bearer'};
    },

    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
        if (token !== authToken()) {
            throw new Error('Invalid access token');
        }
        return {token, clientId: 'arr-mcp', scopes: []};
    }
});
