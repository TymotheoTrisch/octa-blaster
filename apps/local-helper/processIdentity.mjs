import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export async function linuxProcessIdentity(pid, read = readFile) {
  try {
    const [stat, boot] = await Promise.all([read(`/proc/${pid}/stat`, 'utf8'), read('/proc/sys/kernel/random/boot_id', 'utf8')]);
    const started = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
    return /^\d+$/.test(started || '') && /^[a-f0-9-]+$/i.test(boot.trim()) ? `${boot.trim()}:${started}` : null;
  } catch { return null; }
}

async function windowsProcessStart(pid) {
  return new Promise(resolve => {
    const script = `$ErrorActionPreference='Stop'; [Console]::Out.Write((Get-Process -Id ${pid}).StartTime.ToUniversalTime().ToString('o'))`;
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    const timeout = setTimeout(() => { child.kill(); resolve(null); }, 5000);
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => { clearTimeout(timeout); resolve(null); });
    child.on('close', () => { clearTimeout(timeout); const start = Date.parse(output.trim()); resolve(Number.isFinite(start) ? start : null); });
  });
}

export const processStartedAt = process.platform === 'win32' ? windowsProcessStart(process.pid) : Promise.resolve(null);
export const processBirthIdentity = process.platform === 'linux' ? linuxProcessIdentity(process.pid) : Promise.resolve(null);
const processStart = pid => pid === process.pid ? processStartedAt : windowsProcessStart(pid);
const defaultProbe = process.platform === 'win32' ? processStart : async () => null;

/** PID sozinho não identifica um processo depois de reiniciar o computador. */
export async function isLockOwnerAlive(record, modifiedAt, probe = defaultProbe) {
  if (!Number.isSafeInteger(record.pid) || record.pid <= 0) return true;
  if (process.platform === 'linux' && probe === defaultProbe) {
    const identity = record.pid === process.pid ? await processBirthIdentity : await linuxProcessIdentity(record.pid);
    if (identity && record.birthIdentity) return record.birthIdentity === identity;
    if (identity && record.pid === process.pid) return false; // Migração de um lock antigo com PID reutilizado pelo contêiner.
  }
  const started = await probe(record.pid);
  if (started !== null) {
    if (Number.isFinite(record.startedAt)) return Math.abs(started - record.startedAt) < 2000;
    return started <= modifiedAt + 1000; // Migração do lock antigo: o dono precisa ser anterior ao arquivo.
  }
  try { process.kill(record.pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
