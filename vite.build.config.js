// Vite production-bundle config (plan #18). Separate from `vite.config.js`
// (which only configures vitest) so dev never needs Vite — the app
// continues to run as plain ES modules served by scq/server.py.
//
// Run with: npm run build
//
// What this bundles: the modular ES code under `src/ui/{database,scraper}/`
// and the cores it imports. Each entry becomes a single minified bundle
// in `dist/`. Inline `<script>` blocks in the HTML pages are NOT bundled
// — they live outside the module graph and continue to load directly.
// CDN-loaded scripts (sql.js, d3, pdf.js) are also not bundled; they
// still hit the CDN at runtime.
//
// The "package and ship" target is currently aspirational. This config
// is the baseline; later refactors that move the inline boot blocks
// into modules will get bundled automatically.
import { resolve } from 'node:path';

export default {
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        database: resolve('src/ui/database/main.js'),
        scraper: resolve('src/ui/scraper/main.js'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
};
