/**
 * After a release is published: record it on main. Sets package.json's version, rewrites
 * Formula/patteo.rb from the release's checksums, commits both, and pushes to main.
 *
 * Main may have moved while the release was building, so a rejected push is rebased onto the new tip and
 * retried. The commit only touches package.json and the formula, so that rebase is clean unless someone
 * edited the same lines; then it stops instead of guessing.
 *
 *   bun scripts/finalize-release.ts <version> <checksums.txt> [--remote origin] [--branch main] [--no-push]
 */
import { $ } from "bun";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { setPackageVersion } from "./version";
import { formulaText, parseChecksums } from "./update-formula";

const BOT = ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com"];

export async function finalizeRelease(opts: { cwd: string; version: string; checksums: string; remote?: string; branch?: string; push?: boolean; attempts?: number }) {
  const { cwd, version, checksums } = opts;
  const remote = opts.remote ?? "origin";
  const branch = opts.branch ?? "main";
  const git = (...args: string[]) => $`git -C ${cwd} ${BOT} ${args}`.quiet();

  setPackageVersion(join(cwd, "package.json"), version);
  const formula = join(cwd, "Formula", "patteo.rb");
  mkdirSync(dirname(formula), { recursive: true });
  writeFileSync(formula, formulaText(version, parseChecksums(readFileSync(checksums, "utf8"))));

  await git("add", "package.json", "Formula/patteo.rb");
  const changed = (await git("diff", "--cached", "--quiet").nothrow()).exitCode !== 0;
  if (!changed) return { committed: false, pushed: false };
  await git("commit", "-m", `chore(release): v${version}`);
  if (opts.push === false) return { committed: true, pushed: false };

  const attempts = opts.attempts ?? 4;
  for (let i = 1; i <= attempts; i++) {
    const push = await git("push", remote, `HEAD:${branch}`).nothrow();
    if (push.exitCode === 0) return { committed: true, pushed: true };
    if (i === attempts) throw new Error(`could not push to ${remote}/${branch} after ${attempts} attempts:\n${push.stderr.toString()}`);
    await git("fetch", remote, branch);
    const rebase = await git("rebase", `${remote}/${branch}`).nothrow();
    if (rebase.exitCode !== 0) {
      await git("rebase", "--abort").nothrow();
      throw new Error(`main moved and the release commit no longer applies cleanly:\n${rebase.stderr.toString()}`);
    }
  }
  return { committed: true, pushed: false };
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ options: { remote: { type: "string" }, branch: { type: "string" }, "no-push": { type: "boolean" } }, allowPositionals: true });
  const [version, checksums] = positionals;
  if (!version || !checksums) throw new Error("usage: finalize-release.ts <version> <checksums.txt> [--remote r] [--branch b] [--no-push]");
  const r = await finalizeRelease({ cwd: ".", version: version.replace(/^v/, ""), checksums, remote: values.remote, branch: values.branch, push: !values["no-push"] });
  console.log(r.committed ? (r.pushed ? `Recorded v${version} on main` : `Committed v${version} (not pushed)`) : "package.json and the formula already match this release");
}
