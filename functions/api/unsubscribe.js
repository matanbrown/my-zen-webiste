// Cloudflare Pages Function — POST /api/unsubscribe
//
// Marks a contact as unsubscribed in Resend, by email. Two paths:
//
// 1. A signed `token` is provided (the normal case — every unsubscribe
//    link in an actual email includes one). The token is an
//    HMAC-SHA256(email, UNSUB_SECRET), so only someone who actually
//    received that specific email can produce a valid one — this
//    proceeds immediately, no CAPTCHA, matching what people expect from
//    a one-click unsubscribe link.
// 2. No token (someone navigated to /unsubscribe/ directly and typed an
//    email in by hand — e.g. they lost the original email). We can't
//    cryptographically verify ownership in this case, so it falls back
//    to a Turnstile check instead, same as the other forms on this site.
//    This doesn't prove ownership, only that a human is asking — an
//    accepted, low-stakes trade-off for a personal newsletter.

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const body = await request.json();
    const { email, token, turnstileToken } = body ?? {};

    if (!isNonEmptyString(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: "invalid_email" }, 400);
    }

    if (isNonEmptyString(token)) {
      const expected = env.UNSUB_SECRET ? await signEmail(email, env.UNSUB_SECRET) : null;
      if (!expected || !timingSafeEqual(token, expected)) {
        return jsonResponse({ ok: false, error: "invalid_token" }, 403);
      }
    } else {
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
    }

    const res = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ unsubscribed: true }),
    });

    // 404 means there's no contact with that email at all — from the
    // visitor's point of view that's still "you're not subscribed",
    // which is the outcome they wanted, so treat it as success too.
    if (!res.ok && res.status !== 404) {
      return jsonResponse({ ok: false, error: "unsubscribe_failed" }, 502);
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

async function signEmail(email, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(email.trim().toLowerCase()));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
