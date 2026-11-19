// Adaptador de sessão local. Também reconhece o auxiliar 0.10 já aberto para preservar o login durante a atualização.
export const HELPER_ORIGIN = 'http://127.0.0.1:53894';
export async function localSession(fetcher = fetch) {
  const home = await fetcher(HELPER_ORIGIN, { signal: AbortSignal.timeout(1000) });
  const cookie = home.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Auxiliar indisponível.');
  const config = await (await fetcher(`${HELPER_ORIGIN}/config`, { headers: { cookie }, signal: AbortSignal.timeout(1000) })).json();
  if (typeof config.csrf !== 'string' || !config.csrf) throw new Error('Auxiliar incompatível.');
  const getStatus = async () => {
    const response = await fetcher(`${HELPER_ORIGIN}/status`, { headers: { cookie }, signal: AbortSignal.timeout(5000) });
    const status = await response.json();
    if (!response.ok || typeof status.connected !== 'boolean' || !Array.isArray(status.accounts)) throw new Error('Auxiliar incompatível.');
    return status;
  };
  await getStatus();
  const post = async (path, body = {}) => {
    const response = await fetcher(`${HELPER_ORIGIN}${path}`, { method: 'POST', headers: { cookie, Origin: HELPER_ORIGIN, 'Content-Type': 'application/json', 'X-Octablaster-CSRF': config.csrf }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || 'A operação local falhou.'), { code: result.code || result.diagnostic?.code, httpStatus: response.status }); return result;
  };
  let legacy = false, awaitingLogin = false;
  async function enableLegacy() {
    const status = await getStatus(), { models } = await post('/models');
    const model = models.find(item => item.slug === status.preferences.model)?.slug || models[0]?.slug;
    if (!model) throw new Error('Nenhum modelo disponível para a conta.');
    await post('/preferences', { enabled: true, model, confirmIdentity: true, confirmCredits: true });
  }
  return {
    post,
    alive: getStatus,
    async accounts() { return (await getStatus()).accounts.map(item => ({ clientId: item.clientId, label: `${item.identity?.email || item.identity?.name || 'Conta'} · ${item.clientId.slice(-8)}`, active: item.active, connected: item.connected })); },
    async select(clientId) { await post('/account/select', { clientId }); return this.connect(false); },
    async connect(newAccount) {
      if (!legacy) {
        try { return await post('/native/connect', { newAccount }); }
        catch (error) { if (error.httpStatus !== 404) throw error; legacy = true; }
      }
      const status = await getStatus();
      if (!newAccount && status.connected && status.planAuthorized) {
        try { await enableLegacy(); return { connected: true }; }
        catch (error) { if (error.code !== 'login_required') throw error; }
      }
      awaitingLogin = true;
      return post('/auth/start', { newAccount });
    },
    async afterLogin() {
      if (!awaitingLogin) return;
      const status = await getStatus();
      if (status.connected && status.planAuthorized) { await enableLegacy(); awaitingLogin = false; }
    },
    async preferences(model) {
      if (!legacy) { try { return await post('/native/preferences', { model }); } catch (error) { if (error.httpStatus !== 404) throw error; legacy = true; } }
      await post('/models'); return post('/preferences', { enabled: true, model, confirmIdentity: true, confirmCredits: true });
    },
  };
}
