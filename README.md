# zen.matanbrown.com

Personal Zen practice site — weekly lessons, poems/haiku, retreat stories, about.
Static site (Astro), served from S3 behind CloudFront.

## Adding content

Everything is a Markdown file with frontmatter — no database, no admin login needed
for text content:

- `src/content/lessons/*.md` — weekly lessons (`title`, `date`, `summary`,
  optional `audioUrl` / `videoUrl` for embedded recordings)
- `src/content/poems/*.md` — poems/haiku (`title`, `date`, `form`)
- `src/content/retreats/*.md` — retreat stories (`title`, `place`, `year`, `order`)
- `src/pages/about/index.astro` — about page (edit directly)

Push to `main` → GitHub Actions builds and deploys automatically.

## Local development

```
npm install
npm run dev
```

## Infrastructure (`infra/`)

Terraform for:
- `main.tf` — S3 (site + media buckets), CloudFront with Origin Access Control,
  ACM certificate, GitHub OIDC deploy role (no long-lived AWS keys in GitHub secrets)
- `drive-sync.tf` — scheduled Lambda that pulls new images from a shared Google
  Drive folder into the media S3 bucket

### One-time manual setup

1. **AWS**: have credentials for your personal account configured locally, then:
   ```
   cd infra
   terraform init
   terraform apply
   ```
2. **DNS (box.co.il)**: after apply, run `terraform output` and create:
   - the ACM validation CNAME record (from `acm_validation_records`)
   - a CNAME for `zen.matanbrown.com` → the CloudFront domain (from `cloudfront_domain_name`)
3. **GitHub secrets**: add `AWS_DEPLOY_ROLE_ARN` (from `github_actions_role_arn` output),
   `SITE_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`
4. **Google Drive sync**: create a GCP service account with Drive API access,
   share your upload folder with it, store the JSON key in Secrets Manager
   (see `infra/lambda/drive_sync/handler.py` docstring for exact steps), and
   set `drive_folder_id` in `infra/drive-sync.tf`
5. Package the Lambda with its dependencies before first apply:
   ```
   cd infra/lambda/drive_sync
   pip install -r requirements.txt -t .
   ```
