import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { finalizeRelease } from "../scripts/finalize-release";
import {
  bumpVersion, commitBump, commitsSince, lastRelease, planRelease, setPackageVersion, touchesShipped,
  type Commit,
} from "../scripts/version";

const c = (subject: string, files: string[] = ["src/app.ts"], body = ""): Commit => ({ subject, body, files });

describe("what a commit means for the version", () => {
  test("breaking > feature > anything else", () => {
    expect(commitBump(c("Fix the sidebar"))).toBe("patch");
    expect(commitBump(c("feat: add the PR tab"))).toBe("minor");
    expect(commitBump(c("feat(panel): add the PR tab"))).toBe("minor");
    expect(commitBump(c("Add a thing [minor]"))).toBe("minor");
    expect(commitBump(c("refactor!: drop the old keymap"))).toBe("major");
    expect(commitBump(c("feat(api)!: rename flags"))).toBe("major");
    expect(commitBump(c("Tidy up", ["src/a.ts"], "BREAKING CHANGE: settings moved"))).toBe("major");
    expect(commitBump(c("Big one [major]"))).toBe("major");
    expect(commitBump(c("featuring a fix"))).toBe("patch"); // "feat" must be the whole type
  });

  test("only changes to what ships count", () => {
    expect(touchesShipped(c("x", ["README.md", "docs/a.md"]))).toBe(false);
    expect(touchesShipped(c("x", ["test/a.test.ts", ".github/workflows/ci.yml", "scripts/stress.tsx"]))).toBe(false);
    expect(touchesShipped(c("x", ["src/ui/App.tsx"]))).toBe(true);
    for (const f of ["patches/@opentui%2Fcore@0.9.7.patch", "package.json", "bun.lock", "scripts/package.ts"]) expect(touchesShipped(c("x", [f]))).toBe(true);
    expect(touchesShipped(c("x", ["src-old/a.ts", "mysrc/a.ts"]))).toBe(false); // prefix, not substring
  });

  test("versions bump the way semver says", () => {
    expect(bumpVersion("0.1.9", "patch")).toBe("0.1.10");
    expect(bumpVersion("0.1.9", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.9.9", "major")).toBe("1.0.0");
    expect(() => bumpVersion("1.0", "patch")).toThrow("not a plain x.y.z");
  });
});

describe("planning a release", () => {
  const plan = (commits: Commit[], over: Partial<Parameters<typeof planRelease>[0]> = {}) => planRelease({ last: "0.1.0", initial: "0.1.0", commits, ...over });

  test("docs, tests and CI don't release", () => {
    const p = plan([c("Update the README", ["README.md"]), c("More tests", ["test/a.test.ts"]), c("ci: cache bun", [".github/workflows/ci.yml"])]);
    expect(p).toMatchObject({ release: false, version: null, previous: "0.1.0" });
    expect(p.reason).toContain("nothing that ships");
  });

  test("a code change patches; the strongest commit wins", () => {
    expect(plan([c("Fix a crash")])).toMatchObject({ release: true, version: "0.1.1", bump: "patch" });
    expect(plan([c("Fix a crash"), c("feat: file tree"), c("Docs", ["README.md"])])).toMatchObject({ version: "0.2.0", bump: "minor" });
    expect(plan([c("feat: x"), c("fix!: y")])).toMatchObject({ version: "1.0.0", bump: "major" });
  });

  test("[skip release] removes a commit from the count", () => {
    expect(plan([c("Tweak colours [skip release]")]).release).toBe(false);
    expect(plan([c("Fix a crash"), c("feat: wip [no release]")])).toMatchObject({ version: "0.1.1", bump: "patch" });
    expect(plan([c("feat: x", ["src/a.ts"], "[skip release]")]).release).toBe(false);
  });

  test("the release workflow's own commits never trigger another release", () => {
    // After a release, main gets `chore(release): v0.2.0` (package.json) and `brew:` commits.
    const p = plan([c("chore(release): v0.2.0", ["package.json", "Formula/patteo.rb"]), c("brew: patteo 0.2.0", ["Formula/patteo.rb"])]);
    expect(p.release).toBe(false);
    expect(p.reason).toContain("no commits");
    expect(plan([c("chore(release): v0.2.0", ["package.json"]), c("Fix a crash")]).counted.map((x) => x.subject)).toEqual(["Fix a crash"]);
  });

  test("a forced bump overrides the commits but never releases an unchanged tree", () => {
    expect(plan([c("Update the README", ["README.md"])], { force: "minor" })).toMatchObject({ release: true, version: "0.2.0", bump: "minor" });
    expect(plan([c("Fix", ["src/a.ts"])], { force: "major" })).toMatchObject({ version: "1.0.0" });
    expect(plan([], { force: "patch" }).release).toBe(false);
    expect(plan([c("chore(release): v0.2.0", ["package.json"])], { force: "patch" }).release).toBe(false);
    expect(plan([c("Docs [skip release]", ["README.md"])], { force: "patch" }).release).toBe(false);
  });

  test("the first release ships the version already in package.json", () => {
    expect(plan([c("Initial")], { last: null, initial: "0.3.0" })).toMatchObject({ release: true, version: "0.3.0", previous: null });
    expect(plan([c("Docs", ["README.md"])], { last: null }).release).toBe(false);
  });

  test("package.json keeps its formatting when the version is stamped", () => {
    const dir = mkdtempSync(join(tmpdir(), "patteo-ver-"));
    const file = join(dir, "package.json");
    writeFileSync(file, '{\n  "name": "x",\n  "version": "0.1.0",\n  "dependencies": { "a": "1.0.0" }\n}\n');
    setPackageVersion(file, "2.3.4");
    expect(readFileSync(file, "utf8")).toBe('{\n  "name": "x",\n  "version": "2.3.4",\n  "dependencies": { "a": "1.0.0" }\n}\n');
    expect(() => setPackageVersion(file, "nope")).toThrow();
  });
});

/** A throwaway git repo: `commit` makes a commit touching `files`, optionally tagged. */
async function repo() {
  const dir = mkdtempSync(join(tmpdir(), "patteo-git-"));
  const g = (...a: string[]) => $`git -C ${dir} -c user.name=t -c user.email=t@t ${a}`.quiet();
  await $`git init -q -b main ${dir}`.quiet();
  let n = 0;
  return {
    dir,
    g,
    async commit(message: string, files: string[], tag?: string) {
      for (const f of files) {
        mkdirSync(join(dir, f, ".."), { recursive: true });
        writeFileSync(join(dir, f), `${f} ${++n}\n`);
      }
      await g("add", "-A");
      await g("commit", "-q", "-m", message);
      if (tag) await g("tag", tag);
      return (await g("rev-parse", "HEAD").text()).trim();
    },
  };
}

describe("reading the real git history", () => {
  test("the last release is the highest vX.Y.Z tag reachable, ignoring pre-releases and other tags", async () => {
    const r = await repo();
    expect(await lastRelease(r.dir, "HEAD").catch(() => null)).toBeNull(); // no commits yet
    await r.commit("one", ["src/a.ts"], "v0.9.0");
    await r.commit("two", ["src/a.ts"], "v0.10.0"); // 0.10 > 0.9 numerically, not as text
    await r.commit("three", ["src/a.ts"], "v1.0.0-rc.1");
    await r.commit("four", ["src/a.ts"], "nightly");
    const tip = await r.commit("five", ["src/a.ts"]);
    expect(await lastRelease(r.dir, tip)).toBe("0.10.0");
  });

  test("commits since the tag carry their messages and files; the release bookkeeping is recognised", async () => {
    const r = await repo();
    await r.commit("Initial", ["src/a.ts", "package.json"], "v0.1.0");
    await r.commit("Update the README", ["README.md"]);
    await r.commit("feat: panel", ["src/panel.ts", "test/panel.test.ts"]);
    const tip = await r.commit("chore(release): v0.2.0", ["package.json", "Formula/patteo.rb"]);
    const commits = await commitsSince(r.dir, "0.1.0", tip);
    expect(commits.map((x) => x.subject)).toEqual(["Update the README", "feat: panel", "chore(release): v0.2.0"]);
    expect(commits[1]!.files.sort()).toEqual(["src/panel.ts", "test/panel.test.ts"]);
    expect(planRelease({ last: "0.1.0", initial: "0.1.0", commits })).toMatchObject({ version: "0.2.0", bump: "minor" });
  });

  test("the CLI plans from a repo, writes workflow outputs, and a dry run publishes nothing", async () => {
    const r = await repo();
    writeFileSync(join(r.dir, "package.json"), '{ "name": "x", "version": "0.1.0" }\n');
    await r.g("add", "-A");
    await r.g("commit", "-q", "-m", "Initial");
    await r.g("tag", "v0.1.0");
    await r.commit("Fix a crash", ["src/a.ts"]);
    const script = join(import.meta.dir, "..", "scripts", "version.ts");
    const out = join(r.dir, "gh-output");
    const run = (extra: string[]) => $`bun ${script} plan --cwd ${r.dir} ${extra}`.env({ ...process.env, GITHUB_OUTPUT: out }).quiet();

    writeFileSync(out, "");
    await run([]);
    const outputs = Object.fromEntries(readFileSync(out, "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    expect(outputs).toMatchObject({ release: "true", version: "0.1.1", tag: "v0.1.1", previous: "0.1.0", bump: "patch", major_minor: "0.1" });
    expect(outputs.sha).toMatch(/^[0-9a-f]{40}$/);

    writeFileSync(out, "");
    await run(["--dry-run", "true"]);
    expect(readFileSync(out, "utf8")).toContain("release=false");
    expect(readFileSync(out, "utf8")).toContain("version=0.1.1"); // still shows what it would do
    expect((await $`bun ${script} plan --cwd ${r.dir} --bump huge`.nothrow().quiet()).exitCode).not.toBe(0);
  });
});

describe("recording a release on main", () => {
  async function setup() {
    const origin = mkdtempSync(join(tmpdir(), "patteo-origin-"));
    await $`git init -q --bare -b main ${origin}`.quiet();
    const clone = (name: string) => mkdtempSync(join(tmpdir(), `patteo-${name}-`));
    const a = clone("a");
    await $`git clone -q ${origin} ${a}`.quiet();
    const ga = (...x: string[]) => $`git -C ${a} -c user.name=t -c user.email=t@t ${x}`.quiet();
    writeFileSync(join(a, "package.json"), '{\n  "name": "x",\n  "version": "0.1.0"\n}\n');
    writeFileSync(join(a, "README.md"), "hello\n");
    await ga("add", "-A");
    await ga("commit", "-q", "-m", "Initial");
    await ga("push", "-q", "origin", "HEAD:main");
    const sums = join(a, "..", `sums-${Date.now()}.txt`);
    writeFileSync(sums, ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"].map((t) => `${"a".repeat(64)}  patteo-${t}.tar.gz`).join("\n") + "\n");
    return { origin, a, ga, sums, clone };
  }

  test("sets the version, writes the formula, and pushes the commit", async () => {
    const s = await setup();
    const r = await finalizeRelease({ cwd: s.a, version: "0.2.0", checksums: s.sums });
    expect(r).toEqual({ committed: true, pushed: true });
    const b = s.clone("b");
    await $`git clone -q ${s.origin} ${b}`.quiet();
    expect(JSON.parse(readFileSync(join(b, "package.json"), "utf8")).version).toBe("0.2.0");
    expect(readFileSync(join(b, "Formula", "patteo.rb"), "utf8")).toContain('version "0.2.0"');
    expect((await $`git -C ${b} log -1 --format=%s%n%an`.text()).trim()).toBe("chore(release): v0.2.0\ngithub-actions[bot]");
    // Re-running for the same release changes nothing.
    expect(await finalizeRelease({ cwd: b, version: "0.2.0", checksums: s.sums })).toEqual({ committed: false, pushed: false });
  });

  test("when main moved while the release was building, it rebases and still lands", async () => {
    const s = await setup();
    // Someone merges to main after the release started.
    const other = s.clone("other");
    await $`git clone -q ${s.origin} ${other}`.quiet();
    writeFileSync(join(other, "README.md"), "hello, edited while releasing\n");
    await $`git -C ${other} -c user.name=t -c user.email=t@t commit -qam "Edit the README"`.quiet();
    await $`git -C ${other} push -q origin HEAD:main`.quiet();

    expect(await finalizeRelease({ cwd: s.a, version: "0.2.0", checksums: s.sums })).toEqual({ committed: true, pushed: true });
    const log = (await $`git -C ${s.origin} log --format=%s main`.text()).trim().split("\n");
    expect(log).toEqual(["chore(release): v0.2.0", "Edit the README", "Initial"]);
  });

  test("a conflicting edit to the same lines stops with a clear error instead of guessing", async () => {
    const s = await setup();
    const other = s.clone("other2");
    await $`git clone -q ${s.origin} ${other}`.quiet();
    writeFileSync(join(other, "package.json"), '{\n  "name": "x",\n  "version": "9.9.9"\n}\n');
    await $`git -C ${other} -c user.name=t -c user.email=t@t commit -qam "Someone edits the version"`.quiet();
    await $`git -C ${other} push -q origin HEAD:main`.quiet();
    await expect(finalizeRelease({ cwd: s.a, version: "0.2.0", checksums: s.sums })).rejects.toThrow("no longer applies cleanly");
    expect(existsSync(join(s.a, ".git", "rebase-merge"))).toBe(false); // left clean, not mid-rebase
  });
});

describe("package.json edits", () => {
  const write = (dir: string, body: object) => writeFileSync(join(dir, "package.json"), `${JSON.stringify(body, null, 2)}\n`);

  test("adding a script is tooling, not a release", async () => {
    const r = await repo();
    write(r.dir, { name: "x", version: "0.1.0", scripts: { test: "bun test" } });
    await r.g("add", "-A");
    await r.g("commit", "-q", "-m", "Initial");
    await r.g("tag", "v0.1.0");
    write(r.dir, { name: "x", version: "0.1.0", scripts: { test: "bun test", demo: "vhs docs/demo.tape" } });
    await r.g("add", "-A");
    await r.g("commit", "-q", "-m", "Add a demo script");

    const plan = planRelease({ last: "0.1.0", initial: "0.1.0", commits: await commitsSince(r.dir, "0.1.0", "HEAD") });
    expect(plan.release).toBe(false);
    expect(plan.reason).toContain("nothing that ships changed");
  });

  test("a new dependency is a patch release", async () => {
    const r = await repo();
    write(r.dir, { name: "x", version: "0.1.0" });
    await r.g("add", "-A");
    await r.g("commit", "-q", "-m", "Initial");
    await r.g("tag", "v0.1.0");
    write(r.dir, { name: "x", version: "0.1.0", dependencies: { ws: "^8.0.0" } });
    await r.g("add", "-A");
    await r.g("commit", "-q", "-m", "Use ws for the socket");

    const plan = planRelease({ last: "0.1.0", initial: "0.1.0", commits: await commitsSince(r.dir, "0.1.0", "HEAD") });
    expect(plan.release).toBe(true);
    expect(plan.version).toBe("0.1.1");
  });
});
