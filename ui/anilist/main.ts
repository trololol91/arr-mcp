import {App, PostMessageTransport} from '@modelcontextprotocol/ext-apps';

interface AnilistItem {
    id: number;
    ro: string;
    en: string | null;
    ep: number | null;
    sc: number | null;
    st: string | null;
    ss: string | null;
    ge: string[];
    su: string | null;
    dsc: string | null;
    img: string | null;
}

interface PageData {
    type: string;
    page: number;
    hasNextPage: boolean;
    items: AnilistItem[];
}

let currentType = '';
let currentPage = 1;
let hasNextPage = false;
let currentQuery: string | undefined;
let currentSeason: string | undefined;
let currentYear: number | undefined;
let grid: HTMLElement | null = null;

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreBadge(sc: number | null): string {
    if (!sc) return '';
    const cls = sc >= 75 ? 'score' : sc >= 60 ? 'score score-mid' : 'score score-low';
    return `<span class="${cls}">${sc}</span>`;
}

function statusBadge(st: string | null): string {
    if (st === 'RELEASING') return '<span class="badge-releasing">Airing</span>';
    return '';
}

function renderCards(items: AnilistItem[], container: HTMLElement): void {
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'card';

        const cover = item.img
            ? `<img class="cover" src="${escHtml(item.img)}" alt="" loading="lazy">`
            : `<div class="cover-placeholder">🎌</div>`;

        const displayTitle = item.en || item.ro;
        const subtitle = item.en ? `<div class="romaji">${escHtml(item.ro)}</div>` : '';

        const metaParts: string[] = [];
        if (item.ss) metaParts.push(item.ss);
        if (item.ep) metaParts.push(`${item.ep} eps`);
        if (item.su) metaParts.push(item.su);
        const meta = metaParts.length ? `<div class="meta">${escHtml(metaParts.join(' · '))}</div>` : '';

        const genres = item.ge.length
            ? `<div class="genres">${item.ge.map((g) => `<span class="genre">${escHtml(g)}</span>`).join('')}</div>`
            : '';

        const desc = item.dsc ? `<div class="overview">${escHtml(item.dsc)}</div>` : '';

        card.innerHTML = `
            ${cover}
            <div class="info">
                <div class="title" title="${escHtml(displayTitle)}">${escHtml(displayTitle)}</div>
                ${subtitle}
                ${meta}
                ${genres}
                ${desc}
                <div class="actions">
                    ${scoreBadge(item.sc)}
                    ${statusBadge(item.st)}
                    <button class="req">Request</button>
                </div>
            </div>`;

        const btn = card.querySelector<HTMLButtonElement>('button.req');
        if (btn) {
            btn.addEventListener('click', () => void handleRequest(item, btn));
        }

        container.appendChild(card);
    }
}

async function handleRequest(item: AnilistItem, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    btn.textContent = '…';
    try {
        await connectionReady;
        await app.callServerTool({
            name: 'seerr_request_by_title',
            arguments: {
                title: item.ro,
                ...(item.en ? {altTitle: item.en} : {}),
            },
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

function initGrid(): void {
    document.body.innerHTML = '<div class="grid"></div><div id="footer"></div>';
    grid = document.querySelector('.grid')!;
}

function updateFooter(): void {
    const footer = document.getElementById('footer')!;
    if (currentType !== 'search' && hasNextPage) {
        footer.innerHTML = `<button id="load-more">Load more (page ${currentPage})</button>`;
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
            name: 'anilist_ui_page',
            arguments: {
                type: currentType,
                page: currentPage + 1,
                ...(currentQuery ? {query: currentQuery} : {}),
                ...(currentSeason ? {season: currentSeason} : {}),
                ...(currentYear ? {year: currentYear} : {}),
            },
        });
        const block = (result as {content?: Array<{text?: string}>}).content?.[0];
        const data = JSON.parse(block?.text ?? '{}') as PageData;
        currentPage = data.page;
        hasNextPage = data.hasNextPage;
        renderCards(data.items, grid!);
        updateFooter();
    } catch {
        if (btn) { btn.disabled = false; btn.textContent = 'Load more'; }
    }
}

const app = new App({name: 'anilist-browser', version: '1.0.0'}, {});
let connectionReady: Promise<void>;

app.ontoolinput = (params) => {
    const args = params.arguments as Record<string, unknown> | undefined;
    currentQuery = args?.['query'] as string | undefined;
    currentSeason = args?.['season'] as string | undefined;
    currentYear = args?.['year'] as number | undefined;
    document.body.innerHTML = '<div id="loading">Loading…</div>';
};

app.ontoolresult = (params) => {
    try {
        const block = params.content[0] as {text?: string} | undefined;
        const data = JSON.parse(block?.text ?? '{}') as PageData;
        currentType = data.type;
        currentPage = data.page;
        hasNextPage = data.hasNextPage;
        initGrid();
        renderCards(data.items, grid!);
        updateFooter();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        document.body.innerHTML = `<div id="error">Failed to load: ${escHtml(msg)}</div>`;
    }
};

app.onhostcontextchanged = (ctx) => {
    document.documentElement.dataset['theme'] = (ctx as {theme?: string}).theme ?? 'light';
};

connectionReady = app.connect(new PostMessageTransport(window.parent, window.parent));
