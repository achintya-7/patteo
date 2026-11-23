/** Opens an http(s) URL in the user's browser; false if it isn't a web URL or can't launch. */
export function openUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const cmd =
    process.platform === "darwin" ? ["open", url]
    : process.platform === "win32" ? ["cmd", "/c", "start", "", url]
    : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}
