## Project context — read this first

Personal Zen practice site for Matan. Astro static site → Cloudflare Pages
(direct-upload via wrangler in GitHub Actions, not Cloudflare's git
integration — see `.github/workflows/deploy.yml`). Full context also lives
in `README.md` (setup steps) and `infra/cloudflare.tf` (the Cloudflare
resources, Terraform).

### Content collections (`src/content.config.ts`)

Each collection is a folder of `.md` files with frontmatter, loaded via
`glob()`. Current collections: `lessons`, `poems`, `retreats`,
`inspirations`, `practices` — each has an English mirror (`lessonsEn`,
`poemsEn`, etc.) sourced from `src/content/en/<n>/` instead of
`src/content/<n>/`. **English mirrors must use the exact same
filename/slug as their Hebrew counterpart** — the language switcher in
`BaseLayout.astro` maps `/x/slug/` ↔ `/en/x/slug/` by string-prefixing
`/en`, not by any per-entry mapping field. If you ever add a collection
entry in one language, add the matching one (even a placeholder) in the
other, with the same filename.

`poems` schema has optional `author`/`translator`/`source`/`externalUrl` —
these exist for reproducing *other people's* short quotes/poems (e.g. the
Szymborska entry) without violating copyright: paraphrase the surrounding
text, keep any direct quote under ~15 words, one quote per source, link
out via `externalUrl` instead of reproducing more.

### i18n (English site under `/en/`)

Manual routing, not Astro's built-in `i18n` config — every Hebrew page
under `src/pages/x/...` has a literal English twin under
`src/pages/en/x/...` that renders the `*En` collection instead. Same
pattern for every future page. `BaseLayout.astro` takes a `lang?: "he" |
"en"` prop (default `"he"`) which drives: `<html lang dir>`, the
`SITE_NAME` constant ("ללא מאמץ" / "Without Effort"), translated nav
labels, hreflang `<link>` tags, and the language-switcher link (computed
from `Astro.url.pathname`, so it only works correctly if routes really do
mirror 1:1 by path).

**Status: complete** as of the last session — `BaseLayout.astro` has the `lang` prop, translated nav, hreflang tags, and language switcher; `src/content/en/**` and `src/pages/en/**` both exist with a full 1:1 mirror of every Hebrew page/entry. Verified via `npm run build` (49 pages, 24 of them under `/en/`, sitemap confirms exact 1:1 parity). If you add a new page or collection entry, remember the rule above: add the English twin with the same filename/slug at the same time.

### Contact form (`/contact/`, `functions/api/contact.js`)

Cloudflare Pages Function, not a third-party form service. Verifies an
invisible Turnstile token + a honeypot field, then sends via Resend to
matan@matanbrown.com — that address is **only** in the Function, never in
any client-side code. Two secrets it needs (`TURNSTILE_SECRET_KEY`,
`RESEND_API_KEY`) are set via `wrangler pages secret put`, deliberately
**not** through Terraform or committed anywhere — see README for the
one-time setup steps. The Turnstile *site* key is public by design and is
hardcoded in `src/pages/contact/index.astro`.

### Other things worth knowing before touching anything

- GA (`G-EQ4Q50PXZF`) is wired into `BaseLayout.astro`'s `<head>`, gated
  behind `import.meta.env.PROD` so local `npm run dev` doesn't pollute
  analytics.
- `astro.config.mjs` has `site: 'https://zen.matanbrown.com'` set (needed
  for canonical URLs / OG tags / sitemap to resolve correctly) plus the
  `@astrojs/sitemap` integration.
- `infra/terraform.tfstate` and `infra/.terraform/` are gitignored (state
  can contain data in plaintext) — don't re-add them.
- Lots of content is still deliberate placeholder text ("(כאן יתווסף
  התוכן)" / "content to be added here", Lorem ipsum) waiting for Matan to
  write the real thing — don't treat placeholder content as something to
  "fix" unless asked.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
