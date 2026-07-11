#!/usr/bin/env node
"use strict";

// Zero-dependency lint for scratch_helper. Three kinds of check, all built on
// Node built-ins (no `npm install` needed) so CI can run this on the runner
// BEFORE the expensive Docker build and fail fast on a syntax error:
//
//   1. SYNTAX (failing)   — `node --check` across every project JS file. This
//                           only parses, so browser-only code (public/app.js
//                           referencing `document`/`window`) and `node:sqlite`
//                           code both check fine on any Node.
//   2. INvariants (failing):
//      a. package.json has NO `dependencies` key — the app is zero-dependency by
//         design (end users never `npm install`); only devDependencies (@playwright
//         /test) are allowed. Catches an accidental runtime dep before it ships.
//      b. No local user-data files are staged in git (preferences.json,
//         *.db / *.db-wal / *.db-shm / *.db-journal, .env). They're gitignored, so
//         any appearance means someone force-added one or the gitignore broke —
//         the most likely contributor mistake. Catches it before CI.
//   3. WARNINGS (non-failing) — targeted regex passes `node --check` can't do:
//      eval(/new Function( (dynamic code), and loose `==`/`!=` equality (excluding
//      the intentional `== null` / `!= null` null-check idiom). Printed but never
//      fail the build — they surface for review without blocking on false hits.
//
// Excludes: node_modules, vendored third-party code (public/vendor), generated
// output dirs (test-results, playwright-report), and .git/.claude.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const EXCLUDE_DIRS = new Set([
  "node_modules",
  "public/vendor",
  "test-results",
  "playwright-report",
  ".git",
  ".claude",
]);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(rel)) continue;
      walk(full, out);
    } else if (ent.isFile() && ent.name.endsWith(".js")) {
      out.push({ rel, full });
    }
  }
}

const files = [];
walk(ROOT, files);
files.sort((a, b) => a.rel.localeCompare(b.rel));

/* ---------- 1. Syntax pass (failing) ---------- */
let syntaxFailed = 0;
for (const { rel, full } of files) {
  const res = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
  if (res.status !== 0) {
    syntaxFailed++;
    process.stdout.write(`FAIL  ${rel}\n`);
    if (res.stderr) process.stdout.write(res.stderr);
  } else {
    process.stdout.write(`ok    ${rel}\n`);
  }
}
const total = files.length;

/* ---------- 3. Warning pass (non-failing) ---------- */
// Loose equality `==`/`!=` that is NOT `===`/`!==`. The intentional null-check
// idiom (`== null` / `!= null` / `null ==` / `null !=`) is excluded so the
// existing, deliberate uses don't noise the output.
const LOOSE_EQ = /(?<=[^=!<>])={2}(?![=])|(?<=[^!])!=(?![=])/;
const NULL_CHECK = /==\s*null|!=\s*null|null\s*==|null\s*!=/;
const WARN_PATTERNS = [
  { re: /\beval\(/, msg: "eval( — dynamic code execution" },
  { re: /new\s+Function\(/, msg: "new Function( — dynamic code execution" },
];
let warnings = 0;
for (const { rel, full } of files) {
  // Skip this script itself: it legitimately references eval(/new Function(/
  // == in its comments and regex literals. The syntax pass above still checks it.
  if (rel === "scripts/lint.js") continue;
  let src;
  try { src = fs.readFileSync(full, "utf8"); }
  catch (e) { continue; }
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, msg } of WARN_PATTERNS) {
      if (re.test(line)) {
        warnings++;
        process.stdout.write(`WARN  ${rel}:${i + 1}  ${msg}\n`);
      }
    }
    if (LOOSE_EQ.test(line) && !NULL_CHECK.test(line)) {
      warnings++;
      process.stdout.write(`WARN  ${rel}:${i + 1}  loose == / != (use === / !==)\n`);
    }
  }
}

/* ---------- 2a. Zero-runtime-dep invariant (failing) ---------- */
let depInvariantOk = true;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
    depInvariantOk = false;
    process.stdout.write(`FAIL  package.json has a "dependencies" key — the app is zero-dependency by design\n`);
    for (const name of Object.keys(pkg.dependencies)) {
      process.stdout.write(`        - ${name}\n`);
    }
  }
} catch (e) {
  depInvariantOk = false;
  process.stdout.write(`FAIL  could not read/parse package.json: ${e.message}\n`);
}

/* ---------- 2b. No-local-data-staged guard (failing) ---------- */
// gitignored local data should never appear in `git status`. If git is absent
// (e.g. a non-repo checkout) we skip the guard rather than fail — it's a
// convenience check, not a correctness one.
let gitGuardOk = true;
const LOCAL_DATA_RE = /(^|\/)(preferences\.json|\.env|.*\.db(?:-wal|-shm|-journal)?)$/;
const gitRes = spawnSync("git", ["status", "--short", "--porcelain"], {
  cwd: ROOT, encoding: "utf8",
});
if (gitRes.error || gitRes.status !== 0) {
  process.stdout.write(`note  git not available — skipping local-data-staged guard\n`);
} else {
  const offenders = [];
  for (const raw of gitRes.stdout.split(/\r?\n/)) {
    if (!raw) continue;
    // Format: "XY PATH" (XY = two status letters; PATH may be quoted, or
    // "OLD -> NEW" for renames). Take the post-"->" path for renames and strip
    // surrounding quotes.
    let p = raw.slice(3);
    const arrow = p.indexOf(" -> ");
    if (arrow >= 0) p = p.slice(arrow + 4);
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    if (LOCAL_DATA_RE.test(p)) offenders.push(p);
  }
  if (offenders.length) {
    gitGuardOk = false;
    process.stdout.write(`FAIL  local user-data file(s) tracked in git — add them to .gitignore and unstage:\n`);
    for (const p of offenders) process.stdout.write(`        - ${p}\n`);
  }
}

/* ---------- Summary ---------- */
const invariantFailed = !depInvariantOk || !gitGuardOk;
const failed = syntaxFailed + (invariantFailed ? 1 : 0);
process.stdout.write(`\n${total - syntaxFailed}/${total} files OK`);
process.stdout.write(` — ${warnings} warning(s)`);
if (invariantFailed) process.stdout.write(` — invariant/guard FAILED`);
process.stdout.write(`\n`);
process.exit(failed > 0 ? 1 : 0);