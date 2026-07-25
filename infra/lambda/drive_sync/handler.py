"""
Runs on a schedule (EventBridge). Lists files in a shared Google Drive
folder using a service account, and copies any file not already present
in the S3 media bucket (by Drive file id, stored as the S3 object key
prefix) down to S3.

Setup (one-time, manual):
  1. Create a Google Cloud project + Service Account (console.cloud.google.com)
  2. Enable the "Google Drive API" for that project
  3. Create a JSON key for the service account, store its contents in
     AWS Secrets Manager under the secret name below
  4. Share your Drive upload folder with the service account's email
     address (looks like xxx@xxx.iam.gserviceaccount.com), viewer access
  5. Put that folder's ID (from its URL) in the DRIVE_FOLDER_ID env var
"""
import io
import os
import json
import boto3
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

DRIVE_FOLDER_ID = os.environ["DRIVE_FOLDER_ID"]
MEDIA_BUCKET = os.environ["MEDIA_BUCKET"]
SECRET_NAME = os.environ.get("GOOGLE_CREDS_SECRET_NAME", "zen-matanbrown/google-drive-sa")

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")


def _drive_client():
    creds_json = secrets.get_secret_value(SecretId=SECRET_NAME)["SecretString"]
    info = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive.readonly"]
    )
    return build("drive", "v3", credentials=creds)


def _already_synced(file_id: str) -> bool:
    resp = s3.list_objects_v2(Bucket=MEDIA_BUCKET, Prefix=f"{file_id}-")
    return resp.get("KeyCount", 0) > 0


def handler(event, context):
    drive = _drive_client()
    results = drive.files().list(
        q=f"'{DRIVE_FOLDER_ID}' in parents and trashed = false",
        fields="files(id, name, mimeType)",
    ).execute()

    synced = []
    for f in results.get("files", []):
        if not f["mimeType"].startswith("image/"):
            continue
        if _already_synced(f["id"]):
            continue

        request = drive.files().get_media(fileId=f["id"])
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        key = f"{f['id']}-{f['name']}"
        s3.put_object(Bucket=MEDIA_BUCKET, Key=key, Body=buf.getvalue(), ContentType=f["mimeType"])
        synced.append(key)

    return {"synced": synced, "count": len(synced)}
