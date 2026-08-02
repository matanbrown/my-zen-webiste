// Cloudflare Pages Function — GET /api/comments-moderate
//
// Reached by clicking Approve/Reject in the moderation email. Deliberately
// a GET (a plain link click, no form/JS needed) — safe because the
// moderation_token is an unguessable random UUID unique per comment, known
// only to whoever received that specific email.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!id || !token || (action !== "approve" && action !== "reject")) {
    return htmlResponse("קישור לא תקין.", 400);
  }
  if (!env.COMMENTS_DB) {
    return htmlResponse("מסד הנתונים עדיין לא מחובר.", 500);
  }

  const row = await env.COMMENTS_DB.prepare("SELECT moderation_token, status FROM comments WHERE id = ?1")
    .bind(id)
    .first();

  if (!row) {
    return htmlResponse("התגובה לא נמצאה.", 404);
  }
  if (!timingSafeEqual(String(row.moderation_token), token)) {
    return htmlResponse("קישור לא תקין.", 403);
  }
  if (row.status !== "pending") {
    return htmlResponse(`התגובה כבר טופלה בעבר (סטטוס נוכחי: ${row.status}).`, 200);
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  await env.COMMENTS_DB.prepare("UPDATE comments SET status = ?1 WHERE id = ?2").bind(newStatus, id).run();

  return htmlResponse(action === "approve" ? "התגובה אושרה ועכשיו מופיעה באתר." : "התגובה נדחתה ולא תפורסם.", 200);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function htmlResponse(message, status) {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>ניהול תגובות</title></head>` +
      `<body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;text-align:center;padding:0 1rem;">` +
      `<p>${message}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
