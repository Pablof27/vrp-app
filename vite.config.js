import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from /<repository>/; the dev server stays at the root.
  base: command === 'build' || isPreview ? '/vrp-app/' : '/',
}));
