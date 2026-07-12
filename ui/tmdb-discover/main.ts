import {App, PostMessageTransport} from '@modelcontextprotocol/ext-apps';

interface DiscoverItem {
    mid: number;
    mt: 'm' | 't';
    ti: string;
    yr: number;
    po?: string | null;
    ov?: string | null;
    st?: number | null;
}

interface PageData {
    type: string;
    page: number;
    totalPages: number;
    items: DiscoverItem[];
}

interface Ratings {
    rt?: {criticsRating?: string; criticsScore?: number; audienceRating?: string; audienceScore?: number; url?: string};
    imdb?: {criticsScore?: number; url?: string};
    // TV-only (returns RT shape directly)
    criticsRating?: string;
    criticsScore?: number;
    audienceRating?: string;
    audienceScore?: number;
}

// MediaStatus: 1=unknown, 2=pending, 3=processing, 4=partial, 5=available
function statusBadge(st: number | null | undefined): string {
    switch (st) {
        case 5: return '<span class="badge badge-available">Available</span>';
        case 4: return '<span class="badge badge-available">Partial</span>';
        case 3: return '<span class="badge badge-processing">Processing</span>';
        case 2: return '<span class="badge badge-pending">Pending</span>';
        default: return '';
    }
}

function canRequest(st: number | null | undefined): boolean {
    return !st || st === 1 || st === 4;
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rtScoreHtml(score: number | undefined, rating: string | undefined): string {
    if (score === undefined && !rating) return '';
    const cls = rating === 'Certified Fresh' ? 'rt-certified' : (score !== undefined ? score >= 60 : rating === 'Fresh') ? 'rt-fresh' : 'rt-rotten';
    const icon = rating === 'Certified Fresh' ? '🍅✓' : rating === 'Fresh' || (score !== undefined && score >= 60) ? '🍅' : '🤢';
    const label = score !== undefined ? `${score}%` : rating ?? '';
    return `<span class="${cls}">${icon} ${label}</span>`;
}

function popcornScoreHtml(score: number | undefined, rating: string | undefined): string {
    if (score === undefined) return '';
    const cls = rating === 'Upright' || score >= 60 ? 'rt-popcorn-fresh' : 'rt-popcorn-spilled';
    return `<span class="${cls}">🍿 ${score}%</span>`;
}

function renderRatings(r: Ratings): string {
    const rt = r.rt ?? (r.criticsScore !== undefined || r.audienceScore !== undefined || r.criticsRating ? r : undefined);
    const imdb = r.imdb;
    const parts: string[] = [];
    if (rt) {
        parts.push(rtScoreHtml(rt.criticsScore, rt.criticsRating));
        if (rt.audienceScore !== undefined) parts.push(popcornScoreHtml(rt.audienceScore, rt.audienceRating));
    }
    if (imdb?.criticsScore) parts.push(`<span class="rt-imdb">IMDb ${imdb.criticsScore}</span>`);
    return parts.length ? `<div class="rt-scores">${parts.join('')}</div>` : '<span class="req-err">Not found</span>';
}

function renderCards(items: DiscoverItem[], container: HTMLElement): void {
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'card';

        const poster = item.po
            ? `<img class="poster" src="${escHtml(item.po)}" alt="" loading="lazy">`
            : `<div class="poster-placeholder">🎬</div>`;

        card.innerHTML = `
            ${poster}
            <div class="info">
                <div class="title" title="${escHtml(item.ti)}">${escHtml(item.ti)}</div>
                <div class="meta">${item.yr} · ${item.mt === 'm' ? 'Movie' : 'TV'}</div>
                ${item.ov ? `<div class="overview">${escHtml(item.ov)}${item.ov.length >= 150 ? ` <button class="overview-more">···</button>` : ''}</div>` : ''}
                <div class="actions">
                    ${statusBadge(item.st)}
                    <button class="btn-rt">Ratings</button>
                    ${canRequest(item.st) ? `<button class="req">Request</button>` : ''}
                </div>
            </div>`;

        const moreBtn = card.querySelector<HTMLButtonElement>('button.overview-more');
        if (moreBtn) moreBtn.addEventListener('click', () => void handleExpandOverview(item, moreBtn));

        const rtBtn = card.querySelector<HTMLButtonElement>('button.btn-rt');
        if (rtBtn) rtBtn.addEventListener('click', () => void handleLoadRatings(item, rtBtn));

        const reqBtn = card.querySelector<HTMLButtonElement>('button.req');
        if (reqBtn) reqBtn.addEventListener('click', () => void handleRequest(item, reqBtn));

        container.appendChild(card);
    }
}

async function handleExpandOverview(item: DiscoverItem, btn: HTMLButtonElement): Promise<void> {
    btn.textContent = '…';
    btn.disabled = true;
    try {
        await connectionReady;
        const result = await app.callServerTool({
            name: 'seerr_get_overview',
            arguments: {tmdbId: item.mid, mediaType: item.mt === 'm' ? 'movie' : 'tv'},
        });
        const block = (result as {content?: Array<{text?: string}>}).content?.[0];
        const overview = block?.text ?? '';
        const ovEl = btn.closest('.overview')!;
        ovEl.textContent = overview;
    } catch {
        btn.textContent = '···';
        btn.disabled = false;
    }
}

async function handleLoadRatings(item: DiscoverItem, btn: HTMLButtonElement): Promise<void> {
    btn.textContent = '…';
    btn.disabled = true;
    try {
        await connectionReady;
        const result = await app.callServerTool({
            name: 'seerr_get_ratings',
            arguments: {tmdbId: item.mid, mediaType: item.mt === 'm' ? 'movie' : 'tv'},
        });
        const block = (result as {content?: Array<{text?: string}>}).content?.[0];
        const ratings = JSON.parse(block?.text ?? '{}') as Ratings;
        btn.replaceWith(document.createRange().createContextualFragment(renderRatings(ratings)));
    } catch {
        btn.replaceWith(document.createRange().createContextualFragment('<span class="req-err">No ratings</span>'));
    }
}

async function handleRequest(item: DiscoverItem, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    btn.textContent = '…';
    try {
        await connectionReady;
        await app.callServerTool({
            name: 'seerr_request_by_tmdb',
            arguments: {tmdbId: item.mid, mediaType: item.mt === 'm' ? 'movie' : 'tv'},
        });
        const actions = btn.parentElement!;
        actions.innerHTML = '<span class="req-ok">✓ Requested</span>';
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        btn.disabled = false;
        btn.textContent = 'Request';
        const errSpan = document.createElement('span');
        errSpan.className = 'req-err';
        errSpan.textContent = msg;
        btn.parentElement!.appendChild(errSpan);
    }
}

let currentType = '';
let currentPage = 1;
let totalPages = 1;
let currentFilters: Record<string, unknown> = {};
let grid: HTMLElement | null = null;

const SORT_OPTIONS = [
    {label: 'Popular', value: 'popularity.desc'},
    {label: 'Top Rated', value: 'vote_average.desc'},
    {label: 'Newest', value: 'primary_release_date.desc'},
];

function currentSortValue(): string {
    return (currentFilters['sort_by'] as string | undefined) ?? 'popularity.desc';
}

function initGrid(): void {
    const supportsFilters = currentType !== 'trending';
    const sortBtns = SORT_OPTIONS.map((o) =>
        `<button class="sort-btn${currentSortValue() === o.value ? ' active' : ''}" data-sort="${o.value}">${o.label}</button>`
    ).join('');
    const filterBar = supportsFilters ? `
        <div id="filter-bar">
            <span class="filter-label">Sort:</span>${sortBtns}
            <span class="filter-label" style="margin-left:4px">Rating ≥</span>
            <input id="f-rating" class="filter-input" type="number" min="0" max="10" step="0.5"
                value="${currentFilters['min_rating'] ?? ''}" placeholder="—">
            <span class="filter-label">Excl. genres</span>
            <input id="f-genres" class="filter-input" type="text"
                value="${((currentFilters['exclude_genres'] as string[] | undefined) ?? []).join(', ')}"
                placeholder="Animation, Horror…">
            <button id="f-apply">Apply</button>
        </div>` : '';

    document.body.innerHTML = `${filterBar}<div class="grid"></div><div id="footer"></div>`;
    grid = document.querySelector('.grid')!;

    if (supportsFilters) {
        document.querySelectorAll<HTMLButtonElement>('button.sort-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.dataset['sort'] === currentSortValue()) return;
                currentFilters['sort_by'] = btn.dataset['sort'];
                document.querySelectorAll('button.sort-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                void refetchFiltered();
            });
        });
        document.getElementById('f-apply')!.addEventListener('click', () => {
            const rating = parseFloat((document.getElementById('f-rating') as HTMLInputElement).value);
            const genreText = (document.getElementById('f-genres') as HTMLInputElement).value.trim();
            currentFilters['min_rating'] = isNaN(rating) ? undefined : rating;
            currentFilters['exclude_genres'] = genreText
                ? genreText.split(',').map((s) => s.trim()).filter(Boolean)
                : undefined;
            void refetchFiltered();
        });
    }
}

async function refetchFiltered(): Promise<void> {
    if (!grid) return;
    grid.innerHTML = '<div style="padding:8px 0;color:var(--text2)">Loading…</div>';
    const footer = document.getElementById('footer');
    if (footer) footer.innerHTML = '';
    try {
        await connectionReady;
        const result = await app.callServerTool({
            name: 'tmdb_discover_page',
            arguments: {type: currentType, page: 1, ...currentFilters},
        });
        const res = result as {content?: Array<{text?: string}>; isError?: boolean};
        if (res.isError) throw new Error(res.content?.[0]?.text ?? 'Tool error');
        const data = JSON.parse(res.content?.[0]?.text ?? '{}') as PageData;
        currentPage = data.page;
        totalPages = data.totalPages;
        grid!.innerHTML = '';
        renderCards(data.items, grid!);
        updateFooter();
    } catch {
        if (grid) grid.innerHTML = '<div style="color:var(--error)">Failed to load</div>';
    }
}

function updateFooter(): void {
    const footer = document.getElementById('footer')!;
    if (currentPage < totalPages) {
        footer.innerHTML = `<button id="load-more">Load more (${currentPage}/${totalPages})</button>`;
        document.getElementById('load-more')!.addEventListener('click', () => void loadMore());
    } else {
        footer.innerHTML = '';
    }
}

async function loadMore(): Promise<void> {
    const btn = document.getElementById('load-more') as HTMLButtonElement;
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
        await connectionReady;
        const result = await app.callServerTool({
            name: 'tmdb_discover_page',
            arguments: {type: currentType, page: currentPage + 1, ...currentFilters},
        });
        const block = (result as {content?: Array<{text?: string}>}).content?.[0];
        const data = JSON.parse(block?.text ?? '{}') as PageData;
        currentPage = data.page;
        totalPages = data.totalPages;
        renderCards(data.items, grid!);
        updateFooter();
    } catch {
        if (btn) { btn.disabled = false; btn.textContent = 'Load more'; }
    }
}

const app = new App({name: 'tmdb-discover', version: '1.0.0'}, {});
let connectionReady: Promise<void>;

app.ontoolinput = (params) => {
    const args = params.arguments as Record<string, unknown> | undefined ?? {};
    const {page: _page, ...filters} = args;
    currentFilters = filters;
    document.body.innerHTML = '<div id="loading">Loading…</div>';
};

app.ontoolresult = (params) => {
    try {
        const block = params.content[0] as {text?: string} | undefined;
        const data = JSON.parse(block?.text ?? '{}') as PageData;
        currentType = data.type;
        currentPage = data.page;
        totalPages = data.totalPages;
        initGrid();
        renderCards(data.items, grid!);
        updateFooter();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        document.body.innerHTML = `<div id="error">Failed to load: ${escHtml(msg)}</div>`;
    }
};

if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset['theme'] = 'dark';
}

app.onhostcontextchanged = (ctx) => {
    const theme = (ctx as {theme?: string}).theme;
    if (theme) document.documentElement.dataset['theme'] = theme;
};

connectionReady = app.connect(new PostMessageTransport(window.parent, window.parent));
