import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';

export const MISSING_FIELD_PLACEHOLDER = '[Falta Informar]';

export interface LicenseRequest {
  operation: 'Contratação' | 'Troca' | 'Cancelamento';
  database: string;
  quantity?: number;
  firstLicenseExempt?: boolean;
  swapReason?: string;
  licenses: string[];
  missingFields?: string[];
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
  const missingFields: string[] = [];

  const databaseRaw = values(['numero do banco de dados', 'banco de dados', 'numero do banco', 'banco', 'bd', 'id do banco']);
  const databaseMatch = databaseRaw.length === 1 ? databaseRaw[0]!.match(/\d+/)?.[0] : undefined;
  const database = databaseMatch ?? MISSING_FIELD_PLACEHOLDER;
  if (!databaseMatch) missingFields.push('Número do Banco de Dados');

  const request: LicenseRequest = { operation, database, licenses: [] };
  const baseLicenseLabels = [
    'numero da licenca', 'numero de licenca', 'numero das licencas', 'numero de licencas',
    'numeros das licencas', 'numeros de licencas', 'codigo da licenca', 'codigos das licencas',
    'licenca', 'licencas', 'licenca a ser trocada', 'licenca para troca',
    'numero da licenca a ser trocada', 'id da licenca',
  ];

  if (operation === 'Contratação') {
    const quantityRaw = values(['numero de licencas', 'numero da licenca', 'quantidade de licencas', 'quantidade', 'qtd de licencas', 'qtd']);
    const quantityMatch = quantityRaw.length === 1 ? quantityRaw[0]!.match(/\d+/)?.[0] : undefined;
    const quantityNum = quantityMatch ? Number(quantityMatch) : NaN;
    if (Number.isSafeInteger(quantityNum) && quantityNum >= 1) {
      request.quantity = quantityNum;
    } else {
      missingFields.push('Quantidade de Licenças');
    }

    const exemptRaw = values(['isencao da primeira licenca', 'isenta', 'isencao']).map(normalize);
    const exemptTokens = exemptRaw.length === 1 ? [...new Set(exemptRaw[0]!.match(/\b(?:sim|nao)\b/g) ?? [])] : [];
    if (exemptTokens.length === 1) {
      request.firstLicenseExempt = exemptTokens[0] === 'sim';
    } else {
      missingFields.push('Isenção da Primeira Licença');
    }
  } else if (operation === 'Troca') {
    const licenseRaw = values(baseLicenseLabels);
    const firstLicense = licenseRaw.length === 1 ? licenseRaw[0]!.match(/\d+/)?.[0] : undefined;
    if (firstLicense) {
      request.licenses = [firstLicense];
    } else {
      request.licenses = [MISSING_FIELD_PLACEHOLDER];
      missingFields.push('Número da Licença');
    }

    const reason = values(['motivo da troca de licenca', 'motivo da troca', 'motivo']);
    if (reason.length === 1 && reason[0]) {
      request.swapReason = reason[0];
    } else {
      request.swapReason = MISSING_FIELD_PLACEHOLDER;
      missingFields.push('Motivo da Troca');
    }
  } else {
    const licenseRaw = values([
      ...baseLicenseLabels,
      'licencas para cancelamento',
      'licencas a serem canceladas',
      'numero das licencas a serem canceladas',
      'id das licencas',
    ]);
    const extracted = [...new Set(licenseRaw.flatMap(value => value.match(/\d+/g) ?? []))];
    if (extracted.length > 0) {
      request.licenses = extracted;
    } else {
      request.licenses = [MISSING_FIELD_PLACEHOLDER];
      missingFields.push('Números das Licenças');
    }
  }

  if (missingFields.length > 0) {
    request.missingFields = missingFields;
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
    const qtyPart =
      request.quantity !== undefined
        ? `${request.quantity} ${request.quantity === 1 ? 'lic' : 'lics'}`
        : `${MISSING_FIELD_PLACEHOLDER} lics`;
    const exemptPart =
      request.firstLicenseExempt !== undefined
        ? request.firstLicenseExempt
          ? 'com isenção da primeira licença'
          : 'sem isenção'
        : MISSING_FIELD_PLACEHOLDER;
    description = `Contratação ${qtyPart} (${exemptPart})`;
  } else if (request.operation === 'Troca') {
    description = `Troca lic ${request.licenses[0] || MISSING_FIELD_PLACEHOLDER}\nMotivo: ${request.swapReason || MISSING_FIELD_PLACEHOLDER}`;
  } else {
    const list = request.licenses.length ? request.licenses.join(', ') : MISSING_FIELD_PLACEHOLDER;
    description = `Cancelamento lics: ${list}`;
  }
  return `${description}\nBanco: ${request.database || MISSING_FIELD_PLACEHOLDER}`;
}
