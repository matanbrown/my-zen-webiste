"""
Run manually (via GitHub Actions workflow_dispatch, or locally) whenever
you've added new images to the shared Google Drive folder. Lists files in
that folder using a service account, and uploads any not already present
in the R2 media bucket (by Drive file id, used as the object key prefix).

One-time setup:
  1. Create a Google Cloud project + Service Account (console.cloud.google.com),
     enable the "Google Drive API" for it, create a JSON key.
  2. Share your Drive upload folder with the service account's email
     (looks like xxx@xxx.iam.gserviceaccount.com), viewer access.
  3. Create an R2 API token (Cloudflare dashboard -> R2 -> Manage API
     tokens) scoped to the media bucket.
  4. Set these as GitHub repo secrets (Settings -> Secrets and variables
     -> Actions):
       GOOGLE_DRIVE_SA_JSON   - full contents of the service account JSON key
       DRIVE_FOLDER_ID        - the shared folder's ID (from its URL)
       R2_ACCOUNT_ID          - Cloudflare account ID
       R2_ACCESS_KEY_ID       - from the R2 API token
       R2_SECRET_ACCESS_KEY   - from the R2 API token
       R2_BUCKET              - defaults to zen-matanbrown-media if unset

Running locally: export the same variables, then
  pip install -r scripts/requirements.txt
  python scripts/drive_sync.py
"""
import io
import os
import json
import sys

import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

DRIVE_FOLDER_ID = os.environ["DRIVE_FOLDER_ID"]
R2_BUCKET = os.environ.get("R2_BUCKET", "zen-matanbrown-media")
R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_ACCESS_KEY_ID = os.environ["R2_ACCESS_KEY_ID"]
R2_SECRET_ACCESS_KEY = os.environ["R2_SECRET_ACCESS_KEY"]


def _drive_client():
    info = json.loads(os.environ["GOOGLE_DRIVE_SA_JSON"])
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    return build("drive", "v3", credentials=creds)


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def _already_synced(r2, file_id: str) -> bool:
    resp = r2.list_objects_v2(Bucket=R2_BUCKET, Prefix=f"{file_id}-")
    return resp.get("KeyCount", 0) > 0


def main():
    drive = _drive_client()
    r2 = _r2_client()

    results = drive.files().list(
        q=f"'{DRIVE_FOLDER_ID}' in parents and trashed = false",
        fields="files(id, name, mimeType)",
    ).execute()

    synced = []
    for f in results.get("files", []):
        if not f["mimeType"].startswith("image/"):
            continue
        if _already_synced(r2, f["id"]):
            print(f"skip (already synced): {f['name']}")
            continue

        request = drive.files().get_media(fileId=f["id"])
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        key = f"{f['id']}-{f['name']}"
        r2.put_object(Bucket=R2_BUCKET, Key=key, Body=buf.getvalue(), ContentType=f["mimeType"])
        print(f"synced: {key}")
        synced.append(key)

    print(f"\nDone — {len(synced)} new file(s) synced.")
    return synced


if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        print(f"Missing required environment variable: {e}", file=sys.stderr)
        sys.exit(1)
