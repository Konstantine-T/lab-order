import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Starts the visitor's language bundle downloading alongside the entry chunk.
 *
 * `src/i18n` loads one language (`src/i18n/bundles/<code>.ts`) and the first
 * render waits for it. Left alone, that request can only start once the entry
 * chunk has downloaded and run — one extra round trip before anything paints,
 * most of a second on a slow mobile connection. This injects a few lines into
 * the built `index.html` that pick the same language the detector will
 * (stored choice first, then the browser's languages; exact codes before
 * their language part; English otherwise) and `modulepreload` its hashed
 * file, so the later `import()` finds it already fetched.
 *
 * A wrong guess costs one unused download, never a wrong language: the app
 * still decides in `src/i18n`. Keep the storage key and the matching in step
 * with the `detection` options there. Build only; the dev server has no
 * hashed chunks.
 */
function preloadLanguageBundle(): Plugin {
  let base = '/';
  return {
    name: 'lab-order:preload-language-bundle',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files: Record<string, string> = {};
        for (const out of Object.values(ctx.bundle ?? {})) {
          const match =
            out.type === 'chunk' && out.facadeModuleId?.match(/\/src\/i18n\/bundles\/(\w+)\.ts$/);
          if (match) files[match[1]] = base + out.fileName;
        }
        if (!files.en) return;
        return [
          {
            tag: 'script',
            injectTo: 'head',
            children: `(function (files) {
  var codes = [], i, code, pick = null;
  try { var stored = localStorage.getItem('lab-order:lang'); if (stored) codes.push(stored); } catch (e) {}
  var langs = navigator.languages || [];
  for (i = 0; i < langs.length; i++) codes.push(langs[i]);
  if (navigator.language) codes.push(navigator.language);
  for (i = 0; i < codes.length && !pick; i++) { code = String(codes[i]).toLowerCase(); if (files[code]) pick = code; }
  for (i = 0; i < codes.length && !pick; i++) { code = String(codes[i]).toLowerCase().split('-')[0]; if (files[code]) pick = code; }
  var link = document.createElement('link');
  link.rel = 'modulepreload';
  link.crossOrigin = '';
  link.href = files[pick || 'en'];
  document.head.appendChild(link);
})(${JSON.stringify(files)});`,
          },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadLanguageBundle()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Allow Rove (phone) to load the preview via the Tailscale hostname.
    // Prefer pinning your exact tailnet host (Vite's host guard / DNS-rebinding
    // protection): set VITE_DEV_ALLOWED_HOST=my-mac.tailXXXX.ts.net in .env.
    // The bare-suffix fallback matches the whole shared .ts.net domain, so only
    // rely on it if you can't pin the host.
    allowedHosts: process.env.VITE_DEV_ALLOWED_HOST
      ? process.env.VITE_DEV_ALLOWED_HOST.split(',')
      : ['.ts.net'],
  },
});
