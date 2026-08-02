// Cloudflare Pages Function — POST /api/subscribe
//
// Adds an email as a global Resend Contact and puts it in a Segment
// (Resend's newsletter/list feature — no custom database needed), then
// sends a short welcome email. Verifies Turnstile + a honeypot first,
// same pattern as /api/contact. Sending future newsletter issues happens
// separately, manually, from Resend's own Broadcasts UI — this function
// only handles signup + the one-time welcome note.
//
// Note: Resend's contacts API changed — the old "audiences" concept was
// renamed to "segments", and creating a contact directly under an
// audience_id is deprecated. The current correct shape is a single
// POST /contacts call with a `segments` array in the body.
//
// Required Cloudflare Pages secrets (same TURNSTILE_SECRET_KEY and
// RESEND_API_KEY already set for /api/contact — no new secrets needed).

const SEGMENT_ID = "afd064d4-2ba4-47a9-9179-7dc0fd677c59"; // "zen website newsletter" segment
const FROM = "ללא מאמץ · Without Effort <hello@zen.matanbrown.com>";

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const body = await request.json();
    const { email, website, turnstileToken, lang } = body ?? {};
    const isEn = lang === "en";

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

    if (res.ok) {
      // Only a genuinely new contact gets the welcome email — resending
      // it to someone re-submitting an already-subscribed address would
      // just be noise, not a nice touch.
      await sendWelcomeEmail({ apiKey: env.RESEND_API_KEY, email, isEn }).catch((err) => {
        // Don't fail the whole signup just because the welcome note
        // couldn't be sent — the subscription itself already succeeded.
        console.error("welcome email failed:", err);
      });
      return jsonResponse({ ok: true });
    }

    // Resend errors if the contact (identified globally by email) already
    // exists — treat that as a success from the visitor's point of view,
    // not a failure, but skip the welcome email in this case.
    if (res.status === 409) {
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "send_failed" }, 502);
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

async function sendWelcomeEmail({ apiKey, email, isEn }) {
  if (!apiKey) return;
  const subject = isEn ? "Thanks for subscribing to Without Effort" : "תודה שנרשמת ל\"ללא מאמץ\"";
  const text = isEn
    ? `Thanks for subscribing! You'll get an email whenever a new lesson goes up on the site.\n\nIn the meantime, you can start here: https://zen.matanbrown.com/en/lessons/\n\nIf you ever want to stop, just reply to any of these emails and let me know.`
    : `תודה שנרשמת! מעכשיו תקבל/י מייל בכל פעם שיעלה שיעור חדש באתר.\n\nבינתיים, אפשר להתחיל כאן: https://zen.matanbrown.com/lessons/\n\nאם בשלב כלשהו תרצה/י להפסיק, פשוט תגיב/י לכל אחד מהמיילים האלה ותגיד/י לי.`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject,
      text,
    }),
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
