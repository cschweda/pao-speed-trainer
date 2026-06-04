import { defineConfig } from 'astro/config';
import alpinejs from '@astrojs/alpinejs';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [alpinejs({ entrypoint: '/src/entrypoint' })],
  vite: {
    plugins: [tailwindcss()],
  },
});
