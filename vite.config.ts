import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { output: { manualChunks: id => id.includes('node_modules/@codemirror') || id.includes('node_modules/@lezer') || id.includes('node_modules/crelt') || id.includes('node_modules/style-mod') || id.includes('node_modules/w3c-keyname') ? 'editor' : id.includes('node_modules/react') || id.includes('node_modules/scheduler') ? 'react' : undefined } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 15000 },
});
