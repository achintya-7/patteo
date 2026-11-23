/**
 * Turns the tape's recording into docs/demo.gif.
 *
 *   bun run demo       # vhs records demo.mp4 with docs/demo.tape, then this file makes the GIF
 *
 * One palette built from every frame, so the diff's row tints and syntax colours survive the
 * 256-colour GIF limit; without it green and red rows both quantise to the same grey.
 */
const SRC = "demo.mp4";
const PALETTE = "/tmp/patteo-demo-palette.png";
const OUT = "docs/demo.gif";

export {};

if (!(await Bun.file(SRC).exists())) {
  console.error(`demo-gif: ${SRC} is missing — run \`vhs docs/demo.tape\` first`);
  process.exit(1);
}

const filter = "fps=14,scale=1200:-1:flags=lanczos";
const result = await Bun.$`ffmpeg -v error -i ${SRC} -vf ${`${filter},palettegen=max_colors=256:stats_mode=full`} ${PALETTE} -y`.quiet();
if (result.exitCode !== 0) process.exit(result.exitCode);

const gif = await Bun.$`ffmpeg -v error -i ${SRC} -i ${PALETTE} -lavfi ${`${filter}[x];[x][1:v]paletteuse=dither=sierra2_4a`} -loop 0 ${OUT} -y`.quiet();
if (gif.exitCode !== 0) process.exit(gif.exitCode);

await Bun.file(SRC).delete();
const size = (await Bun.file(OUT).stat()).size;
console.log(`demo-gif: wrote ${OUT} (${(size / 1024 / 1024).toFixed(1)} MB)`);
