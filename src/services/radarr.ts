const baseUrl = (): string => process.env.RADARR_URL ?? 'http://radarr:7878';
const apiKey = (): string => {
    const key = process.env.RADARR_API_KEY;
    if (!key) throw new Error('RADARR_API_KEY is not set');
    return key;
};

const radarrFetch = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const url = `${baseUrl()}/api/v3${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            'X-Api-Key': apiKey(),
            'Content-Type': 'application/json'
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Radarr ${method} ${path} → ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
};

export const radarrGet = (path: string): Promise<unknown> => radarrFetch('GET', path);
export const radarrPost = (path: string, body: unknown): Promise<unknown> => radarrFetch('POST', path, body);
export const radarrDelete = (path: string): Promise<unknown> => radarrFetch('DELETE', path);
