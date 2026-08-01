terraform {
  required_version = ">= 1.7"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (Dashboard -> right sidebar of any domain overview)"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Zone ID for matanbrown.com once its nameservers point at Cloudflare"
  type        = string
}

variable "domain_name" {
  type    = string
  default = "zen.matanbrown.com"
}

variable "r2_public_domain" {
  description = "Public custom domain for the R2 media bucket, e.g. media.matanbrown.com"
  type        = string
  default     = "media.matanbrown.com"
}

provider "cloudflare" {
  # Auth via CLOUDFLARE_API_TOKEN env var — see README for scopes needed.
}

# ---------------------------------------------------------------------------
# Pages — direct-upload project (deployed by GitHub Actions via wrangler).
# No S3 sync / CloudFront invalidation step needed: Cloudflare serves the
# site directly from its own edge network.
# ---------------------------------------------------------------------------

resource "cloudflare_pages_project" "site" {
  account_id        = var.cloudflare_account_id
  name              = "zen-matanbrown"
  production_branch = "main"

  # Direct-upload project: GitHub Actions builds and pushes the dist/
  # folder via wrangler (see .github/workflows/deploy.yml). This is
  # deliberate, not an oversight — a `source { type = "github" }` block
  # would make Cloudflare *also* auto-build on push, double-deploying
  # every commit.
}

resource "cloudflare_pages_domain" "custom" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  name         = var.domain_name
}

# cloudflare_record was renamed to cloudflare_dns_record in provider v5.
# Cloudflare auto-manages the DNS record for a Pages custom domain once the
# zone lives on Cloudflare, but declaring it explicitly keeps it visible
# and reproducible in state.
resource "cloudflare_dns_record" "site" {
  zone_id = var.cloudflare_zone_id
  name    = "zen"
  type    = "CNAME"
  content = cloudflare_pages_project.site.subdomain
  proxied = true
  ttl     = 1 # "Automatic" — required alongside proxied in v5
}

# ---------------------------------------------------------------------------
# R2 — media bucket (replaces the S3 media bucket). Egress is always free.
# ---------------------------------------------------------------------------

resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = "zen-matanbrown"
  location   = "EEUR" # closest region to Israel; adjust if you'd rather WEUR
}

# New in provider v5 — didn't exist at all in v4, which is the whole reason
# for this migration. Binds a public custom domain to the bucket so objects
# are reachable at https://${var.r2_public_domain}/<object-key>, served
# through Cloudflare's CDN (not the rate-limited public .r2.dev subdomain).
# Cloudflare auto-manages the DNS for this binding, same as the Pages
# domain above — no separate cloudflare_dns_record needed for it.
resource "cloudflare_r2_custom_domain" "media" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.media.name
  zone_id     = var.cloudflare_zone_id
  domain      = var.r2_public_domain
  enabled     = true
}

output "pages_subdomain" {
  value = cloudflare_pages_project.site.subdomain
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.media.name
}

output "r2_public_domain" {
  value = cloudflare_r2_custom_domain.media.domain
}
