import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function aesCodec(masterKey) {
  if (typeof masterKey !== 'string' || !/^[a-f0-9]{64}$/i.test(masterKey)) throw new Error('Configure OCTA_MASTER_KEY com 32 bytes em hexadecimal.');
  const key = Buffer.from(masterKey, 'hex');
  return async (value, decrypt = false) => {
    if (decrypt) { const data = JSON.parse(Buffer.from(value, 'base64').toString('utf8')); const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64')); cipher.setAuthTag(Buffer.from(data.tag, 'base64')); return Buffer.concat([cipher.update(Buffer.from(data.value, 'base64')), cipher.final()]).toString('utf8'); }
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv), encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), value: encrypted.toString('base64') })).toString('base64');
  };
}
