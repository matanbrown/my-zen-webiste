// Automated content drafting.
//
// Reads the next topic from content-ideas.md, asks the Claude API to write
// it (Hebrew + English), writes both markdown files with draft: true, and
// marks the topic as consumed in content-ideas.md. Never publishes anything
// itself — the calling workflow opens a PR, and a human merge is what
// actually makes it live (deploy.yml only deploys on push to main).
//
// Run locally to test: ANTHROPIC_API_KEY=sk-... node scripts/generate-content.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IDEAS_PATH = path.join(ROOT, "content-ideas.md");
const MODEL = "claude-sonnet-5";

function slugify(text) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "topic"
  );
}

async function popNextTopic() {
  const raw = await readFile(IDEAS_PATH, "utf-8");
  const lines = raw.split("\n");

  const queueStart = lines.findIndex((l) => l.trim() === "## Queue");
  const doneStart = lines.findIndex((l) => l.trim() === "## Done");
  if (queueStart === -1 || doneStart === -1) {
    throw new Error("content-ideas.md is missing '## Queue' or '## Done' headings");
  }

  const queueLines = lines.slice(queueStart + 1, doneStart);
  const topicIndex = queueLines.findIndex((l) => l.trim().length > 0);
  if (topicIndex === -1) {
    return { topic: null };
  }

  const topicLine = queueLines[topicIndex].trim();
  queueLines.splice(topicIndex, 1);

  const today = new Date().toISOString().slice(0, 10);
  const doneEntry = `- [${today}] ${topicLine}`;

  const newLines = [
    ...lines.slice(0, queueStart + 1),
    ...queueLines,
    ...lines.slice(doneStart, doneStart + 1),
    doneEntry,
    ...lines.slice(doneStart + 1),
  ];

  await writeFile(IDEAS_PATH, newLines.join("\n"));
  return { topic: topicLine, date: today };
}

function parseType(topicLine) {
  const match = topicLine.match(/^(lesson|poem)\s*:\s*(.+)$/i);
  if (match) {
    return { type: match[1].toLowerCase(), text: match[2].trim() };
  }
  return { type: "lesson", text: topicLine };
}

async function callClaude(type, topic) {
  const schemaHint =
    type === "poem"
      ? `Respond with ONLY a JSON object, no markdown fences, no commentary:
{
  "slug": "kebab-case-english-slug",
  "form": "poem" or "haiku" (pick whichever fits),
  "title_he": "Hebrew title",
  "body_he": "Hebrew poem body, markdown, no frontmatter",
  "title_en": "English title (translation, not necessarily literal)",
  "body_en": "English poem body, markdown, no frontmatter"
}`
      : `Respond with ONLY a JSON object, no markdown fences, no commentary:
{
  "slug": "kebab-case-english-slug",
  "title_he": "Hebrew title",
  "summary_he": "One-sentence Hebrew summary",
  "body_he": "Hebrew lesson body, markdown, no frontmatter, a few short paragraphs",
  "title_en": "English title",
  "summary_en": "One-sentence English summary",
  "body_en": "English lesson body, markdown, no frontmatter — a faithful translation/adaptation of the Hebrew, not a re-invention"
}`;

  const system = `You are drafting content for "ללא מאמץ" (Without Effort), a personal Zen practice website (zen.matanbrown.com). The site's voice is first-person, direct, personal, reflective — like someone actually writing from their own zazen/shikantaza practice, not a generic wellness blog. Avoid clichés, avoid therapy-speak, avoid grandiose claims of enlightenment. Short, plain sentences. Hebrew is the primary language; the English version is a faithful translation, not a new piece. ${schemaHint}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: `Topic: ${topic}` }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.content.find((b) => b.type === "text")?.text ?? "";
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse Claude's response as JSON: ${err.message}\n---\n${cleaned}`);
  }
}

function frontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

async function writeLesson(result, date) {
  const slug = `${date}-${slugify(result.slug)}`;
  const heDir = path.join(ROOT, "src/content/lessons");
  const enDir = path.join(ROOT, "src/content/en/lessons");
  await mkdir(heDir, { recursive: true });
  await mkdir(enDir, { recursive: true });

  await writeFile(
    path.join(heDir, `${slug}.md`),
    frontmatter({ title: result.title_he, date, summary: result.summary_he, draft: true }) +
      result.body_he.trim() +
      "\n"
  );
  await writeFile(
    path.join(enDir, `${slug}.md`),
    frontmatter({ title: result.title_en, date, summary: result.summary_en, draft: true }) +
      result.body_en.trim() +
      "\n"
  );
  return slug;
}

async function writePoem(result) {
  const slug = slugify(result.slug);
  const date = new Date().toISOString().slice(0, 10);
  const heDir = path.join(ROOT, "src/content/poems");
  const enDir = path.join(ROOT, "src/content/en/poems");
  await mkdir(heDir, { recursive: true });
  await mkdir(enDir, { recursive: true });

  await writeFile(
    path.join(heDir, `${slug}.md`),
    frontmatter({ title: result.title_he, date, form: result.form, draft: true }) +
      result.body_he.trim() +
      "\n"
  );
  await writeFile(
    path.join(enDir, `${slug}.md`),
    frontmatter({ title: result.title_en, date, form: result.form, draft: true }) +
      result.body_en.trim() +
      "\n"
  );
  return slug;
}

async function main() {
  const { topic, date } = await popNextTopic();

  if (!topic) {
    console.log("No topics in queue — nothing to do.");
    if (process.env.GITHUB_OUTPUT) {
      await writeFile(process.env.GITHUB_OUTPUT, "created=false\n", { flag: "a" });
    }
    return;
  }

  const { type, text } = parseType(topic);
  console.log(`Drafting ${type}: ${text}`);

  const result = await callClaude(type, text);
  const slug = type === "poem" ? await writePoem(result) : await writeLesson(result, date);

  console.log(`Wrote draft: ${type}/${slug}`);
  if (process.env.GITHUB_OUTPUT) {
    const out = [
      "created=true",
      `type=${type}`,
      `slug=${slug}`,
      `topic=${text.replace(/\n/g, " ")}`,
    ].join("\n");
    await writeFile(process.env.GITHUB_OUTPUT, out + "\n", { flag: "a" });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
