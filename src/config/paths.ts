import { homedir } from "node:os";
import { join } from "node:path";

const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");

export const CONFIG_DIR = process.env.PATTEO_CONFIG_DIR || join(xdg, "patteo");
export const HOSTS_FILE = join(CONFIG_DIR, "hosts.json");
export const CONFIG_FILE = join(CONFIG_DIR, "config.toml");
export const THEMES_DIR = join(CONFIG_DIR, "themes");

export const PASEO_HOME = process.env.PASEO_HOME || join(homedir(), ".paseo");
