// Cloudflare Pages Function — POST /api/subscribe
//
// Adds an email as a global Resend Contact and puts it in a Segment
// (Resend's newsletter/list feature — no custom database needed).
// Verifies Turnstile + a honeypot first, same pattern as /api/contact.
// Sending the actual newsletter issues happens later, manually, from
// Resend's own Broadcasts UI — this function only handles signup.
//
// Note: Resend's contacts API changed — the old "audiences" concept was
// renamed to "segments", and creating a contact directly under an
// audience_id is deprecated. The current correct shape is a single
// POST /contacts call with a `segments` array in the body.
//
// Required Cloudflare Pages secrets (same TURNSTILE_SECRET_KEY and
// RESEND_API_KEY already set for /api/contact — no new secrets needed).

const SEGMENT_ID = "afd064d4-2ba4-47a9-9179-7dc0fd677c59"; // "zen website newsletter" segment

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const body = await request.json();
    const { email, website, turnstileToken } = body ?? {};

    // Honeypot — same convention as /api/contact.
    if (website) {
      return jsonResponse({ ok: true });
    }

    if (!isNonEmptyString(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: "invalid_email" }, 400);
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

    const res = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
        segments: [{ id: SEGMENT_ID }],
      }),
    });

    // Resend errors if the contact (identified globally by email) already
    // exists — treat that as a success from the visitor's point of view,
    // not a failure. 409 is the standard conflict code; being a little
    // permissive here (4xx generally) avoids a confusing "failed" message
    // for someone who's just already subscribed.
    if (!res.ok && res.status !== 409) {
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
