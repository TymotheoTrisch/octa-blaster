const byId = id => document.getElementById(id);
let csrf = '', pending = false, status = { connected: false };
async function refresh() {
  status = await (await fetch('/status')).json();
  byId('identity').textContent = status.connected
    ? `Conta: ${status.identity.name || 'Nome não informado'}\nE-mail: ${status.identity.email || 'Não informado'}\nIdentificador: ${status.identity.subject}\nFranquia autorizada: ${status.planAuthorized ? 'sim' : 'NÃO'}\nSessão expirada: ${status.expired ? 'sim' : 'não'}`
    : 'Sem login.';
  if (status.result) byId('result').textContent = `${status.result.text}\n\nUso informado na resposta: ${JSON.stringify(status.result.usage)}\nConsumo na conta e ausência de cobrança: conferir no ChatGPT.`;
  byId('message').textContent = status.lastError || '';
  update();
}
function update() {
  const ready = status.connected && status.planAuthorized && !status.expired && !pending && !status.busy;
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
    if (!response.ok) throw new Error(body.error);
    return body;
  } catch (error) { byId('message').textContent = error.message || 'A operação local falhou.'; return null; }
  finally { pending = false; update(); }
}
byId('login').onclick = async () => { const result = await post('/auth/start'); if (result) location.assign(result.url); };
byId('disconnect').onclick = async () => { await post('/disconnect'); byId('result').textContent = 'Sessão encerrada.'; byId('model').replaceChildren(); await refresh(); };
byId('models').onclick = async () => {
  const result = await post('/models');
  if (result) { byId('model').replaceChildren(...result.models.map(model => { const option = document.createElement('option'); option.value = model.slug; option.textContent = model.name; return option; })); update(); }
};
byId('test').onclick = async () => { byId('result').textContent = 'Aguardando a confirmação final da resposta…'; const result = await post('/test', { model: byId('model').value, confirmIdentity: byId('confirmIdentity').checked, confirmCredits: byId('confirmCredits').checked }); if (result) await refresh(); else byId('result').textContent = 'O teste não foi concluído. Nenhum rascunho parcial foi aprovado.'; };
for (const id of ['confirmIdentity', 'confirmCredits', 'model']) byId(id).onchange = update;
try { csrf = (await (await fetch('/config')).json()).csrf; await refresh(); }
catch { byId('message').textContent = 'Não foi possível conectar ao auxiliar local.'; }
