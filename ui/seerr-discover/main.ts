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

function renderCards(items: DiscoverItem[], container: HTMLElement): void {
    for (const [i, item] of items.entries()) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset['idx'] = String(i);

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
                    ${canRequest(item.st)
                        ? `<button class="req">Request</button>`
                        : ''}
                </div>
            </div>`;

        const moreBtn = card.querySelector<HTMLButtonElement>('button.overview-more');
        if (moreBtn) {
            moreBtn.addEventListener('click', () => void handleExpandOverview(item, moreBtn));
        }

        const btn = card.querySelector<HTMLButtonElement>('button.req');
        if (btn) {
            btn.addEventListener('click', () => void handleRequest(item, btn));
        }

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
        const actions = btn.parentElement!;
        const errSpan = document.createElement('span');
        errSpan.className = 'req-err';
        errSpan.textContent = msg;
        actions.appendChild(errSpan);
    }
}

let currentType = '';
let currentPage = 1;
let totalPages = 1;
let grid: HTMLElement | null = null;

function initGrid(): void {
    document.body.innerHTML = '<div class="grid"></div><div id="footer"></div>';
    grid = document.querySelector('.grid')!;
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
            name: 'seerr_discover_page',
            arguments: {type: currentType, page: currentPage + 1},
        });
        const block = (result as {content?: Array<{text?: string}>}).content?.[0];
        const data = JSON.parse(block?.text ?? '{}') as PageData;
        currentPage = data.page;
        totalPages = data.totalPages;
        renderCards(data.items, grid!);
        updateFooter();
    } catch (err: unknown) {
        if (btn) { btn.disabled = false; btn.textContent = 'Load more'; }
    }
}

const app = new App({name: 'seerr-discover', version: '1.0.0'}, {});
let connectionReady: Promise<void>;

app.ontoolinput = () => {
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
