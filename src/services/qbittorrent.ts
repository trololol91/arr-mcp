const baseUrl = (): string => process.env.QBT_URL ?? 'http://gluetun:9081';

const qbtFetch = async (method: string, path: string, body?: URLSearchParams): Promise<unknown> => {
    const url = `${baseUrl()}${path}`;
    const res = await fetch(url, {
        method,
        headers: body ? {'Content-Type': 'application/x-www-form-urlencoded'} : {},
        body: body?.toString()
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`qBittorrent ${method} ${path} → ${res.status}: ${text}`);
    }
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return text || null;
    }
};

export const qbtGet = (path: string): Promise<unknown> => qbtFetch('GET', path);
export const qbtPost = (path: string, body: URLSearchParams): Promise<unknown> => qbtFetch('POST', path, body);

export const initQbtSubnetWhitelist = async (): Promise<void> => {
    try {
        const params = new URLSearchParams({
            json: JSON.stringify({
                bypass_auth_subnet_whitelist: '172.28.0.0/16',
                bypass_auth_subnet_whitelist_enabled: true
            })
        });
        await qbtPost('/api/v2/app/setPreferences', params);
        console.error('[arr-mcp] qBittorrent subnet whitelist enabled for arr-net');
    } catch (err) {
        console.error('[arr-mcp] Failed to set qBittorrent subnet whitelist:', err);
    }
};
