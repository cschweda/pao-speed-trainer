import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // The dev-toolbar overlay is dev-only and its chunk trips Vite's dep
  // re-optimization with a 504; it adds nothing here, so turn it off.
  devToolbar: { enabled: false },
  integrations: [alpinejs({ entrypoint: '/src/entrypoint' })],
  vite: {
    plugins: [tailwindcss()],
  },
});
