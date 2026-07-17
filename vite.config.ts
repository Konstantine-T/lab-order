import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
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
