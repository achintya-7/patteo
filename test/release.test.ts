import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { $ } from "bun";
import { archiveName, checksumLines, TARGETS } from "../scripts/package";
import { formulaText, parseChecksums } from "../scripts/update-formula";

const root = join(import.meta.dir, "..");

describe("release artifacts", () => {
  test("archives are named per platform, zip only on Windows, and checksums are sorted sha256sum lines", () => {
    expect(TARGETS).toEqual(["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "windows-x64"]);
    expect(archiveName("linux-x64")).toBe("patteo-linux-x64.tar.gz");
    expect(archiveName("windows-x64")).toBe("patteo-windows-x64.zip");
    expect(checksumLines([{ name: "b.tar.gz", sha256: "2".repeat(64) }, { name: "a.tar.gz", sha256: "1".repeat(64) }])).toBe(`${"1".repeat(64)}  a.tar.gz\n${"2".repeat(64)}  b.tar.gz\n`);
  });

  test("the Homebrew formula points at every platform's archive with its hash", () => {
    const sums = Object.fromEntries(TARGETS.filter((t) => !t.startsWith("windows")).map((t, i) => [`patteo-${t}.tar.gz`, String(i + 1).repeat(64)]));
    const rb = formulaText("1.2.3", sums);
    expect(rb).toContain('version "1.2.3"');
    expect(rb).toContain('license "Apache-2.0"');
    for (const t of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]) {
      expect(rb).toContain(`url "https://github.com/achintya-7/patteo/releases/download/v1.2.3/patteo-${t}.tar.gz"`);
      expect(rb).toContain(`sha256 "${sums[`patteo-${t}.tar.gz`]}"`);
    }
    expect(rb).toContain("on_arm do");
    expect(rb).toContain('bin.install "patteo"');
    expect(() => formulaText("1.2.3", {})).toThrow("no entry for patteo-darwin-arm64.tar.gz");
  });

  test("checksums.txt is read the way both installers read it", () => {
    const text = `${"a".repeat(64)}  patteo-linux-x64.tar.gz\n${"B".repeat(64)} *patteo-windows-x64.zip\nnot a checksum line\n`;
    expect(parseChecksums(text)).toEqual({ "patteo-linux-x64.tar.gz": "a".repeat(64), "patteo-windows-x64.zip": "b".repeat(64) });
  });
});

describe("install.sh", () => {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const asset = `patteo-${os}-${arch}.tar.gz`;
  let dir: string;
  let server: ReturnType<typeof Bun.serve>;
  let tamper = false;
  let archive: Buffer;
  let sums: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "patteo-install-"));
    // A stand-in "release": a tarball whose patteo prints a version, like the real binary.
    const stage = join(dir, "stage");
    mkdirSync(stage);
    writeFileSync(join(stage, "patteo"), '#!/bin/sh\necho "patteo 9.9.9"\n');
    chmodSync(join(stage, "patteo"), 0o755);
    await $`tar -czf ${join(dir, asset)} -C ${stage} patteo`.quiet();
    archive = readFileSync(join(dir, asset));
    sums = `${createHash("sha256").update(archive).digest("hex")}  ${asset}\n`;
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path.includes("/v404.0.0/")) return new Response("not found", { status: 404 }); // a release that doesn't exist
        if (path.endsWith("/checksums.txt")) return new Response(sums);
        if (path.endsWith(`/${asset}`)) return new Response(new Uint8Array(tamper ? Buffer.concat([archive, Buffer.from("x")]) : archive));
        return new Response("not found", { status: 404 });
      },
    });
  });
  afterAll(() => server.stop(true));

  const run = (args: string[], env: Record<string, string> = {}) =>
    $`sh ${join(root, "install.sh")} ${args}`.env({ ...process.env, PATTEO_BASE_URL: `http://127.0.0.1:${server.port}/releases`, ...env }).nothrow().quiet();

  test("the script is valid POSIX sh", async () => {
    expect((await $`sh -n ${join(root, "install.sh")}`.nothrow().quiet()).exitCode).toBe(0);
  });

  test("installs the latest release, verified, and the binary runs", async () => {
    const target = join(dir, "bin-latest");
    const r = await run(["--dir", target]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toContain("Installed patteo 9.9.9");
    expect(existsSync(join(target, "patteo"))).toBe(true);
    expect((await $`${join(target, "patteo")} --version`.text()).trim()).toBe("patteo 9.9.9");
  });

  test("a pinned version, the env-var form, and an upgrade over an existing install", async () => {
    const target = join(dir, "bin-pinned");
    expect((await run(["--version", "1.0.0", "--dir", target])).exitCode).toBe(0);
    expect((await run([], { PATTEO_INSTALL_DIR: target, PATTEO_VERSION: "v1.0.0" })).exitCode).toBe(0);
    expect((await $`${join(target, "patteo")} --version`.text()).trim()).toBe("patteo 9.9.9");
  });

  test("a download that doesn't match its checksum is refused and nothing is installed", async () => {
    tamper = true;
    try {
      const target = join(dir, "bin-tampered");
      const r = await run(["--dir", target]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr.toString()).toContain("checksum mismatch");
      expect(existsSync(join(target, "patteo"))).toBe(false);
    } finally {
      tamper = false;
    }
  });

  test("an unknown release, an unknown flag, and --uninstall", async () => {
    const target = join(dir, "bin-uninstall");
    expect((await run(["--dir", target, "--bogus"])).exitCode).toBe(1);
    const r = await run(["--dir", target, "--version", "404.0.0"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("download failed");
    await run(["--dir", target]);
    expect(existsSync(join(target, "patteo"))).toBe(true);
    expect((await run(["--dir", target, "--uninstall"])).exitCode).toBe(0);
    expect(existsSync(join(target, "patteo"))).toBe(false);
  });
});
