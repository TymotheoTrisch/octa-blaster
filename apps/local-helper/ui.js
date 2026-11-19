const byId = id => document.getElementById(id);
let csrf = '', pending = false, status = { connected: false };
async function refresh() {
  status = await (await fetch('/status')).json();
  byId('identity').textContent = status.connected
    ? `Conta: ${status.identity.name || 'Nome não informado'}\nE-mail: ${status.identity.email || 'Não informado'}\nIdentificador: ${status.identity.subject}\nFranquia autorizada: ${status.planAuthorized ? 'sim' : 'NÃO'}\nSessão expirada: ${status.expired ? 'sim' : 'não'}`
    : 'Sem login.';
  if (status.result) byId('result').textContent = `${status.result.text}\n\nFormato recebido: ${status.result.transport || 'não informado'} (${status.result.contentType || 'cabeçalho não informado'})\nUso informado na resposta: ${JSON.stringify(status.result.usage)}\nConsumo na conta e ausência de cobrança: conferir no ChatGPT.`;
  byId('message').textContent = status.lastError || '';
  const previous = byId('accounts').value;
  byId('accounts').replaceChildren(...(status.accounts || []).map(account => { const option = document.createElement('option'); option.value = account.clientId; option.textContent = `${account.identity.email || account.identity.name || 'Conta'} · ${account.clientId.slice(-6)}`; option.selected = account.active || account.clientId === previous; return option; }));
  byId('enabled').checked = !!status.preferences?.enabled;
  showDiagnostic(status.lastDiagnostic);
  update();
}
function showDiagnostic(diagnostic) {
  byId('diagnostic-section').hidden = !diagnostic;
  byId('diagnostic').textContent = diagnostic ? JSON.stringify(diagnostic, null, 2) : '';
}
function update() {
  const ready = status.connected && status.planAuthorized && !pending && !status.busy;
  byId('models').disabled = !ready;
  byId('test').disabled = !ready || !byId('model').value || !byId('confirmIdentity').checked || !byId('confirmCredits').checked;
  byId('login').disabled = pending || status.busy;
  byId('disconnect').disabled = pending || status.busy;
}
async function post(path, input = {}) {
  pending = true; update();
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octablaster-CSRF': csrf }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok) { showDiagnostic(body.diagnostic); throw new Error(body.error); }
    byId('message').textContent = '';
    showDiagnostic(null);
    return body;
  } catch (error) { byId('message').textContent = error.message || 'A operação local falhou.'; return null; }
  finally { pending = false; update(); }
}
byId('login').onclick = async () => { const result = await post('/auth/start'); if (result) location.assign(result.url); };
byId('new-account').onclick = async () => { const result = await post('/auth/start', { newAccount: true }); if (result) location.assign(result.url); };
byId('select-account').onclick = async () => { const result = await post('/account/select', { clientId: byId('accounts').value }); if (result) { byId('model').replaceChildren(); byId('confirmIdentity').checked = false; byId('confirmCredits').checked = false; await refresh(); } };
byId('save-preferences').onclick = async () => { const result = await post('/preferences', { enabled: byId('enabled').checked, model: byId('model').value, confirmIdentity: byId('confirmIdentity').checked, confirmCredits: byId('confirmCredits').checked }); if (result) { await refresh(); byId('message').textContent = 'Preferências salvas.'; } };
byId('pair-code').onclick = async () => { const result = await post('/pairing/code'); if (result) byId('pairing').textContent = `Código: ${result.code}\nVálido por cinco minutos. Auxiliar: ${location.origin}`; };
byId('revoke-pairing').onclick = async () => { const result = await post('/pairing/revoke'); if (result) { byId('pairing').textContent = 'Pareamentos revogados.'; } };
byId('disconnect').onclick = async () => { await post('/disconnect'); byId('result').textContent = 'Sessão encerrada.'; byId('model').replaceChildren(); await refresh(); };
byId('models').onclick = async () => {
  const result = await post('/models');
  if (result) { byId('model').replaceChildren(...result.models.map(model => { const option = document.createElement('option'); option.value = model.slug; option.textContent = model.name; option.selected = model.slug === status.preferences?.model; return option; })); update(); }
};
byId('test').onclick = async () => { byId('result').textContent = 'Aguardando a confirmação final da resposta…'; const result = await post('/test', { model: byId('model').value, confirmIdentity: byId('confirmIdentity').checked, confirmCredits: byId('confirmCredits').checked }); if (result) await refresh(); else byId('result').textContent = 'O teste não foi concluído. Nenhum rascunho parcial foi aprovado.'; };
for (const id of ['confirmIdentity', 'confirmCredits', 'model']) byId(id).onchange = update;
try { csrf = (await (await fetch('/config')).json()).csrf; await refresh(); }
catch { byId('message').textContent = 'Não foi possível conectar ao auxiliar local.'; }
