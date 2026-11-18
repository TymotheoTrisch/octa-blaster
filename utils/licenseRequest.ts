import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';

export interface LicenseRequest {
  operation: 'Contratação' | 'Troca' | 'Cancelamento';
  database: string;
  quantity?: number;
  firstLicenseExempt?: boolean;
  licenses: string[];
}

export type LicenseRequestResult =
  | { status: 'none' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; request: LicenseRequest };

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();

/** Lê os campos do formulário do e-mail, sem procurar números no título ou no CNPJ. */
export function parseLicenseRequestText(text: string): LicenseRequestResult {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\u00a0/g, ' ').trim()).filter(Boolean);
  const firstField = lines.findIndex(line => /^[^:]{1,120}:/.test(line));
  const heading = normalize(lines.slice(0, firstField < 0 ? lines.length : firstField).join(' '));
  if (!/\blicenca(?:s)?\b/.test(heading)) return { status: 'none' };
  const operations = [...new Set(heading.match(/\b(?:contratacao|troca|cancelamento)\b/g) ?? [])];
  if (!operations.length) return { status: 'none' };
  const invalid = (reason: string): LicenseRequestResult => ({ status: 'invalid', message: `Não foi possível preparar a anotação: ${reason}` });
  if (operations.length !== 1) return invalid('a operação está ambígua no e-mail.');
  const operation = ({ contratacao: 'Contratação', troca: 'Troca', cancelamento: 'Cancelamento' } as const)[operations[0] as 'contratacao' | 'troca' | 'cancelamento'];
  const fields: { label: string; value: string }[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/^([^:]{1,120}):\s*(.*)$/);
    if (!match) return;
    const value = match[2] || (lines[index + 1] && !lines[index + 1]!.includes(':') ? lines[index + 1]! : '');
    fields.push({ label: normalize(match[1]!), value });
  });
  const values = (labels: string[]) => [...new Set(fields.filter(field => labels.includes(field.label)).map(field => field.value.trim()))];
  const database = values(['numero do banco de dados', 'banco de dados', 'numero do banco', 'banco', 'bd']);
  if (database.length !== 1 || !/^\d+$/.test(database[0]!)) return invalid('número do banco ausente, inválido ou divergente no e-mail.');
  const request: LicenseRequest = { operation, database: database[0]!, licenses: [] };
  if (operation === 'Contratação') {
    const quantity = values(['numero de licencas', 'quantidade de licencas', 'quantidade']);
    const exempt = values(['isencao da primeira licenca', 'isenta', 'isencao']).map(normalize);
    if (quantity.length !== 1 || !/^[1-9]\d*$/.test(quantity[0]!) || !Number.isSafeInteger(Number(quantity[0]))) return invalid('quantidade de licenças ausente ou inválida no e-mail.');
    if (exempt.length !== 1 || !['sim', 'nao'].includes(exempt[0]!)) return invalid('isenção da primeira licença ausente ou inválida no e-mail.');
    request.quantity = Number(quantity[0]);
    request.firstLicenseExempt = exempt[0] === 'sim';
  } else {
    const licenses = values([
      'numero da licenca', 'numero das licencas', 'numeros das licencas', 'codigo da licenca', 'codigos das licencas',
      'licenca', 'licencas', 'licenca a ser trocada', 'licenca para troca', 'numero da licenca a ser trocada',
      'licencas para cancelamento', 'licencas a serem canceladas', 'numero das licencas a serem canceladas',
    ]);
    if (!licenses.length || licenses.some(value => !/^(?:Lic_)?\d+(?:\s*[,;\s]\s*(?:Lic_)?\d+)*$/i.test(value))) return invalid('código das licenças ausente ou inválido no e-mail.');
    request.licenses = [...new Set(licenses.flatMap(value => value.split(/[,;\s]+/).map(code => code.replace(/^Lic_/i, ''))))];
    if (operation === 'Troca' && request.licenses.length !== 1) return invalid('há mais de uma licença indicada para troca no e-mail.');
  }
  return { status: 'ready', request };
}

export function readTicketLicenseRequest(scope: HTMLElement): LicenseRequestResult {
  const bodies = Array.from(scope.querySelectorAll<HTMLElement>('.content-comment-interaction'));
  // O e-mail mais próximo do final da conversa tem precedência. Não mistura campos de comentários diferentes.
  for (const body of bodies.reverse()) {
    if (getScopedTicketContainer(body) !== scope || body.closest('[contenteditable="true"], .note-editor, blockquote, .gmail_quote, .yahoo_quoted') || !isTicketElementVisible(body)) continue;
    const clone = body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('blockquote, .gmail_quote, .yahoo_quoted, script, style, [contenteditable], .octablaster-floating-widget').forEach(element => element.remove());
    clone.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
    clone.querySelectorAll('div, p, li, tr').forEach(element => element.append('\n'));
    const text = (clone.textContent || '').split(/(?:-{3,}\s*(?:mensagem original|original message)|\n\s*Em .+ escreveu:)/i)[0]!;
    const result = parseLicenseRequestText(text);
    if (result.status !== 'none') return result;
  }
  return { status: 'none' };
}

export function formatLicenseRequest(request: LicenseRequest): string {
  let description: string;
  if (request.operation === 'Contratação') {
    description = `Contratação ${request.quantity} ${request.quantity === 1 ? 'lic' : 'lics'} (${request.firstLicenseExempt ? 'com isenção da primeira licença' : 'sem isenção'})`;
  } else if (request.operation === 'Troca') description = `Troca lic ${request.licenses[0]}`;
  else description = `Cancelamento lics: ${request.licenses.join(', ')}`;
  return `${description}\n\nBanco: ${request.database}`;
}
