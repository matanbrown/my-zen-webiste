# zen.matanbrown.com

Personal Zen practice site — weekly lessons, poems/haiku, retreat stories, about.
Static site (Astro), served from **Cloudflare Pages**, media in **Cloudflare R2**.
No AWS anywhere in this project.

## Adding content

Everything is a Markdown file with frontmatter — no database, no admin login needed
for text content:

- `src/content/lessons/*.md` — weekly lessons (`title`, `date`, `summary`,
  optional `audioUrl` / `videoUrl` for embedded recordings)
- `src/content/poems/*.md` — poems/haiku (`title`, `date`, `form`)
- `src/content/retreats/*.md` — retreat stories (`title`, `place`, `year`, `order`)
- `src/content/inspirations/*.md` — recommended external poems/works (short
  quote + attribution + link out — never the full copyrighted text)
- `src/pages/about/index.astro` — about page (edit directly)

Push to `main` → GitHub Actions builds and deploys to Cloudflare Pages automatically.

## Contact form

`/contact/` — sends to matan@matanbrown.com without ever putting that address
in any client-side code, so it can't be scraped by spam bots. Built from three
pieces:

- `src/pages/contact/index.astro` — the form (name, email, message, a hidden
  honeypot field, and an invisible Turnstile widget)
- `functions/api/contact.js` — Cloudflare Pages Function that verifies the
  Turnstile token + honeypot, then sends the email via the Resend API
- Two secrets the Function reads from its environment: `TURNSTILE_SECRET_KEY`,
  `RESEND_API_KEY` — never committed, never in Terraform state (see below)

### One-time setup for the contact form

1. **Turnstile widget**: Cloudflare dashboard → Turnstile → Add widget →
   domain `zen.matanbrown.com`, mode "Invisible". Copy the **Site Key** into
   `TURNSTILE_SITE_KEY` in `src/pages/contact/index.astro` (this one is public
   by design, safe to commit). Copy the **Secret Key** for step 3.
2. **Resend account**: sign up at resend.com, add and verify a sending domain
   (`zen.matanbrown.com` or `matanbrown.com` — add the DNS records Resend
   gives you in Cloudflare DNS). Create an API key.
3. **Set the two secrets on the Pages project** (not in git, not in
   Terraform — Pages secrets aren't something the `cloudflare` Terraform
   provider can manage safely, and this repo's `terraform.tfstate` isn't
   even gitignored, so keep real secrets out of it entirely):
   ```
   npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name=zen-matanbrown
   npx wrangler pages secret put RESEND_API_KEY --project-name=zen-matanbrown
   ```
   (paste each value when prompted). Redeploy afterwards for the Function to
   pick them up.

## Automated content drafting

Twice a week (Sun + Wed mornings, `.github/workflows/content-draft.yml`),
a GitHub Action drafts one new piece of content and opens a Pull Request
for review — it never publishes anything by itself.

**How it works:**
1. You add topics to `content-ideas.md`, one per line, under `## Queue`, in
   the order you want them written. Plain `topic text` drafts a lesson;
   prefix with `poem: ` to draft a poem/haiku instead.
2. On its schedule, the workflow takes the *first* line, calls the Claude
   API (`scripts/generate-content.mjs`) to write it in Hebrew + English,
   writes both files with `draft: true`, moves that line to `## Done`, and
   opens a PR with everything as one commit.
3. **You review the PR whenever it's convenient** — read the actual diff on
   GitHub (web or mobile), no need to be at this computer. Push further
   edits to the same branch if you want changes.
4. To actually publish: edit `draft: true` → `draft: false` in **both**
   files (Hebrew + English) on that branch, then merge the PR. Merging
   pushes to `main`, which triggers the normal deploy — so nothing goes
   live until you've both reviewed *and* flipped `draft` yourself. If you
   merge without flipping `draft`, the content sits in the repo but stays
   invisible on the site (exactly like any other draft).
5. Empty queue → the workflow just logs "nothing to do" and exits, no PR.

**Content types**: only `lesson` and `poem` are wired up — these are
the two collections meant for recurring/generated writing. `retreats` and
`inspirations` are first-person accounts of real experiences and real
people, so they're deliberately left out of automation; write those
yourself (or by chatting with Claude directly, same as everything else in
this README).

### One-time setup

1. Create an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add it as a GitHub secret: repo → Settings → Secrets and variables →
   Actions → New repository secret → name it `ANTHROPIC_API_KEY`
3. That's it — `contents: write` / `pull-requests: write` permissions and
   the `GH_TOKEN` for opening the PR are already handled inside the
   workflow via the built-in `github.token`, no extra secret needed there.

To test without waiting for the schedule: repo → **Actions** tab →
**Draft content** → **Run workflow**.

## Adding photos

Images live in R2 (`zen-matanbrown` bucket), served via a public custom
domain — never committed to git.

**One-time setup** (do this once, in the Cloudflare dashboard — not
Terraform; see `infra/cloudflare.tf` for why):
1. Cloudflare dashboard → R2 → bucket `zen-matanbrown` → **Settings** →
   **Public access** → **Custom Domains** → **Connect Domain**
2. Enter a domain, e.g. `media.matanbrown.com`. Cloudflare auto-creates the
   DNS record since the zone is already on Cloudflare.
3. Once connected, anything uploaded to the bucket is reachable at
   `https://media.matanbrown.com/<object-key>`.

**Uploading a single photo** (e.g. a portrait for an `inspirations` entry):
drag it straight into the bucket through the R2 dashboard's file browser —
no CLI needed for a one-off image. Then reference it in frontmatter as
`image: "https://media.matanbrown.com/<whatever-key-you-uploaded-as>.jpg"`.

**Bulk/ongoing photos** (e.g. lesson cover images synced from your phone):
1. Drop images into the shared Google Drive folder.
2. Go to the repo's **Actions** tab → **Sync Drive photos to R2** → **Run workflow**.
   It's manual-trigger only, run it whenever you've added new photos.

## Local development

```
npm install
npm run dev      # http://localhost:4321, hot reload
npm run build && npm run preview   # test the actual production build
```

Fully local — no Cloudflare account needed for this part.

## Infrastructure (`infra/`)

Terraform, Cloudflare provider only:

- `cloudflare.tf` — Pages project (direct-upload — GitHub Actions builds and
  pushes via `wrangler`; Cloudflare doesn't also auto-build from git, which
  would double-deploy), the R2 media bucket, and the custom domain / DNS record

### One-time manual setup

1. **Move DNS to Cloudflare**: add `matanbrown.com` as a site in Cloudflare,
   then update its nameservers at box.co.il to the ones Cloudflare gives you.
   (Alternative if you'd rather not move the whole domain: create just a
   `zen.matanbrown.com` CNAME at box.co.il pointing to the Pages subdomain
   from the `pages_subdomain` output, and skip the `cloudflare_record`
   resource / `cloudflare_zone_id` variable.)
2. **Cloudflare API token**: create one (My Profile → API Tokens) with
   `Cloudflare Pages: Edit`, `Workers R2 Storage: Edit`, `DNS: Edit` scopes.
   Export it as `CLOUDFLARE_API_TOKEN` locally before running Terraform.
3. ```
   cd infra
   terraform init
   terraform apply
   ```
4. **GitHub secrets** for deployment: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
5. **GitHub secrets** for the photo sync (see `scripts/drive_sync.py` docstring
   for exactly how to obtain each one):
   `GOOGLE_DRIVE_SA_JSON`, `DRIVE_FOLDER_ID`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

### Why no AWS

Cloudflare Pages + R2 have zero egress fees and free tiers that don't
expire — the right call for hosting and media on a low-traffic personal
site. The photo sync runs as a manual GitHub Actions job (free, unlimited
on a public repo) instead of a scheduled AWS Lambda, which would have cost
a few dollars a year in Secrets Manager fees for no real benefit at this scale.
