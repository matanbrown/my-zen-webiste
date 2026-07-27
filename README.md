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

## Adding photos

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
