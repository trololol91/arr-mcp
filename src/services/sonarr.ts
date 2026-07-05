const baseUrl = (): string => process.env.SONARR_URL ?? 'http://sonarr:8989';
const apiKey = (): string => {
    const key = process.env.SONARR_API_KEY;
    if (!key) throw new Error('SONARR_API_KEY is not set');
    return key;
};

const sonarrFetch = async (method: string, path: string, body?: unknown): Promise<unknown> => {
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
        throw new Error(`Sonarr ${method} ${path} → ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
};

export const sonarrGet = (path: string): Promise<unknown> => sonarrFetch('GET', path);
export const sonarrPost = (path: string, body: unknown): Promise<unknown> => sonarrFetch('POST', path, body);
export const sonarrPut = (path: string, body: unknown): Promise<unknown> => sonarrFetch('PUT', path, body);
export const sonarrDelete = (path: string, body?: unknown): Promise<unknown> => sonarrFetch('DELETE', path, body);
