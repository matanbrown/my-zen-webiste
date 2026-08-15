// Cloudflare Pages Function - handled before static-asset routing, which
// is what lets this bypass Pages' automatic .html-stripping redirect that
// broke Google Search Console verification (see public/google...html and
// public/_redirects, which didn't work on their own).
export function onRequestGet() {
  return new Response("google-site-verification: google573ecc33a1e62469.html\n", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
