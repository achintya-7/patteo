import { loadHosts, saveHosts, type HostConfig, type HostsFile } from "../config/hosts";
import type { SessionStore } from "../stores/session";
import { HostRuntime } from "./host-runtime";

/** Owns all HostRuntimes and keeps hosts.json in sync with the store. */
export class RuntimeManager {
  private runtimes = new Map<string, HostRuntime>();
  private file: HostsFile;
  /** Write hosts.json on changes (off for tests/scripts that pass their own hosts). */
  private readonly persist: boolean;

  constructor(
    private readonly store: SessionStore,
    opts: { hostsFile?: HostsFile; extraHost?: HostConfig; persist?: boolean } = {},
  ) {
    this.persist = opts.persist ?? !opts.hostsFile;
    this.file = opts.hostsFile ?? loadHosts();
    if (opts.extraHost && !this.file.hosts.some((h) => h.id === opts.extraHost!.id)) {
      this.file = { ...this.file, hosts: [...this.file.hosts, opts.extraHost] };
    }
  }

  start(activeHostId?: string) {
    for (const host of this.file.hosts) this.ensure(host);
    this.store.actions.setActiveHost(activeHostId ?? this.file.defaultHostId);
  }

  hosts(): HostConfig[] {
    return this.file.hosts;
  }

  get(hostId: string): HostRuntime | undefined {
    return this.runtimes.get(hostId);
  }

  private ensure(host: HostConfig) {
    if (this.runtimes.has(host.id)) return;
    this.store.actions.addHost(host);
    const rt = new HostRuntime(host, this.store);
    this.runtimes.set(host.id, rt);
    rt.start();
  }

  addHost(host: HostConfig) {
    this.file = { ...this.file, hosts: [...this.file.hosts.filter((h) => h.id !== host.id), host] };
    if (this.persist) saveHosts(this.file);
    this.ensure(host);
  }

  setDefaultHost(hostId: string) {
    if (this.file.defaultHostId === hostId || !this.file.hosts.some((h) => h.id === hostId)) return;
    this.file = { ...this.file, defaultHostId: hostId };
    if (this.persist) saveHosts(this.file);
  }

  /** Renames a host in hosts.json and the live store (the connection is untouched). */
  renameHost(hostId: string, label: string) {
    const host = this.file.hosts.find((h) => h.id === hostId);
    if (!host) return;
    const name = label.trim() || host.url;
    if (name === host.label) return;
    const next = { ...host, label: name };
    this.file = { ...this.file, hosts: this.file.hosts.map((h) => (h.id === hostId ? next : h)) };
    if (this.persist) saveHosts(this.file);
    this.store.actions.setHostConfig(hostId, next);
  }

  /** Drops the connection and dials again (the SDK also retries on its own). */
  async reconnectHost(hostId: string) {
    const config = this.file.hosts.find((h) => h.id === hostId);
    if (!config) return;
    const old = this.runtimes.get(hostId);
    this.runtimes.delete(hostId);
    await old?.dispose();
    this.ensure(config);
  }

  async removeHost(hostId: string) {
    const hosts = this.file.hosts.filter((h) => h.id !== hostId);
    this.file = { defaultHostId: this.file.defaultHostId === hostId ? hosts[0]?.id ?? "local" : this.file.defaultHostId, hosts };
    if (this.persist) saveHosts(this.file);
    await this.runtimes.get(hostId)?.dispose();
    this.runtimes.delete(hostId);
    this.store.actions.removeHost(hostId);
  }

  async disposeAll() {
    await Promise.all([...this.runtimes.values()].map((r) => r.dispose()));
    this.runtimes.clear();
  }
}
