import {App, PostMessageTransport} from '@modelcontextprotocol/ext-apps';

interface Release {
    t: string;
    q: string;
    s: number;
    se: number;
    rg: string;
    idx: string;
    g: string;
    iid: number;
    p: 'torrent' | 'usenet';
    rej?: string[];
}

function fmtSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + ' GB';
    if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(0) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
}

function renderLoading(): void {
    document.body.innerHTML = '<div id="loading">Searching releases…</div>';
}

function renderError(msg: string): void {
    document.body.innerHTML = `<div id="error">Error: ${msg}</div>`;
}

function renderTable(releases: Release[]): void {
    if (!releases.length) {
        document.body.innerHTML = '<div id="error">No releases found.</div>';
        return;
    }

    const rows = releases.map((r, i) => {
        const proto = r.p === 'torrent'
            ? `<span class="proto-badge proto-torrent">TRK</span>`
            : `<span class="proto-badge proto-usenet">NZB</span>`;
        const seeds = r.p === 'torrent' ? r.se : '—';
        const rejected = r.rej
            ? ` title="${escHtml(r.rej.join(', '))}" style="opacity:.45"`
            : '';
        return `
        <tr data-idx="${i}"${rejected}>
            <td class="title" title="${escHtml(r.t)}">${escHtml(r.t)}</td>
            <td>${escHtml(r.q)}</td>
            <td>${fmtSize(r.s)}</td>
            <td class="muted">${seeds}</td>
            <td class="muted">${escHtml(r.rg ?? '?')}</td>
            <td class="muted">${escHtml(r.idx ?? '?')}</td>
            <td>${proto}</td>
            <td><button class="grab" data-idx="${i}">Grab</button></td>
        </tr>`;
    }).join('');

    document.body.innerHTML = `
        <div id="count">${releases.length} release${releases.length === 1 ? '' : 's'}</div>
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Quality</th>
                    <th>Size</th>
                    <th>Seeds</th>
                    <th>Group</th>
                    <th>Indexer</th>
                    <th>Proto</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;

    document.querySelectorAll<HTMLButtonElement>('button.grab').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset['idx'] ?? '0', 10);
            void handleGrab(releases[idx], btn);
        });
    });
}

async function handleGrab(release: Release, btn: HTMLButtonElement): Promise<void> {
    const td = btn.parentElement!;
    btn.disabled = true;
    btn.textContent = '…';
    try {
        await connectionReady;
        await app.callServerTool({
            name: 'radarr_grab_release',
            arguments: {guid: release.g, indexerId: release.iid},
        });
        td.innerHTML = '<span class="grab-ok">✓ Grabbed</span>';
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        td.innerHTML = `<span class="grab-err">${escHtml(msg)}</span>`;
    }
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const app = new App({name: 'radarr-releases', version: '1.0.0'}, {});
let connectionReady: Promise<void>;

app.ontoolinput = () => {
    renderLoading();
};

app.ontoolresult = (params) => {
    if (params.isError) {
        const text = Array.isArray(params.content) && params.content[0]
            ? String((params.content[0] as {text?: string}).text ?? params.content[0])
            : 'Unknown error';
        renderError(text);
        return;
    }
    try {
        const block = params.content[0] as {text?: string} | undefined;
        const text = block?.text ?? '';
        const releases = JSON.parse(text) as Release[];
        renderTable(releases);
    } catch (err: unknown) {
        renderError('Failed to parse releases: ' + (err instanceof Error ? err.message : String(err)));
    }
};

app.onhostcontextchanged = (ctx) => {
    document.documentElement.dataset['theme'] = (ctx as {theme?: string}).theme ?? 'light';
};

connectionReady = app.connect(new PostMessageTransport(window.parent, window.parent));
