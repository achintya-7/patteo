/**
 * Writes Formula/patteo.rb for a release from its checksums.txt. The release workflow runs this
 * after publishing, so the formula always points at assets that exist, with the real hashes.
 *
 *   bun scripts/update-formula.ts <version> <checksums.txt> [--out Formula/patteo.rb] [--base <url>]
 *
 * `--base` replaces https://github.com/<repo>/releases/download/v<version> (used to test against files).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const REPO = "achintya-7/patteo";

/** name → sha256 from `sha256  name` lines. */
export function parseChecksums(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim());
    if (m) out[m[2]!] = m[1]!.toLowerCase();
  }
  return out;
}

export function formulaText(version: string, sums: Record<string, string>, base = `https://github.com/${REPO}/releases/download/v${version}`): string {
  const asset = (target: string) => {
    const name = `patteo-${target}.tar.gz`;
    const sha = sums[name];
    if (!sha) throw new Error(`checksums.txt has no entry for ${name}`);
    return `      url "${base}/${name}"\n      sha256 "${sha}"`;
  };
  return `class Patteo < Formula
  desc "Fast, keyboard-first terminal client for Paseo"
  homepage "https://github.com/${REPO}"
  version "${version}"
  license "Apache-2.0"

  on_macos do
    on_arm do
${asset("darwin-arm64")}
    end
    on_intel do
${asset("darwin-x64")}
    end
  end

  on_linux do
    on_arm do
${asset("linux-arm64")}
    end
    on_intel do
${asset("linux-x64")}
    end
  end

  def install
    bin.install "patteo"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/patteo --version")
  end
end
`;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ options: { out: { type: "string" }, base: { type: "string" } }, allowPositionals: true });
  const [version, checksums] = positionals;
  if (!version || !checksums) throw new Error("usage: update-formula.ts <version> <checksums.txt> [--out file] [--base url]");
  const out = values.out ?? "Formula/patteo.rb";
  mkdirSync(dirname(out), { recursive: true }); // the first release creates Formula/
  writeFileSync(out, formulaText(version.replace(/^v/, ""), parseChecksums(readFileSync(checksums, "utf8")), values.base));
  console.log(`Wrote ${out} for ${version}`);
}
