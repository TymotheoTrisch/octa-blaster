import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateUsers } from './server.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(value => { const index = value.indexOf('='); return [value.slice(0, index), value.slice(index + 1)]; }));
try {
  const path = resolve(args['--output'] || 'users.json'), id = args['--id'];
  let users = []; try { users = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const token = randomBytes(32).toString('base64url');
  const user = { id, tokenHash: createHash('sha256').update(token).digest('hex'), provider: args['--provider'] || 'openai', model: args['--model'], apiKeyEnv: args['--key-env'] || 'OCTA_OPENAI_KEY', perMinute: 10, dailyRequests: 200, retention: { idleDays: 30, maxDays: 90 }, remoteStore: true, approvedData: false };
  if (users.some(item => item.id === id)) throw new Error('Usuário já cadastrado.'); validateUsers([...users, user]);
  const secretsDir = resolve('.secrets'); await mkdir(secretsDir, { recursive: true, mode: 0o700 });
  const credentialPath = join(secretsDir, `${id}.txt`); await writeFile(credentialPath, token, { flag: 'wx', mode: 0o600 });
  await writeFile(path, JSON.stringify([...users, user], null, 2), { mode: 0o600 });
  console.log('Usuário cadastrado. Entregue sua credencial pessoal pelo arquivo privado em .secrets; não envie a chave do provedor.');
} catch { console.error('Não foi possível cadastrar. Confira identificador, modelo, provedor e arquivo de usuários.'); process.exitCode = 1; }
