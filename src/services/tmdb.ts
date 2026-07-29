const BASE = 'https://api.themoviedb.org/3';

const apiKey = (): string => {
    const key = process.env.TMDB_API_KEY;
    if (!key) throw new Error('TMDB_API_KEY is not set');
    return key;
};

export const tmdbGet = async (path: string, params: Record<string, string> = {}): Promise<unknown> => {
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('api_key', apiKey());
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`TMDB GET ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<unknown>;
};

type Genre = {id: number; name: string};
type GenreCache = {genres: Genre[]; ts: number};

const movieGenreCache: GenreCache = {genres: [], ts: 0};
const tvGenreCache: GenreCache = {genres: [], ts: 0};
const CACHE_TTL = 24 * 60 * 60 * 1000;

const getGenres = async (mediaType: 'movie' | 'tv'): Promise<Genre[]> => {
    const cache = mediaType === 'movie' ? movieGenreCache : tvGenreCache;
    if (cache.genres.length > 0 && Date.now() - cache.ts < CACHE_TTL) return cache.genres;
    const data = await tmdbGet(`/genre/${mediaType}/list`) as {genres: Genre[]};
    cache.genres = data.genres;
    cache.ts = Date.now();
    return cache.genres;
};

export const resolveGenreIds = async (mediaType: 'movie' | 'tv', names: string[]): Promise<number[]> => {
    const genres = await getGenres(mediaType);
    const nameMap = new Map(genres.map((g) => [g.name.toLowerCase(), g.id]));
    return names.map((n) => nameMap.get(n.toLowerCase())).filter((id): id is number => id !== undefined);
};

export const resolveGenreNames = async (mediaType: 'movie' | 'tv', ids: number[]): Promise<string[]> => {
    const genres = await getGenres(mediaType);
    const idMap = new Map(genres.map((g) => [g.id, g.name]));
    return ids.map((id) => idMap.get(id) ?? String(id));
};

type WatchProvider = {provider_id: number; provider_name: string};
type WatchProviderCache = {providers: WatchProvider[]; ts: number};

const providerCache = new Map<string, WatchProviderCache>();

const getWatchProviders = async (mediaType: 'movie' | 'tv', watchRegion: string): Promise<WatchProvider[]> => {
    const cacheKey = `${mediaType}:${watchRegion}`;
    const cached = providerCache.get(cacheKey);
    if (cached && cached.providers.length > 0 && Date.now() - cached.ts < CACHE_TTL) return cached.providers;
    const data = await tmdbGet(`/watch/providers/${mediaType}`, {watch_region: watchRegion}) as {results: WatchProvider[]};
    providerCache.set(cacheKey, {providers: data.results, ts: Date.now()});
    return data.results;
};

export const resolveWatchProviderIds = async (mediaType: 'movie' | 'tv', names: string[], watchRegion = 'US'): Promise<number[]> => {
    const providers = await getWatchProviders(mediaType, watchRegion);
    const nameMap = new Map(providers.map((p) => [p.provider_name.toLowerCase(), p.provider_id]));
    return names.map((n) => nameMap.get(n.toLowerCase())).filter((id): id is number => id !== undefined);
};
