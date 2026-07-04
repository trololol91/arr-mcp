const baseUrl = (): string => process.env.SEERR_URL ?? 'http://seerr:5055';
const apiKey = (): string => {
    const key = process.env.SEERR_API_KEY;
    if (!key) throw new Error('SEERR_API_KEY is not set');
    return key;
};

const serrFetch = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const url = `${baseUrl()}/api/v1${path}`;
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
        throw new Error(`Seerr ${method} ${path} → ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
};

export const serrGet = (path: string): Promise<unknown> => serrFetch('GET', path);
export const serrPost = (path: string, body: unknown): Promise<unknown> => serrFetch('POST', path, body);
