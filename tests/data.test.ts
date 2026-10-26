import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatCountdown, labelForDuration, mapRateLimitResponse, mergeRateLimitUpdate, parseDeepSeekBalance, quotaRingLevel } from '../src/main/data';
import { commandForCliPath } from '../src/main/codex-client';
import { LocalState } from '../src/main/settings';

describe('quota mapping', () => {
  it('maps used percent to remaining percent and labels known windows', () => {
    const snapshot = mapRateLimitResponse({ account: { type: 'chatgpt', email: 'a@b.com', planType: 'plus' } }, {
      rateLimitsByLimitId: { codex: { primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 2000 }, secondary: { usedPercent: 38, windowDurationMins: 10080, resetsAt: 3000 } } },
      rateLimitResetCredits: { availableCount: 3 },
    });
    expect(snapshot.primary?.remainingPercent).toBe(99);
    expect(snapshot.primary?.label).toBe('5小时');
    expect(snapshot.secondary?.remainingPercent).toBe(62);
    expect(snapshot.secondary?.label).toBe('1周');
    expect(snapshot.availableResets).toBe(3);
  });

  it('merges sparse updates without clearing old fields', () => {
    const previous = mapRateLimitResponse({ account: { type: 'chatgpt', email: null, planType: 'plus' } }, { rateLimits: { primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 2000 }, secondary: { usedPercent: 20, windowDurationMins: 10080, resetsAt: 3000 } } });
    const next = mergeRateLimitUpdate(previous, { rateLimits: { primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 4000 } } });
    expect(next.primary?.remainingPercent).toBe(70);
    expect(next.secondary?.remainingPercent).toBe(80);
  });

  it('formats countdowns', () => {
    expect(formatCountdown(1000, 0)).toBe('16分后重置');
    expect(formatCountdown(0, 0)).toBe('重置时间未知');
    expect(labelForDuration(1440)).toBe('1天');
  });

  it('builds Windows commands for executable and shim based CLIs', () => {
    const exists = () => true;
    expect(commandForCliPath('C:\\Tools\\codex.exe', exists)).toEqual({ command: 'C:\\Tools\\codex.exe', args: [] });
    expect(commandForCliPath('C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd', exists)).toEqual({ command: 'C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd', args: [], shell: true });
    expect(commandForCliPath('C:\\Tools\\codex.ps1', exists)?.command).toBe('powershell.exe');
    expect(commandForCliPath('C:\\missing\\codex.exe', () => false)).toBeNull();
  });

  it('assigns ring colors at every remaining-percent boundary', () => {
    expect(quotaRingLevel(null)).toBe('empty');
    expect(quotaRingLevel(0)).toBe('empty');
    expect(quotaRingLevel(1)).toBe('red');
    expect(quotaRingLevel(10)).toBe('red');
    expect(quotaRingLevel(11)).toBe('yellow');
    expect(quotaRingLevel(50)).toBe('yellow');
    expect(quotaRingLevel(51)).toBe('green');
    expect(quotaRingLevel(100)).toBe('green');
  });

  it('parses DeepSeek CNY balance fields', () => {
    const balance = parseDeepSeekBalance({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.50', granted_balance: '2', topped_up_balance: 10.5 }],
    });
    expect(balance.state).toBe('connected');
    expect(balance.currency).toBe('CNY');
    expect(balance.totalBalance).toBe(12.5);
    expect(balance.grantedBalance).toBe(2);
    expect(balance.toppedUpBalance).toBe(10.5);
  });

  it('migrates compact scale and old pin settings without retaining follow mode', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-quota-test-'));
    await writeFile(join(directory, 'state.json'), JSON.stringify({ settings: { pinMode: 'follow', compactScale: 2.5 } }), 'utf8');
    const state = new LocalState(directory);
    await state.load();
    expect(state.getSettings().pinMode).toBe('off');
    expect(state.getSettings().compactScale).toBe(1.75);
    await state.updateSettings({ compactScale: 0.8 });
    const saved = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
    expect(saved.settings.compactScale).toBe(0.8);
  });
});
