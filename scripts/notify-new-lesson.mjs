// Detects a lesson that just went from draft to published in the most
// recent commit (comparing this commit's frontmatter against the
// previous commit's), and if so, sends a Resend Broadcast to the
// newsletter segment linking to it.
//
// Deliberately triggers off the same event that already makes a lesson
// live (draft: false + a push to main) — no separate "are you sure"
// step, because that decision already happened when the lesson was
// published. This does mean: flipping draft to false and pushing now
// really does email your whole subscriber list, not just update the
// site. Worth remembering.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEGMENT_ID = "afd064d4-2ba4-47a9-9179-7dc0fd677c59"; // "zen website newsletter" segment
const FROM = "ללא מאמץ · Without Effort <hello@zen.matanbrown.com>";

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8" });
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    value = value.trim().replace(/^"(.*)"$/, "$1");
    fm[key] = value;
  }
  return fm;
}

function draftStateAtRef(gitRef, relPath) {
  try {
    const content = sh(`git show ${gitRef}:${relPath}`);
    return parseFrontmatter(content).draft;
  } catch {
    return null; // file didn't exist at that ref
  }
}

async function sendBroadcast({ apiKey, slug, title, summary }) {
  const heUrl = `https://zen.matanbrown.com/lessons/${slug}/`;
  const enUrl = `https://zen.matanbrown.com/en/lessons/${slug}/`;
  const subject = `שיעור חדש: ${title}`;
  const text =
    `שיעור חדש עלה לאתר: ${title}\n\n` +
    (summary ? `${summary}\n\n` : "") +
    `לקרוא: ${heUrl}\n(English version: ${enUrl})\n\n` +
    `להסרה מרשימת התפוצה: {{{RESEND_UNSUBSCRIBE_URL}}}`;
  const html =
    `<p>שיעור חדש עלה לאתר: <strong>${title}</strong></p>` +
    (summary ? `<p>${summary}</p>` : "") +
    `<p><a href="${heUrl}">לקרוא בעברית</a> · <a href="${enUrl}">Read in English</a></p>` +
    `<p style="font-size:12px;color:#888;">להסרה מרשימת התפוצה: {{{RESEND_UNSUBSCRIBE_URL}}}</p>`;

  const res = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      segment_id: SEGMENT_ID,
      from: FROM,
      subject,
      html,
      text,
      send: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Broadcast API error ${res.status}: ${await res.text()}`);
  }
  console.log(`Broadcast sent for "${title}" (${slug}).`);
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set — cannot send broadcasts. Skipping.");
    return;
  }

  let changedLines;
  try {
    changedLines = sh(`git diff --name-status HEAD~1 HEAD -- src/content/lessons`)
      .split("\n")
      .filter(Boolean);
  } catch {
    console.log("Couldn't diff against HEAD~1 (e.g. first commit ever) — nothing to check.");
    return;
  }

  const candidates = changedLines
    .map((line) => line.split("\t"))
    .filter(([status]) => status === "A" || status === "M")
    .map(([, file]) => file);

  if (candidates.length === 0) {
    console.log("No lesson files changed in this push.");
    return;
  }

  for (const relPath of candidates) {
    const fullPath = path.join(ROOT, relPath);
    let fm;
    try {
      fm = parseFrontmatter(readFileSync(fullPath, "utf-8"));
    } catch {
      continue; // file was deleted in this push
    }

    if (fm.draft !== "false") {
      console.log(`${relPath}: still draft, skipping.`);
      continue;
    }

    const previousDraft = draftStateAtRef("HEAD~1", relPath);
    if (previousDraft === "false") {
      console.log(`${relPath}: was already published before this push, skipping.`);
      continue;
    }

    const slug = path.basename(relPath, ".md");
    console.log(`${relPath}: newly published this push — sending notification.`);
    await sendBroadcast({ apiKey, slug, title: fm.title, summary: fm.summary });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
