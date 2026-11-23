import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PrototypeError } from './auth.mjs';
import { isLockOwnerAlive, processStartedAt } from './processIdentity.mjs';

// O conteúdo entra por stdin, nunca por argumentos, variáveis de ambiente ou logs.
export function dpapi(value, decrypt = false) {
  if (process.platform !== 'win32') return Promise.reject(new PrototypeError('vault_windows_required'));
  const script = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); ${decrypt
    ? '$b=[Convert]::FromBase64String($v); $r=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($r))'
    : '$b=[Text.Encoding]::UTF8.GetBytes($v); $r=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))'}`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new PrototypeError('vault_unavailable')); }, 15_000);
    child.stdout.setEncoding('utf8').on('data', data => { output += data; });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new PrototypeError('vault_unavailable')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new PrototypeError('vault_unavailable')); });
    child.stdin.end(value);
  });
}

export async function openVault(dataDir, codec = dpapi) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = join(dataDir, 'helper.lock');
  const lockId = randomUUID();
  try { await writeFile(lockPath, JSON.stringify({ pid: process.pid, lockId, startedAt: await processStartedAt ?? undefined }), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw new PrototypeError('vault_unavailable');
    const previous = JSON.parse(await readFile(lockPath, 'utf8'));
    const modified = (await stat(lockPath)).mtimeMs;
    if (await isLockOwnerAlive(previous, modified)) throw new PrototypeError('helper_already_running');
    const current = JSON.parse(await readFile(lockPath, 'utf8'));
    if (current.lockId !== previous.lockId || current.pid !== previous.pid) return openVault(dataDir, codec);
    await unlink(lockPath); // Apenas o controle obsoleto; as credenciais DPAPI permanecem intactas.
    return openVault(dataDir, codec);
  }
  const release = async () => {
    try { const lock = JSON.parse(await readFile(lockPath, 'utf8')); if (lock.lockId === lockId) await unlink(lockPath); } catch {}
  };
  const path = join(dataDir, 'credentials.dpapi');
  let state = { version: 1, accounts: [], activeClientId: null, bridges: [], preferences: { enabled: false, model: '' } };
  try {
    const stored = JSON.parse(await readFile(path, 'utf8'));
    if (stored.version !== 1 || typeof stored.ciphertext !== 'string') throw new Error('invalid vault');
    state = JSON.parse(await codec(stored.ciphertext, true));
    if (state.version !== 1 || !Array.isArray(state.accounts) || !Array.isArray(state.bridges)) throw new Error('invalid vault');
  } catch (error) {
    if (error.code !== 'ENOENT') { await release(); throw new PrototypeError('vault_unavailable'); }
    try { await codec('vault-initialization-check'); } catch (failure) { await release(); throw failure; }
  }
  let queue = Promise.resolve();
  return {
    read: () => structuredClone(state),
    update(change) {
      const task = queue.then(async () => {
        const next = change(structuredClone(state));
        const ciphertext = await codec(JSON.stringify(next));
        const temp = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(temp, JSON.stringify({ version: 1, ciphertext }), { flag: 'wx', mode: 0o600 });
          await rename(temp, path);
          state = next;
        } finally { await unlink(temp).catch(() => {}); }
        return structuredClone(state);
      });
      queue = task.catch(() => {});
      return task;
    },
    async close() { await queue; await release(); },
  };
}

export function memoryVault() {
  let state = { version: 1, accounts: [], activeClientId: null, bridges: [], preferences: { enabled: false, model: '' } };
  return { read: () => structuredClone(state), async update(change) { state = change(structuredClone(state)); return structuredClone(state); }, async close() {} };
}
