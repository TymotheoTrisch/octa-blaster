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

test('incomplete or invalid fields use [Falta Informar] and never guess from other numbers while ambiguous operations abort', () => {
  assert.equal(parseLicenseRequestText(contract.replace('CONTRATAÇÃO', 'CONTRATAÇÃO ou TROCA')).status, 'invalid');

  const cases = [
    [contract.replace('Número do Banco de Dados: 135558', ''), ['Número do Banco de Dados'], 'Banco: [Falta Informar]'],
    [contract.replace('Isenção da Primeira Licença: Sim', ''), ['Isenção da Primeira Licença'], '([Falta Informar])'],
    [contract.replace('Número de Licenças: 2', 'Número de Licenças: 0'), ['Quantidade de Licenças'], '[Falta Informar] lics'],
    [contract.replace('Isenção da Primeira Licença: Sim', 'Isenção da Primeira Licença: Talvez'), ['Isenção da Primeira Licença'], '([Falta Informar])'],
    [`${contract}\nNúmero do Banco de Dados: 999999`, ['Número do Banco de Dados'], 'Banco: [Falta Informar]'],
    [swap.replace('Motivo da troca de licença: Licença corrompida.', ''), ['Motivo da Troca'], 'Motivo: [Falta Informar]'],
    [`${swap}\nMotivo da troca de licença: Outro motivo`, ['Motivo da Troca'], 'Motivo: [Falta Informar]'],
    [cancel.replace('Lic_13039, Lic_13041, Lic_13042', 'a confirmar'), ['Números das Licenças'], 'Cancelamento lics: [Falta Informar]'],
    [cancel.replace('Números das licenças: Lic_13039, Lic_13041, Lic_13042', ''), ['Números das Licenças'], 'Cancelamento lics: [Falta Informar]'],
  ];

  for (const [text, expectedMissing, expectedSnippet] of cases) {
    const result = parseLicenseRequestText(text);
    assert.equal(result.status, 'ready', text);
    assert.deepEqual(result.request.missingFields, expectedMissing, text);
    assert.ok(formatLicenseRequest(result.request).includes(expectedSnippet), text);
  }
});

test('license identifiers and numeric fields accept prefixes like lic_89898 and take the first number on the line', () => {
  const swapWithLowerPrefix = parseLicenseRequestText(
    swap.replace('Número da licença: Lic_11822', 'Número de licença: lic_89898 (facial)'),
  );
  assert.equal(swapWithLowerPrefix.status, 'ready');
  assert.deepEqual(swapWithLowerPrefix.request.licenses, ['89898']);
  assert.equal(swapWithLowerPrefix.request.missingFields, undefined);

  const swapWithMultipleInLine = parseLicenseRequestText(
    swap.replace('Lic_11822', 'Lic_11822, Lic_999'),
  );
  assert.equal(swapWithMultipleInLine.status, 'ready');
  assert.deepEqual(swapWithMultipleInLine.request.licenses, ['11822']);

  const contractWithPrefixes = parseLicenseRequestText(
    contract
      .replace('Número de Licenças: 2', 'Número de Licenças: 2 licenças')
      .replace('Número do Banco de Dados: 135558', 'Número do Banco de Dados: bd_135558 - matriz'),
  );
  assert.equal(contractWithPrefixes.status, 'ready');
  assert.equal(contractWithPrefixes.request.quantity, 2);
  assert.equal(contractWithPrefixes.request.database, '135558');

  const cancelResult = parseLicenseRequestText(
    cancel.replace('Lic_13039, Lic_13041, Lic_13042', 'lic_89898; 3412; Lic_89898; 6781'),
  );
  assert.equal(cancelResult.status, 'ready');
  assert.deepEqual(cancelResult.request.licenses, ['89898', '3412', '6781']);
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
  try {
    const result = readTicketLicenseRequest(dom.document.querySelector('section'));
    assert.equal(result.status, 'ready');
    assert.equal(result.request.operation, 'Troca');
    assert.equal(result.request.database, '[Falta Informar]');
    assert.deepEqual(result.request.missingFields, ['Número do Banco de Dados']);
  } finally {
    dom.restore();
  }
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

test('ambiguous operation aborts before touching draft while missing fields fill [Falta Informar] and open alert modal', async () => {
  const domAmbiguous = installDom(`<section ticket-id="A">${email(contract.replace('CONTRATAÇÃO', 'CONTRATAÇÃO ou TROCA'))}<button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><textarea class="note-editable">Meu rascunho</textarea></div></section>`);
  domAmbiguous.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  try {
    const editor = domAmbiguous.document.querySelector('textarea');
    const result = await automateLicenseMentions(editor, domAmbiguous.document, editor.closest('section'), targets);
    assert.equal(result.success, false);
    assert.match(result.message, /ambígua/);
    assert.equal(editor.value, 'Meu rascunho');
  } finally {
    domAmbiguous.restore();
  }

  const domMissing = installDom(`<section ticket-id="B">${email(swap.replace('Número do Banco de Dados: 158750', '').replace('Lic_11822', 'lic_89898'))}<button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><div class="note-editable" contenteditable="true" tabindex="0"></div><div class="note-children-container"></div></div></section>`);
  domMissing.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  domMissing.document.execCommand = () => false;
  const editor = domMissing.document.querySelector('.note-editable');
  const menu = domMissing.document.querySelector('.note-children-container');
  editor.addEventListener('input', () => {
    const target = targets.find(item => editor.textContent.includes(item.query) && !editor.querySelector(`person[personid="${item.id}"]`));
    if (!target || menu.childElementCount) return;
    const option = domMissing.document.createElement('button');
    option.className = 'person-item';
    option.textContent = target.name;
    option.onclick = () => {
      const paragraph = editor.querySelector('p') || domMissing.document.createElement('p');
      const marker = domMissing.document.createElement('person');
      marker.className = 'mentioned';
      marker.setAttribute('personid', target.id);
      marker.textContent = `@${target.name}`;
      paragraph.replaceChildren(...paragraph.querySelectorAll('person'), domMissing.document.createTextNode(' '), marker);
      editor.replaceChildren(paragraph);
      menu.replaceChildren();
    };
    menu.append(option);
  });
  try {
    const result = await automateLicenseMentions(editor, domMissing.document, editor.closest('section'), targets);
    assert.equal(result.success, true, result.message);
    assert.match(result.message, /Número do Banco de Dados/);
    assert.ok(editor.textContent.includes('Troca lic 89898'), editor.textContent);
    assert.ok(editor.textContent.includes('Banco: [Falta Informar]'), editor.textContent);

    const dialog = domMissing.document.querySelector('dialog.octablaster-license-alert-dialog');
    assert.ok(dialog, 'alert dialog must be opened for missing fields');
    assert.match(dialog.textContent, /Número do Banco de Dados/);
    dialog.querySelector('.octa-alert-btn-primary').click();
    assert.equal(domMissing.document.querySelector('dialog.octablaster-license-alert-dialog'), null);
  } finally {
    domMissing.restore();
  }
});
