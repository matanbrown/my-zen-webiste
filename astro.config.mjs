// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeExternalLinks from 'rehype-external-links';

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
  markdown: {
    // Any external link written in content markdown (poems, practices,
    // inspirations, lessons, retreats bodies) opens in a new tab, so people
    // never accidentally navigate away from the site. Internal links
    // (relative paths, or matanbrown.com itself) are left alone.
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: '_blank',
          rel: ['noopener', 'noreferrer'],
          content: { type: 'text', value: ' ↗' },
        },
      ],
    ],
  },
});
