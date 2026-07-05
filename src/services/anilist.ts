const ANILIST_URL = 'https://graphql.anilist.co';

export const anilistQuery = async (query: string, variables: Record<string, unknown> = {}): Promise<unknown> => {
    const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify({query, variables}),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AniList API error ${res.status}: ${text}`);
    }
    const json = await res.json() as {data: unknown; errors?: Array<{message: string}>};
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    return json.data;
};

export const currentSeason = (): {season: string; year: number} => {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    return {season, year};
};
