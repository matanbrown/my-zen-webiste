// Cloudflare Pages Function — GET/POST /api/comments
//
// GET  ?path=/lessons/xxx/            -> approved comments for that page
// POST { path, lang, name, comment, website, turnstileToken }
//      -> inserts as status='pending', emails Matan an approve/reject
//         link (see comments-moderate.js). Never shows on the site until
//         approved.
//
// Requires the COMMENTS_DB D1 binding (see infra/cloudflare.tf +
// README for the one-time dashboard step to actually bind it — Terraform
// only creates the database, binding it is manual on purpose) and the
// same TURNSTILE_SECRET_KEY / RESEND_API_KEY secrets already used by
// /api/contact and /api/subscribe.

const RECIPIENT = "matan@matanbrown.com";
const FROM = "ללא מאמץ · Without Effort <hello@zen.matanbrown.com>";
const MAX_NAME_LENGTH = 80;
const MAX_BODY_LENGTH = 2000;

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path");
    if (!isNonEmptyString(path)) {
      return jsonResponse({ ok: false, error: "missing_path" }, 400);
    }
    if (!env.COMMENTS_DB) {
      return jsonResponse({ ok: true, comments: [] }); // DB not bound yet — fail soft
    }

    const { results } = await env.COMMENTS_DB.prepare(
      "SELECT id, name, body, created_at FROM comments WHERE page_path = ?1 AND status = 'approved' ORDER BY created_at ASC"
    )
      .bind(path)
      .all();

    return jsonResponse({ ok: true, comments: results ?? [] });
  } catch (err) {
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const body = await request.json();
    const { path, lang, name, comment, website, turnstileToken } = body ?? {};

    // Honeypot — same convention as the other forms on this site.
    if (website) {
      return jsonResponse({ ok: true });
    }

    if (!isNonEmptyString(path) || !isNonEmptyString(name) || !isNonEmptyString(comment)) {
      return jsonResponse({ ok: false, error: "missing_fields" }, 400);
    }
    if (name.length > MAX_NAME_LENGTH || comment.length > MAX_BODY_LENGTH) {
      return jsonResponse({ ok: false, error: "too_long" }, 400);
    }
    if (!isNonEmptyString(turnstileToken)) {
      return jsonResponse({ ok: false, error: "missing_turnstile" }, 400);
    }

    const turnstileOk = await verifyTurnstile({
      token: turnstileToken,
      secret: env.TURNSTILE_SECRET_KEY,
      remoteIp: request.headers.get("CF-Connecting-IP") || "",
    });
    if (!turnstileOk) {
      return jsonResponse({ ok: false, error: "turnstile_failed" }, 403);
    }

    if (!env.COMMENTS_DB) {
      return jsonResponse({ ok: false, error: "db_not_configured" }, 500);
    }

    const moderationToken = crypto.randomUUID();
    const insert = await env.COMMENTS_DB.prepare(
      "INSERT INTO comments (page_path, lang, name, body, status, moderation_token) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)"
    )
      .bind(path, lang === "en" ? "en" : "he", name.trim(), comment.trim(), moderationToken)
      .run();

    const commentId = insert.meta?.last_row_id;

    await sendModerationEmail({
      apiKey: env.RESEND_API_KEY,
      id: commentId,
      token: moderationToken,
      path,
      name: name.trim(),
      comment: comment.trim(),
    }).catch((err) => {
      // The comment is already saved as pending either way — a failed
      // notification just means Matan won't find out about it via email,
      // not that the submission itself failed.
      console.error("moderation email failed:", err);
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function verifyTurnstile({ token, secret, remoteIp }) {
  if (!secret) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function sendModerationEmail({ apiKey, id, token, path, name, comment }) {
  if (!apiKey || !id) return;
  const base = `https://zen.matanbrown.com/api/comments-moderate?id=${id}&token=${encodeURIComponent(token)}`;
  const approveUrl = `${base}&action=approve`;
  const rejectUrl = `${base}&action=reject`;
  const pageUrl = `https://zen.matanbrown.com${path}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [RECIPIENT],
      subject: `תגובה חדשה ממתינה לאישור \u2014 ${name}`,
      text: `${name} כתב/ה:\n\n"${comment}"\n\nבעמוד: ${pageUrl}\n\nלאשר: ${approveUrl}\nלדחות: ${rejectUrl}`,
      html:
        `<p><strong>${escapeHtml(name)}</strong> כתב/ה:</p>` +
        `<blockquote style="border-inline-start:3px solid #ccc;padding-inline-start:1em;">${escapeHtml(comment)}</blockquote>` +
        `<p>בעמוד: <a href="${pageUrl}">${pageUrl}</a></p>` +
        `<p><a href="${approveUrl}" style="color:green;font-weight:bold;">✓ לאשר</a> &nbsp;&nbsp; <a href="${rejectUrl}" style="color:#b00;font-weight:bold;">✗ לדחות</a></p>`,
    }),
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
