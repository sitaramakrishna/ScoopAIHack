/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['test/setup.ts'], // Add this line
    deps: {
      inline: [/@open-wc\/testing/, /jsdom/],
    },
  },
});
