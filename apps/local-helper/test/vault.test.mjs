import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { openVault, dpapi } from '../vault.mjs';

function testCodec() {
  const key = randomBytes(32);
  return async (value, decrypt = false) => {
    if (decrypt) { const data = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(); }
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  };
}

test('vault encrypts atomically, serializes updates, restores state and locks a second process', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'octa-vault-test-')), codec = testCodec();
  const vault = await openVault(dir, codec);
  await assert.rejects(openVault(dir, codec), /helper_already_running/);
  await Promise.all([
    vault.update(state => ({ ...state, marker: 'fictional-secret-value' })),
    vault.update(state => ({ ...state, another: true })),
  ]);
  assert.equal(vault.read().marker, 'fictional-secret-value');
  assert.equal(vault.read().another, true);
  assert.ok(!(await readFile(join(dir, 'credentials.dpapi'), 'utf8')).includes('fictional-secret-value'));
  await vault.close();
  const restored = await openVault(dir, codec);
  assert.equal(restored.read().marker, 'fictional-secret-value');
  await restored.close();
  await writeFile(join(dir, 'credentials.dpapi'), 'corrupted');
  await assert.rejects(openVault(dir, codec), /vault_unavailable/);
  assert.equal(await readFile(join(dir, 'credentials.dpapi'), 'utf8'), 'corrupted');
});

test('Windows DPAPI roundtrip protects a fictional value under the current OS user', { skip: process.platform !== 'win32' }, async () => {
  const secret = 'fictional-value-for-dpapi-test';
  const encrypted = await dpapi(secret);
  assert.ok(!encrypted.includes(secret));
  assert.equal(await dpapi(encrypted, true), secret);
});
