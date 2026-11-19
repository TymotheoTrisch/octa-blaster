import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { parseLicenseRequestText, readTicketLicenseRequest, formatLicenseRequest } from '../services/octadesk/licenseRequest.ts';
import { automateLicenseMentions } from '../services/octadesk/mentionHelper.ts';

const contract = `Olá Suporte, quero solicitar a CONTRATAÇÃO da LICENÇA FACIAL.
Nome da Revenda: Revenda Teste
CNPJ da Revenda: 12345678000199
Técnico: Técnico da Revenda
Razão Social do Cliente: Cliente Teste
CPF/CNPJ do Cliente: 98.765.432/0001-99
Plano/Sistema do Cliente: Ponto Web Ultimate
Número de Licenças: 2
Número do Banco de Dados: 135558
Isenção da Primeira Licença: Sim
Observações: Nenhuma`;
const swap = `Olá Suporte, quero solicitar a TROCA da LICENÇA FACIAL.
Nome da Revenda: Revenda Teste
CNPJ da Revenda: 12345678000199
Número da licença: Lic_11822
Motivo da troca de licença: Licença corrompida.
Procedimentos realizados: Sim
Número do Banco de Dados: 158750`;
const cancel = `Olá Suporte, quero solicitar o CANCELAMENTO da LICENÇA FACIAL.
Nome da Revenda: Revenda Teste
CNPJ da Revenda: 12345678000199
Modo de cancelamento: Especificar licenças
Números das licenças: Lic_13039, Lic_13041, Lic_13042
Número do Banco de Dados: 151303`;
const email = text => `<div class="comment"><div class="text"><interaction-comment-text><interaction-comment-text-common><div class="content-comment-interaction"><div ng-bind-html="::(comment.contentHtml || comment.content) | html" class="ng-binding">${text.split('\n').map(line => line.includes(':') ? line.replace(/^([^:]+:)/, '<strong>$1</strong>') : `<strong>${line}</strong>`).join('<br><br>')}</div></div></interaction-comment-text-common></interaction-comment-text></div></div>`;
const targets = [
  { id: 'jorge', name: 'Jorge Tigre', query: '@jorge', pattern: 'Jorge\\s+Tigre', enabled: true },
  { id: 'roberto', name: 'Roberto Renck', query: '@roberto', pattern: '^Roberto\\s+Renck$', enabled: true },
];

for (const [text, expected] of [
  [contract, 'Contratação 2 lics (com isenção da primeira licença)\nBanco: 135558'],
  [contract.replace('Licenças: 2', 'Licenças: 1').replace('Licença: Sim', 'Licença: Não'), 'Contratação 1 lic (sem isenção)\nBanco: 135558'],
  [swap, 'Troca lic 11822\nMotivo: Licença corrompida.\nBanco: 158750'],
  [cancel, 'Cancelamento lics: 13039, 13041, 13042\nBanco: 151303'],
]) {
  test(`email fields format ${expected.split('\n')[0]}`, () => {
    const result = parseLicenseRequestText(text);
    assert.equal(result.status, 'ready');
    assert.equal(formatLicenseRequest(result.request), expected);
  });
}

test('an incomplete or ambiguous request never guesses fields from other numbers', () => {
  for (const text of [
    contract.replace('Número do Banco de Dados: 135558', ''),
    contract.replace('Isenção da Primeira Licença: Sim', ''),
    contract.replace('Número de Licenças: 2', 'Número de Licenças: 0'),
    contract.replace('Isenção da Primeira Licença: Sim', 'Isenção da Primeira Licença: Talvez'),
    `${contract}\nNúmero do Banco de Dados: 999999`,
    contract.replace('CONTRATAÇÃO', 'CONTRATAÇÃO ou TROCA'),
    swap.replace('Lic_11822', 'Lic_11822, Lic_999'),
    swap.replace('Motivo da troca de licença: Licença corrompida.', ''),
    `${swap}\nMotivo da troca de licença: Outro motivo`,
    cancel.replace('Lic_13039, Lic_13041, Lic_13042', 'a confirmar'),
    cancel.replace('Números das licenças: Lic_13039, Lic_13041, Lic_13042', ''),
  ]) assert.equal(parseLicenseRequestText(text).status, 'invalid', text);
});

test('license identifiers accept numeric codes and deduplicate without including other fields', () => {
  const result = parseLicenseRequestText(cancel.replace('Lic_13039, Lic_13041, Lic_13042', '1345; 3412; Lic_1345; 6781'));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.request.licenses, ['1345', '3412', '6781']);
});

test('the actual email DOM overrides a different ticket title and ignores quoted requests', () => {
  const dom = installDom(`<section ticket-id="A"><h1>Cancelamento LICENÇA FACIAL (135744)</h1>${email(contract)}${email('Recebido.')}<div class="content-comment-interaction"><blockquote>${email(swap)}</blockquote></div><div contenteditable="true">${email(cancel)}</div></section><section ticket-id="B">${email(swap)}</section>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  try {
    const result = readTicketLicenseRequest(dom.document.querySelector('[ticket-id="A"]'));
    assert.equal(result.status, 'ready');
    assert.equal(result.request.operation, 'Contratação');
    assert.equal(result.request.database, '135558');
    assert.equal(readTicketLicenseRequest(dom.document.querySelector('[ticket-id="B"]')).request.database, '158750');
  } finally { dom.restore(); }
});

test('fields from older emails are never used to complete the newest incomplete request', () => {
  const dom = installDom(`<section ticket-id="A">${email(contract)}${email(swap.replace('Número do Banco de Dados: 158750', ''))}</section>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  try { assert.equal(readTicketLicenseRequest(dom.document.querySelector('section')).status, 'invalid'); }
  finally { dom.restore(); }
});

for (const text of [contract, swap, cancel]) {
  test(`automation keeps native mentions inline and appends the ${parseLicenseRequestText(text).request.operation} summary once`, async () => {
    const dom = installDom(`<section ticket-id="A"><h1>Contratação LICENÇA FACIAL (135744)</h1>${email(text)}<button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><div class="note-editable" contenteditable="true" tabindex="0"></div><div class="note-children-container"></div></div></section>`);
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
    dom.document.execCommand = () => false;
    const editor = dom.document.querySelector('.note-editable');
    const menu = dom.document.querySelector('.note-children-container');
    let selections = 0;
    const inline = [];
    editor.addEventListener('input', () => {
      const target = targets.find(item => editor.textContent.includes(item.query) && !editor.querySelector(`person[personid="${item.id}"]`));
      if (!target || menu.childElementCount) return;
      const option = dom.document.createElement('button');
      option.className = 'person-item';option.textContent = target.name;
      option.onclick = () => {
        selections++;
        const paragraph = editor.querySelector('p') || dom.document.createElement('p');
        if (target.id === 'roberto') inline.push(paragraph.textContent.includes('@roberto'));
        const marker = dom.document.createElement('person');
        marker.className = 'mentioned';marker.setAttribute('personid', target.id);marker.textContent = `@${target.name}`;
        paragraph.replaceChildren(...paragraph.querySelectorAll('person'), dom.document.createTextNode(' '), marker);
        editor.replaceChildren(paragraph);
        menu.replaceChildren();
      };
      menu.append(option);
    });
    try {
      const scope = editor.closest('section');
      const result = await automateLicenseMentions(editor, dom.document, scope, targets);
      assert.equal(result.success, true, result.message);
      assert.deepEqual(inline, [true]);
      assert.equal(editor.querySelectorAll('person[personid]').length, 2);
      const expected = formatLicenseRequest(parseLicenseRequestText(text).request);
      const clone = editor.cloneNode(true);
      clone.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
      clone.querySelectorAll('p, div').forEach(element => element.append('\n'));
      assert.ok(clone.textContent.includes(expected), clone.textContent);
      const before = editor.innerHTML;
      assert.equal((await automateLicenseMentions(editor, dom.document, scope, targets)).success, true);
      assert.equal(editor.innerHTML, before);
      assert.equal(selections, 2);
    } finally { dom.restore(); }
  });
}

test('missing required email fields abort before touching the existing annotation', async () => {
  const dom = installDom(`<section ticket-id="A">${email(contract.replace('Número do Banco de Dados: 135558', ''))}<button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><textarea class="note-editable">Meu rascunho</textarea></div></section>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  try {
    const editor = dom.document.querySelector('textarea');
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'), targets);
    assert.equal(result.success, false);
    assert.match(result.message, /banco/);
    assert.equal(editor.value, 'Meu rascunho');
  } finally { dom.restore(); }
});
