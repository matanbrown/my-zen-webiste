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

    // Check explicitly rather than guessing at whatever status code a
    // duplicate POST /contacts would return — this way we know for sure,
    // and can tell a returning visitor "you're already on the list"
    // instead of just silently pretending it worked like a fresh signup.
    // Also handles someone who previously unsubscribed and is now trying
    // to opt back in — that should resubscribe them, not tell them
    // they're "already subscribed" when they're actually not receiving
    // anything right now.
    const existsRes = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
    });

    if (existsRes.ok) {
      const existing = await existsRes.json();
      const isUnsubscribed = existing.unsubscribed ?? existing.data?.unsubscribed ?? false;
      if (!isUnsubscribed) {
        return jsonResponse({ ok: true, alreadySubscribed: true });
      }
      // Exists but currently unsubscribed — resubscribe them.
      const resub = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({ unsubscribed: false }),
      });
      if (!resub.ok) {
        return jsonResponse({ ok: false, error: "send_failed" }, 502);
      }
      await sendWelcomeEmail({ apiKey: env.RESEND_API_KEY, email, isEn, unsubSecret: env.UNSUB_SECRET }).catch((err) => {
        console.error("welcome email failed:", err);
      });
      return jsonResponse({ ok: true });
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
      await sendWelcomeEmail({ apiKey: env.RESEND_API_KEY, email, isEn, unsubSecret: env.UNSUB_SECRET }).catch((err) => {
        // Don't fail the whole signup just because the welcome note
        // couldn't be sent — the subscription itself already succeeded.
        console.error("welcome email failed:", err);
      });
      return jsonResponse({ ok: true });
    }

    // Belt-and-suspenders: if the explicit exists-check above somehow
    // missed it (e.g. a race with a duplicate near-simultaneous signup),
    // still treat a conflict-shaped failure as "already subscribed"
    // rather than a hard error.
    if (res.status === 409) {
      return jsonResponse({ ok: true, alreadySubscribed: true });
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

// HMAC-SHA256(email, secret), hex-encoded. Used to build a signed
// unsubscribe link that proves whoever clicks it actually received this
// specific email, rather than just knowing the address exists.
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

async function sendWelcomeEmail({ apiKey, email, isEn, unsubSecret }) {
  if (!apiKey) return;
  const token = unsubSecret ? await signEmail(email, unsubSecret) : "";
  const unsubscribeUrl = `https://zen.matanbrown.com${isEn ? "/en" : ""}/unsubscribe/?email=${encodeURIComponent(email)}${token ? `&token=${token}` : ""}`;
  const subject = isEn ? "Thanks for subscribing to Without Effort" : "תודה שנרשמת ל\"ללא מאמץ\"";
  const text = isEn
    ? `Thanks for subscribing! You'll get an email whenever a new lesson goes up on the site.\n\nIn the meantime, you can start here: https://zen.matanbrown.com/en/lessons/\n\nTip: if this email landed in Promotions or Updates instead of Primary, drag it into Primary once — that teaches Gmail to put future emails from me there too.\n\nThis inbox isn't monitored, so replying won't reach anyone — to unsubscribe, use this link instead: ${unsubscribeUrl}`
    : `תודה שנרשמת! מעכשיו תקבל/י מייל בכל פעם שיעלה שיעור חדש באתר.\n\nבינתיים, אפשר להתחיל כאן: https://zen.matanbrown.com/lessons/\n\nטיפ: אם המייל הזה נחת בטאב 'עדכונים' או 'מבצעים' במקום ב-Primary, כדאי לגרור אותו ל-Primary פעם אחת — זה מלמד את ג'ימייל להציג גם מיילים הבאים ממני שם.\n\nתיבת הדואר הזו לא מנוטרת, אז תגובה לא תגיע לאף אחד — להסרה מהרשימה, אפשר להשתמש בלינק הזה במקום: ${unsubscribeUrl}`;

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
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
      },
    }),
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
