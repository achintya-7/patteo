/**
 * Decides what a push to main releases, and stamps that version into the build.
 *
 * The version lives in git tags (vX.Y.Z), not in a commit made before the build: a release is exactly
 * the commit that was built and tested, and the tag points at it. Commits since the last tag decide
 * the bump:
 *
 *   - only docs / tests / CI / tooling changed      → no release
 *   - `!:` after the type, `BREAKING CHANGE`, [major] → major
 *   - `feat:` / `feat(scope):`, [minor]               → minor
 *   - any other change to the shipped program         → patch
 *   - [skip release] anywhere in a commit message     → that commit doesn't count
 *
 * CLI:
 *   bun scripts/version.ts plan --sha <sha> [--bump auto|patch|minor|major] [--dry-run true]
 *   bun scripts/version.ts set <version>
 */
import { $ } from "bun";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

export type Bump = "major" | "minor" | "patch";

export interface Commit {
  sha?: string;
  subject: string;
  body: string;
  files: string[];
}

/** Paths whose change alters the released binary. Everything else (docs, tests, CI) doesn't release. */
export const SHIPPED = [/^src\//, /^patches\//, /^package\.json$/, /^bun\.lock$/, /^scripts\/package\.ts$/];

/** Commits the release workflow itself pushes after publishing; counting them would release forever. */
export const isReleaseBookkeeping = (subject: string) => /^(chore\(release\)|brew):/i.test(subject);

export const optsOut = (c: Commit) => /\[(skip release|no release)\]/i.test(`${c.subject}\n${c.body}`);

export const touchesShipped = (c: Commit) => c.files.some((f) => SHIPPED.some((re) => re.test(f)));

export function commitBump(c: Commit): Bump {
  const text = `${c.subject}\n${c.body}`;
  if (/^[a-z]+(\([^)]*\))?!:/i.test(c.subject) || /BREAKING[ -]CHANGE/.test(text) || /\[major\]/i.test(text)) return "major";
  if (/^feat(\([^)]*\))?:/i.test(c.subject) || /\[minor\]/i.test(text)) return "minor";
  return "patch";
}

const RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };
const strongest = (bumps: Bump[]): Bump => bumps.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "patch" as Bump);

export function parseSemver(v: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`not a plain x.y.z version: "${v}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function bumpVersion(version: string, bump: Bump): string {
  const [major, minor, patch] = parseSemver(version);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export interface Plan {
  release: boolean;
  version: string | null;
  previous: string | null;
  bump: Bump | null;
  reason: string;
  /** The commits that made it a release. */
  counted: Commit[];
}

/**
 * `last` is the latest released version (null before the first release, then `initial` is released
 * as-is). `force` overrides the computed bump, but never releases when nothing changed at all.
 */
export function planRelease(input: { last: string | null; initial: string; commits: Commit[]; force?: Bump | "auto" }): Plan {
  const { last, initial, commits } = input;
  const force = input.force && input.force !== "auto" ? input.force : null;
  const real = commits.filter((c) => !isReleaseBookkeeping(c.subject));
  const eligible = real.filter((c) => !optsOut(c));
  const counted = force ? eligible : eligible.filter(touchesShipped);

  if (counted.length === 0) {
    const why = real.length === 0 ? "no commits since the last release" : force ? "every commit since the last release opts out ([skip release])" : "nothing that ships changed (docs, tests, CI and tooling don't release)";
    return { release: false, version: null, previous: last, bump: null, reason: why, counted: [] };
  }
  if (last === null) return { release: true, version: initial, previous: null, bump: null, reason: `first release (${counted.length} commit${counted.length === 1 ? "" : "s"})`, counted };
  const bump = force ?? strongest(counted.map(commitBump));
  return {
    release: true,
    version: bumpVersion(last, bump),
    previous: last,
    bump,
    reason: `${bump} bump from ${counted.length} commit${counted.length === 1 ? "" : "s"}${force ? " (forced)" : ""}`,
    counted,
  };
}

/** Rewrites "version" in package.json, keeping the file's formatting. */
export function setPackageVersion(file: string, version: string) {
  parseSemver(version);
  const text = readFileSync(file, "utf8");
  if (!/("version"\s*:\s*")[^"]*(")/.test(text)) throw new Error(`no "version" field in ${file}`);
  writeFileSync(file, text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`));
}

// ── git ──────────────────────────────────────────────────────────────────────

const git = async (cwd: string, ...args: string[]) => (await $`git -C ${cwd} ${args}`.quiet().text()).trim();

/** Latest vX.Y.Z tag reachable from `sha`, or null. Pre-release tags (v1.0.0-rc.1) are ignored. */
export async function lastRelease(cwd: string, sha: string): Promise<string | null> {
  const tags = (await git(cwd, "tag", "--merged", sha, "--list", "v[0-9]*")).split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  if (tags.length === 0) return null;
  tags.sort((a, b) => {
    const [x, y] = [parseSemver(a), parseSemver(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return tags[tags.length - 1]!.slice(1);
}

export async function commitsSince(cwd: string, last: string | null, sha: string): Promise<Commit[]> {
  const range = last ? `v${last}..${sha}` : sha;
  const raw = await git(cwd, "log", "--reverse", "--format=%H%x1f%s%x1f%b%x1e", range);
  const out: Commit[] = [];
  for (const chunk of raw.split("\x1e")) {
    if (!chunk.trim()) continue;
    const [id, subject, body] = chunk.trim().split("\x1f");
    // First-parent diff: a merge commit counts for what it brought into the branch.
    const files = (await git(cwd, "diff-tree", "--no-commit-id", "--name-only", "-r", "--root", "-m", "--first-parent", id!)).split("\n").filter(Boolean);
    out.push({ sha: id, subject: subject ?? "", body: body ?? "", files });
  }
  return out;
}

function summary(plan: Plan, sha: string, dryRun: boolean): string {
  const rows = plan.counted.slice(0, 15).map((c) => `- \`${c.sha?.slice(0, 7)}\` ${c.subject}`).join("\n");
  const head = plan.release
    ? `## ${dryRun ? "Would release" : "Releasing"} v${plan.version}\n\n${plan.previous ? `from v${plan.previous} ` : ""}at \`${sha.slice(0, 7)}\` — ${plan.reason}${dryRun ? " (dry run: nothing published)" : ""}`
    : `## No release\n\n${plan.reason} (last release: ${plan.previous ? `v${plan.previous}` : "none"})`;
  return `${head}\n\n${rows}\n`;
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "set") {
    const [version] = rest;
    if (!version) throw new Error("usage: version.ts set <version>");
    setPackageVersion("package.json", version.replace(/^v/, ""));
    console.log(`package.json version → ${version.replace(/^v/, "")}`);
  } else if (command === "plan") {
    const { values } = parseArgs({ args: rest, options: { sha: { type: "string" }, bump: { type: "string" }, "dry-run": { type: "string" }, cwd: { type: "string" } } });
    const cwd = values.cwd ?? ".";
    const sha = values.sha ?? (await git(cwd, "rev-parse", "HEAD"));
    const bump = (values.bump ?? "auto") as Bump | "auto";
    if (!["auto", "patch", "minor", "major"].includes(bump)) throw new Error(`--bump must be auto, patch, minor or major (got "${bump}")`);
    const dryRun = values["dry-run"] === "true";
    const initial = JSON.parse(readFileSync(`${cwd}/package.json`, "utf8")).version as string;

    const last = await lastRelease(cwd, sha);
    const plan = planRelease({ last, initial, commits: await commitsSince(cwd, last, sha), force: bump });
    const publish = plan.release && !dryRun;
    const [major, minor] = plan.version ? parseSemver(plan.version) : [0, 0];

    console.log(JSON.stringify({ ...plan, counted: plan.counted.map((c) => c.subject), publish }, null, 2));
    const outputs: Record<string, string> = {
      release: String(publish),
      version: plan.version ?? "",
      tag: plan.version ? `v${plan.version}` : "",
      previous: plan.previous ?? "",
      bump: plan.bump ?? "",
      major_minor: plan.version ? `${major}.${minor}` : "",
      sha,
    };
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(""));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(plan, sha, dryRun));
  } else {
    throw new Error("usage: version.ts plan|set …");
  }
}
