# Google Drive -> S3 image sync
#
# Manual prerequisites (see infra/lambda/drive_sync/handler.py docstring):
#   1. Create the GCP service account + Drive API access
#   2. terraform apply -target=aws_secretsmanager_secret.google_drive_sa
#      then fill in the actual secret value via:
#        aws secretsmanager put-secret-value \
#          --secret-id zen-matanbrown/google-drive-sa \
#          --secret-string file://path/to/service-account-key.json
#   3. Set the drive_folder_id variable below to your shared folder's ID

variable "drive_folder_id" {
  description = "Google Drive folder ID shared with the service account"
  type        = string
  default     = "" # fill in once the Drive folder exists
}

resource "aws_secretsmanager_secret" "google_drive_sa" {
  name = "zen-matanbrown/google-drive-sa"
}

data "archive_file" "drive_sync" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/drive_sync"
  output_path = "${path.module}/lambda/drive_sync.zip"
}

resource "aws_iam_role" "drive_sync" {
  name = "zen-matanbrown-drive-sync"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "drive_sync" {
  name = "drive-sync"
  role = aws_iam_role.drive_sync.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.google_drive_sa.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_lambda_function" "drive_sync" {
  function_name    = "zen-matanbrown-drive-sync"
  role             = aws_iam_role.drive_sync.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  timeout          = 60
  filename         = data.archive_file.drive_sync.output_path
  source_code_hash = data.archive_file.drive_sync.output_base64sha256

  environment {
    variables = {
      DRIVE_FOLDER_ID = var.drive_folder_id
      MEDIA_BUCKET    = aws_s3_bucket.media.id
    }
  }

  # Note: google-api-python-client + google-auth aren't in the base
  # Python runtime — package them as a Lambda layer or with the
  # deployment zip (pip install -t . -r requirements.txt) before
  # applying, or switch to a container-image Lambda if that's easier
  # for your existing CI patterns.
}

resource "aws_cloudwatch_event_rule" "drive_sync_schedule" {
  name                = "zen-matanbrown-drive-sync-schedule"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "drive_sync_target" {
  rule = aws_cloudwatch_event_rule.drive_sync_schedule.name
  arn  = aws_lambda_function.drive_sync.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.drive_sync.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.drive_sync_schedule.arn
}
