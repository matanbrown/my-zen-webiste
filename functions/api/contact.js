// Cloudflare Pages Function — POST /api/contact
//
// Verifies a Turnstile token (blocks bots) and a honeypot field, then sends
// the message to matan@matanbrown.com via Resend. The recipient address
// never appears in any client-side code, so it can't be scraped off the
// page — this function is the only place it's written.
//
// Required Cloudflare Pages secrets (set via `wrangler pages secret put`,
// NOT via terraform/committed files — see README for exact commands):
//   TURNSTILE_SECRET_KEY  — from the Turnstile widget in the Cloudflare dashboard
//   RESEND_API_KEY        — from resend.com, after verifying the sending domain

const RECIPIENT = "matan@matanbrown.com";
const FROM = "האתר של ללא מאמץ <contact@zen.matanbrown.com>";
const MAX_MESSAGE_LENGTH = 5000;

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const body = await request.json();
    const { name, email, message, website, turnstileToken } = body ?? {};

    // Honeypot — real users never see or fill this field. If it's filled,
    // pretend success so the bot doesn't learn anything, but drop the message.
    if (website) {
      return jsonResponse({ ok: true });
    }

    if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(message)) {
      return jsonResponse({ ok: false, error: "missing_fields" }, 400);
    }
    if (!isNonEmptyString(turnstileToken)) {
      return jsonResponse({ ok: false, error: "missing_turnstile" }, 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ ok: false, error: "message_too_long" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: "invalid_email" }, 400);
    }

    const turnstileOk = await verifyTurnstile({
      token: turnstileToken,
      secret: env.TURNSTILE_SECRET_KEY,
      remoteIp: request.headers.get("CF-Connecting-IP") || "",
    });
    if (!turnstileOk) {
      return jsonResponse({ ok: false, error: "turnstile_failed" }, 403);
    }

    const sent = await sendEmail({
      apiKey: env.RESEND_API_KEY,
      name,
      email,
      message,
    });
    if (!sent) {
      return jsonResponse({ ok: false, error: "send_failed" }, 502);
    }

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

async function sendEmail({ apiKey, name, email, message }) {
  if (!apiKey) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [RECIPIENT],
      reply_to: email,
      subject: `הודעה חדשה מהאתר · ${name}`,
      text: `שם: ${name}\nאימייל: ${email}\n\n${message}`,
    }),
  });
  return res.ok;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
