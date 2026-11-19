import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGithubRelease } from '../services/updates/updateChecker.ts';

test('update checks use the official project release endpoint', async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    return { ok: true, json: async () => ({ tag_name: 'v0.6.0', assets: [] }) };
  };
  try {
    const result = await checkGithubRelease('0.5.9');
    assert.deepEqual(requests, ['https://api.github.com/repos/luizGDpulz/octa-blaster/releases/latest']);
    assert.equal(result.hasUpdate, true);
    assert.equal(result.releaseUrl, 'https://github.com/luizGDpulz/octa-blaster/releases');
  } finally { globalThis.fetch = previous; }
});
