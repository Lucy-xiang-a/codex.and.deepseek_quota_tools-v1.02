import { execFileSync, spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { mapRateLimitResponse, mergeRateLimitUpdate, staleSnapshot, type AccountResponse, type RateLimitResponse } from './data';
import type { QuotaSnapshot } from '../shared/types';

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

export class CodexClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private pollTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private starting: Promise<void> | null = null;
  private stopped = false;
  private snapshot: QuotaSnapshot;
  private readonly initialSnapshot: QuotaSnapshot | null;
  private intervalMs: number;

  constructor(initialSnapshot: QuotaSnapshot | null, intervalMs = 60_000) {
    super();
    this.initialSnapshot = initialSnapshot;
    this.snapshot = initialSnapshot ?? staleSnapshot(null, 'error', '等待连接 Codex');
    this.intervalMs = intervalMs;
  }

  getSnapshot(): QuotaSnapshot { return structuredClone(this.snapshot); }

  async start(): Promise<void> {
    this.stopped = false;
    await this.refresh();
  }

  setIntervalMs(intervalMs: number): void {
    const next = Math.max(5_000, intervalMs);
    this.intervalMs = next;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = this.proc ? setInterval(() => void this.refresh(), next) : null;
  }

  async refresh(): Promise<QuotaSnapshot> {
    try {
      await this.ensureStarted();
      this.setSnapshot({ ...this.snapshot, state: 'refreshing', error: undefined });
      const account = await this.request<AccountResponse>('account/read', { refreshToken: false });
      if (!account.account || account.account.type !== 'chatgpt') {
        const state = account.requiresOpenaiAuth ? 'unauthenticated' : 'error';
        const message = account.requiresOpenaiAuth ? '请先登录 Codex' : '当前账号不支持 ChatGPT 额度读取';
        const next = staleSnapshot(this.snapshot, state, message);
        this.setSnapshot(next);
        return next;
      }
      const limits = await this.request<RateLimitResponse>('account/rateLimits/read', { excludeResetCreditDetails: false });
      const next = mapRateLimitResponse(account, limits, this.snapshot);
      this.reconnectAttempt = 0;
      this.setSnapshot(next);
      return next;
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      const next = staleSnapshot(this.snapshot, this.proc ? 'stale' : 'cli_missing', err);
      this.setSnapshot(next);
      this.scheduleReconnect();
      return next;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('客户端已停止')); }
    this.pending.clear();
    this.proc?.kill();
    this.proc = null;
  }

  private async ensureStarted(): Promise<void> {
    if (this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const cli = findCodexCli();
      if (!cli) { reject(new Error('未找到 Codex CLI，请确认已安装并可在终端运行 codex')); return; }
      const spawnOptions: SpawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(cli.shell ? { shell: true } : {}),
      };
      const proc = spawn(cli.command, [...cli.args, 'app-server', '--stdio'], spawnOptions) as ChildProcessWithoutNullStreams;
      this.proc = proc;
      let buffer = '';
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) this.handleLine(line);
      });
      proc.stderr.on('data', (chunk: Buffer) => this.emit('log', chunk.toString()));
      proc.once('error', (error) => { this.proc = null; reject(error); });
      proc.once('exit', () => {
        this.proc = null;
        if (!this.stopped) {
          this.setSnapshot(staleSnapshot(this.snapshot, this.snapshot.updatedAt ? 'stale' : 'error', 'Codex 连接已断开'));
          this.scheduleReconnect();
        }
      });
      this.request('initialize', { clientInfo: { name: 'codex-quota-widget', version: '1.0.0' }, capabilities: { experimentalApi: true } })
        .then(() => { this.send({ method: 'initialized' }); this.pollTimer ??= setInterval(() => void this.refresh(), this.intervalMs); resolve(); })
        .catch(reject)
        .finally(() => { this.starting = null; });
    });
    return this.starting;
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: any;
    try { message = JSON.parse(line); } catch { return; }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Codex 请求失败'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'account/rateLimits/updated' && message.params?.rateLimits) {
      this.setSnapshot(mergeRateLimitUpdate(this.snapshot, { rateLimits: message.params.rateLimits }));
    }
  }

  private request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.proc?.stdin.writable) return Promise.reject(new Error('Codex app-server 未连接'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 请求超时`)); }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  private send(message: unknown): void { this.proc?.stdin.write(`${JSON.stringify(message)}\n`); }

  private setSnapshot(snapshot: QuotaSnapshot): void { this.snapshot = snapshot; this.emit('snapshot', this.getSnapshot()); }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(this.reconnectAttempt++, 6));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.refresh(); }, delay);
  }
}

export type CodexCommand = { command: string; args: string[]; shell?: boolean };

export function commandForCliPath(candidate: string, exists: (path: string) => boolean = existsSync): CodexCommand | null {
  const isBare = candidate === 'codex';
  if (!candidate || (!isBare && !exists(candidate))) return null;
  const extension = extname(candidate).toLowerCase();
  if (extension === '.ps1') {
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', candidate],
    };
  }
  if (extension === '.cmd' || extension === '.bat') return { command: candidate, args: [], shell: true };
  return { command: candidate, args: [] };
}

/**
 * Resolve the CLI without assuming that the Electron process inherited the
 * same PATH as the user's terminal. Windows package managers commonly expose
 * codex as .cmd or .ps1 shims, so those are handled explicitly below.
 */
export function findCodexCli(): CodexCommand | null {
  const candidates: string[] = [];
  const add = (value: string | undefined): void => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  add(process.env.CODEX_CLI_PATH);
  add(process.env.CODEX_APP_RUNTIME_CLI_PATH);

  // `where.exe` uses the user's current PATH and catches codex.exe/cmd/ps1
  // shims installed by npm, pnpm, Scoop, or a standalone Codex installer.
  for (const name of ['codex.exe', 'codex.cmd', 'codex.ps1', 'codex']) {
    try {
      const output = execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true });
      output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).forEach(add);
    } catch { /* where.exe returns non-zero when the name is absent */ }
  }

  const home = homedir();
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
  const shimNames = ['codex.exe', 'codex.cmd', 'codex.ps1'];
  const shimRoots = [
    join(appData, 'npm'),
    join(localAppData, 'npm'),
    join(home, '.npm-global', 'bin'),
    join(home, '.local', 'bin'),
    join(home, 'scoop', 'shims'),
    join(localAppData, 'Programs', 'Codex'),
  ];
  for (const root of shimRoots) for (const name of shimNames) add(join(root, name));

  // The desktop app's bundled runtime CLI is versioned one directory below
  // this location, for example ...\\OpenAI\\Codex\\bin\\<version>\\codex.exe.
  const runtimeRoot = join(localAppData, 'OpenAI', 'Codex', 'bin');
  if (existsSync(runtimeRoot)) {
    for (const entry of readdirSync(runtimeRoot, { withFileTypes: true })) {
      const directory = entry.isDirectory() ? join(runtimeRoot, entry.name) : runtimeRoot;
      for (const name of shimNames) add(join(directory, name));
    }
    for (const name of shimNames) add(join(runtimeRoot, name));
  }

  // Keep the bare command as the final fallback for unusual PATH resolution
  // cases. It is intentionally not treated as an existing file below.
  add('codex');

  for (const candidate of candidates) {
    const command = commandForCliPath(candidate);
    if (command) return command;
  }
  return null;
}
