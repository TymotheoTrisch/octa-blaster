import { spawn } from 'node:child_process';

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
const processStart = pid => pid === process.pid ? processStartedAt : windowsProcessStart(pid);

/** PID sozinho não identifica um processo depois de reiniciar o computador. */
export async function isLockOwnerAlive(record, modifiedAt, probe = process.platform === 'win32' ? processStart : async () => null) {
  if (!Number.isSafeInteger(record.pid) || record.pid <= 0) return true;
  const started = await probe(record.pid);
  if (started !== null) {
    if (Number.isFinite(record.startedAt)) return Math.abs(started - record.startedAt) < 2000;
    return started <= modifiedAt + 1000; // Migração do lock antigo: o dono precisa ser anterior ao arquivo.
  }
  try { process.kill(record.pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}
