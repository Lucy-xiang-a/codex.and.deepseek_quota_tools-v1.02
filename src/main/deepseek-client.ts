import { EventEmitter } from 'node:events';
import { parseDeepSeekBalance, staleDeepSeekBalance, type DeepSeekBalanceResponse } from './data';
import type { DeepSeekBalance } from '../shared/types';

export class DeepSeekClient extends EventEmitter {
  private apiKey: string | null;
  private balance: DeepSeekBalance | null;
  private intervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(apiKey: string | null, initialBalance: DeepSeekBalance | null, intervalMs = 60_000) {
    super();
    this.apiKey = apiKey?.trim() || null;
    this.balance = initialBalance;
    this.intervalMs = Math.max(5_000, intervalMs);
  }

  getBalance(): DeepSeekBalance | null { return this.balance ? structuredClone(this.balance) : null; }

  setIntervalMs(intervalMs: number): void {
    this.intervalMs = Math.max(5_000, intervalMs);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => void this.refresh(), this.intervalMs);
    }
  }

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey?.trim() || null;
    if (!this.apiKey) {
      this.setBalance(staleDeepSeekBalance(this.balance, 'missing_key', '请在偏好设置中填写 DeepSeek API Key'));
    }
  }

  async start(): Promise<DeepSeekBalance | null> {
    this.stopped = false;
    const result = await this.refresh();
    this.pollTimer ??= setInterval(() => void this.refresh(), this.intervalMs);
    return result;
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async refresh(): Promise<DeepSeekBalance | null> {
    if (this.stopped) return this.getBalance();
    if (!this.apiKey) {
      const next = staleDeepSeekBalance(this.balance, 'missing_key', '请在偏好设置中填写 DeepSeek API Key');
      this.setBalance(next);
      return next;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
      const payload = await response.json() as DeepSeekBalanceResponse;
      const next = parseDeepSeekBalance(payload);
      this.setBalance(next);
      return next;
    } catch (error) {
      const message = error instanceof Error && error.name === 'AbortError'
        ? 'DeepSeek 请求超时'
        : error instanceof Error ? error.message : 'DeepSeek 连接失败';
      const next = staleDeepSeekBalance(this.balance, 'error', message);
      this.setBalance(next);
      return next;
    } finally {
      clearTimeout(timeout);
    }
  }

  private setBalance(balance: DeepSeekBalance): void {
    this.balance = balance;
    this.emit('balance', this.getBalance());
  }
}
