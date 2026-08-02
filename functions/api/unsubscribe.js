// Cloudflare Pages Function — POST /api/unsubscribe
//
// Marks a contact as unsubscribed in Resend, by email — no Turnstile here
// deliberately: this is a one-click action reached from an email link, and
// adding a CAPTCHA to an unsubscribe flow is bad practice (people expect
// it to be frictionless, and some regions legally require it to be easy).
// Worst case of no bot-protection here is someone unsubscribing an email
// address they don't own, which is a mild nuisance, not spam/abuse.

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return jsonResponse({ ok: false, error: "bad_request" }, 400);
    }

    const body = await request.json();
    const { email } = body ?? {};

    if (!isNonEmptyString(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: "invalid_email" }, 400);
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
