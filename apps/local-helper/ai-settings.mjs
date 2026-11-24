import { randomUUID, createHash } from 'node:crypto';

export const PROVIDERS = ['chatgpt', 'openai', 'gemini', 'claude', 'nvidia', 'gateway'];
export const DEFAULT_RETENTION = { idleDays: 30, maxDays: 90 };
const text = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\u0000-\u0008]/.test(value);
export function aiSettings(state) {
  return state.ai || { provider: 'chatgpt', providers: {}, profiles: [{ id: 'default', name: '', role: 'Atendente de suporte', products: '', tone: 'Claro, cordial e objetivo', preferences: '', aliases: [], examples: [] }], profileId: 'default', retention: DEFAULT_RETENTION, sessions: {}, pendingDeletes: [] };
}
export function publicSettings(state) {
  const ai = aiSettings(state);
  const gateway = ai.providers.gateway || {};
  const historyNamespace = ai.provider === 'gateway' ? `gateway_${createHash('sha256').update(`${gateway.baseUrl || ''}|${gateway.apiKey || ''}`).digest('hex')}` : 'local';
  return { provider: ai.provider, historyNamespace, providers: Object.fromEntries(PROVIDERS.filter(id => id !== 'chatgpt').map(id => {
    const value = ai.providers[id] || {};
    return [id, { model: value.model || '', hasKey: !!value.apiKey, remoteStore: value.remoteStore !== false, approvedData: value.approvedData === true, baseUrl: value.baseUrl || '' }];
  })), profiles: ai.profiles, profileId: ai.profileId, retention: ai.retention, pendingDeletes: ai.pendingDeletes.length, storedTickets: Object.keys(ai.sessions).length };
}
export function updateSettings(state, input) {
  const current = aiSettings(state);
  if (!PROVIDERS.includes(input.provider) || !Array.isArray(input.profiles) || !input.profiles.length || input.profiles.length > 10) throw new Error('Configuração de IA inválida.');
  const profiles = input.profiles.map(profile => {
    if (!profile || !/^[a-zA-Z0-9-]{1,80}$/.test(profile.id) || !text(profile.name, 120) || !text(profile.role, 160) || !text(profile.products, 300) || !text(profile.tone, 200) || !text(profile.preferences, 600) || !Array.isArray(profile.aliases) || profile.aliases.length > 6 || profile.aliases.some(alias => !text(alias, 80)) || !Array.isArray(profile.examples) || profile.examples.length > 3 || profile.examples.some(example => !text(example, 2000))) throw new Error('Perfil inválido ou acima do limite.');
    return Object.fromEntries(['id', 'name', 'role', 'products', 'tone', 'preferences', 'aliases', 'examples'].map(key => [key, profile[key]]));
  });
  if (new Set(profiles.map(profile => profile.id)).size !== profiles.length || !profiles.some(profile => profile.id === input.profileId)) throw new Error('Selecione um perfil válido.');
  const retention = input.retention;
  if (!retention || !Number.isInteger(retention.idleDays) || !Number.isInteger(retention.maxDays) || retention.idleDays < 1 || retention.maxDays < retention.idleDays || retention.maxDays > 365) throw new Error('Use retenção entre 1 e 365 dias, com idade máxima maior ou igual à inatividade.');
  const providers = { ...current.providers };
  for (const [id, config] of Object.entries(input.providers || {})) {
    if (!PROVIDERS.includes(id) || id === 'chatgpt' || !text(config.model, 160) || !/^[a-zA-Z0-9_./:-]*$/.test(config.model) || (config.apiKey !== undefined && (!text(config.apiKey, 4096) || /\s/.test(config.apiKey)))) throw new Error('Provedor, modelo ou credencial inválidos.');
    let baseUrl = '';
    if (id === 'gateway' && config.baseUrl) { const url = new URL(config.baseUrl); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('O servidor da equipe deve usar uma origem HTTPS, sem caminho ou credenciais na URL.'); baseUrl = url.origin; }
    const changedGateway = id === 'gateway' && providers[id]?.baseUrl && providers[id].baseUrl !== baseUrl;
    providers[id] = { ...providers[id], ...(changedGateway ? { apiKey: '' } : {}), model: config.model, remoteStore: config.remoteStore !== false, approvedData: config.approvedData === true, baseUrl, ...(config.apiKey ? { apiKey: config.apiKey } : {}), ...(config.removeKey ? { apiKey: '' } : {}) };
  }
  const ai = { ...current, provider: input.provider, providers, profiles, profileId: input.profileId, retention: { idleDays: retention.idleDays, maxDays: retention.maxDays } };
  const active = providers[input.provider];
  if (input.provider !== 'chatgpt' && active?.apiKey && (input.provider === 'gateway' ? !active.baseUrl : !active.model)) throw new Error('Informe o modelo ou o endereço do servidor da equipe antes de ativar a conexão.');
  return { ...state, ai };
}

export function personaPrompt() { return ''; }

export function addStyleExample(state, author, example) {
  const ai = aiSettings(state), profile = ai.profiles.find(item => item.id === ai.profileId);
  const normal = value => value.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
  if (!profile || !text(author, 120) || ![profile.name, ...profile.aliases].filter(Boolean).some(name => normal(name) === normal(author)) || !text(example, 2000) || !example.trim()) throw new Error('Confira a autoria e revise o exemplo nas configurações do seu perfil.');
  const examples = [...new Set([example.trim(), ...profile.examples])].slice(0, 3);
  return { ...state, ai: { ...ai, profiles: ai.profiles.map(item => item.id === profile.id ? { ...profile, examples } : item) } };
}

export const newProfileId = () => randomUUID();
