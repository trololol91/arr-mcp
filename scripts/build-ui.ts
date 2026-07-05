import {build} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';
import {resolve} from 'node:path';

const root = process.cwd();
const apps = ['sonarr-releases', 'radarr-releases', 'seerr-discover', 'anilist'] as const;

for (const app of apps) {
    await build({
        root: resolve(root, `ui/${app}`),
        plugins: [viteSingleFile()],
        build: {
            rollupOptions: {input: resolve(root, `ui/${app}/index.html`)},
            outDir: resolve(root, `dist/ui/${app}`),
            emptyOutDir: true,
        },
    });
}
