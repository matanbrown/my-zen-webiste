// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://zen.matanbrown.com',
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'he',
        locales: {
          he: 'he-IL',
          en: 'en-US',
        },
      },
    }),
  ],
});
