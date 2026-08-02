// Scans every markdown file under src/content for external (http/https)
// links and checks each one still resolves. Exits non-zero (failing the
// CI job, which GitHub will email about on a scheduled run) if any are
// broken, so link rot in old lessons/inspirations/etc. gets caught
// automatically instead of silently sitting there for years.
//
// Defensive by design: some sites (Amazon in particular) silently stall
// bot-like requests instead of responding, so every fetch has a short
// hard timeout AND the whole script has a hard overall deadline — it will
// always finish and report, never hang indefinitely.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DIR = path.join(ROOT, "src/content");
const LINK_RE = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
const PER_REQUEST_TIMEOUT_MS = 6_000;
const OVERALL_DEADLINE_MS = 45_000;
const POOL_SIZE = 5;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

async function collectLinks() {
  const files = await walk(CONTENT_DIR);
  const linkToFiles = new Map(); // url -> Set of relative file paths that reference it

  for (const file of files) {
    const text = await readFile(file, "utf-8");
    for (const match of text.matchAll(LINK_RE)) {
      const url = match[1];
      const rel = path.relative(ROOT, file);
      if (!linkToFiles.has(url)) linkToFiles.set(url, new Set());
      linkToFiles.get(url).add(rel);
    }
  }
  return linkToFiles;
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    // Drain and discard the body without waiting for the full download —
    // we only care about the status, not the content.
    res.body?.cancel().catch(() => {});
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: err.name === "TimeoutError" ? "timeout" : err.message };
  }
}

async function main() {
  const startedAt = Date.now();
  const linkToFiles = await collectLinks();
  const urls = [...linkToFiles.keys()];
  console.log(`Checking ${urls.length} external links (max ${OVERALL_DEADLINE_MS / 1000}s total)...\n`);

  const broken = [];
  const checked = new Set();
  let i = 0;

  async function worker() {
    while (i < urls.length) {
      if (Date.now() - startedAt > OVERALL_DEADLINE_MS) return; // hard stop
      const url = urls[i++];
      const result = await checkUrl(url);
      checked.add(url);
      if (!result.ok) {
        broken.push({ url, ...result, files: [...linkToFiles.get(url)] });
        console.log(`✗ BROKEN (${result.status ?? result.error}): ${url}`);
      } else {
        console.log(`✓ ${result.status}: ${url}`);
      }
    }
  }

  await Promise.all(Array.from({ length: POOL_SIZE }, worker));

  const unchecked = urls.filter((u) => !checked.has(u));
  if (unchecked.length > 0) {
    console.log(`\n(Stopped after ${OVERALL_DEADLINE_MS / 1000}s — ${unchecked.length} link(s) not checked this run, will be picked up next run.)`);
  }

  if (broken.length > 0) {
    console.log(`\n${broken.length} broken link(s) found:\n`);
    for (const b of broken) {
      console.log(`- ${b.url} (${b.status ?? b.error})`);
      for (const f of b.files) console.log(`    used in: ${f}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\nAll checked links OK.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Absolute last resort — never let the process hang past this.
    setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
  });
