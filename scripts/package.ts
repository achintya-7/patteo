/**
 * Builds the release artifacts: one standalone binary per platform (Bun cross-compiles them all
 * from any machine), archived as patteo-<os>-<arch>.tar.gz (.zip on Windows), plus checksums.txt.
 * The names carry no version, so `releases/latest/download/<name>` always works; the version
 * lives in the release tag.
 *
 *   bun scripts/package.ts                      all targets into dist/release
 *   bun scripts/package.ts --targets linux-x64  just one
 *
 * Needs every platform's native OpenTUI package installed: `bun install --os="*" --cpu="*"`.
 */
import { $ } from "bun";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

export const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "windows-x64"] as const;

export const archiveName = (target: string) => `patteo-${target}.${target.startsWith("windows") ? "zip" : "tar.gz"}`;

/** `sha256  name` per line, the format `sha256sum -c` and both installers read. */
export const checksumLines = (entries: { name: string; sha256: string }[]) =>
  entries.map((e) => `${e.sha256}  ${e.name}`).sort((a, b) => a.split("  ")[1]!.localeCompare(b.split("  ")[1]!)).join("\n") + "\n";

if (import.meta.main) {
  const { values } = parseArgs({ options: { targets: { type: "string" }, out: { type: "string" } } });
  const targets = (values.targets ? values.targets.split(",") : [...TARGETS]).map((t) => t.trim());
  for (const t of targets) if (!(TARGETS as readonly string[]).includes(t)) throw new Error(`unknown target "${t}" (known: ${TARGETS.join(", ")})`);
  const out = values.out ?? "dist/release";
  const stage = join(out, ".stage");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  const sums: { name: string; sha256: string }[] = [];
  for (const target of targets) {
    const exe = target.startsWith("windows") ? "patteo.exe" : "patteo";
    const dir = join(stage, target);
    mkdirSync(dir, { recursive: true });
    // Linux links glibc: tell OpenTUI at build time so only that native library is embedded.
    const defines = target.startsWith("linux") ? ["--define", 'process.env.OPENTUI_LIBC="glibc"'] : [];
    console.log(`• ${target}: compiling`);
    await $`bun build --compile --minify --target=bun-${target} ${defines} ./src/index.tsx --outfile ${join(dir, exe)}`.quiet();

    const name = archiveName(target);
    const archive = join(out, name);
    if (name.endsWith(".zip")) await $`cd ${dir} && zip -q -9 ${join("..", "..", name)} ${exe}`.quiet();
    else await $`tar -czf ${archive} -C ${dir} ${exe}`.quiet();
    sums.push({ name, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") });
    console.log(`  ${name}  ${(readFileSync(archive).length / 1024 / 1024).toFixed(1)} MB`);
  }
  writeFileSync(join(out, "checksums.txt"), checksumLines(sums));
  rmSync(stage, { recursive: true, force: true });
  console.log(`\nWrote ${sums.length} archives and checksums.txt to ${out}`);
}
