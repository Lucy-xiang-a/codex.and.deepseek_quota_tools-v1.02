import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'release-final');
const source = join(release, 'win-unpacked');
const output = join(release, 'Codex-额度-1.0.0-win-x64.zip');
const result = spawnSync('tar.exe', ['-a', '-c', '-f', output, '-C', source, '.'], { stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`已生成 ${output}`);
