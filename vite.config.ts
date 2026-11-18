import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const release = {
  version: JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
  buildId: process.env.RELEASE_ID || randomUUID(),
  channel: process.env.RELEASE_CHANNEL || (process.env.AWS_BRANCH === 'main' ? 'stable' : 'preview'),
  builtAt: new Date().toISOString(),
  draftVersion: 2
};
if (!['stable', 'preview'].includes(release.channel)) throw new Error('RELEASE_CHANNEL must be stable or preview');
export default defineConfig({
  define: { __APP_RELEASE__: JSON.stringify(release) },
  plugins: [react(), { name: 'release-manifest', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'release.json', source: JSON.stringify(release) });
  } }],
  // Third-party libraries change far less often than app code, so ship them as separate,
  // long-cached chunks instead of one large bundle.
  build: {
  // The ~300 service icons are glob-imported eagerly; inlined as base64 they made up most of
  // the main bundle. Serve them as cached files fetched only when an icon is displayed.
  assetsInlineLimit: filePath => filePath.includes('/serviceIcon/') ? false : undefined,
  rollupOptions: { output: { manualChunks: id => {
    if (!id.includes('node_modules')) return undefined;
    if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
    if (id.includes('@xyflow') || id.includes('d3-')) return 'xyflow';
    if (id.includes('lucide-react')) return 'icons';
    return 'vendor';
  } } } },
  server: { port: 5173, host: true }
});
