import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { detectLicenseTicket, getScopedTicketContainer, isTicketElementVisible } from '../utils/licenseDetector.ts';

test('license detection stays within the requested ticket and ignores the document title', () => {
  const dom = installDom(`<title>Contratação de licença facial</title>
    <section ticket-id="A">Falha ao abrir relatório<textarea id="a"></textarea></section>
    <section ticket-id="B">Renovação de licença facial\nBanco de dados: 169614<textarea id="b"></textarea></section>`);
  try {
    assert.equal(detectLicenseTicket(dom.document.querySelector('#a')), null);
    const info = detectLicenseTicket(dom.document.querySelector('#b'));
    assert.equal(info.type, 'Renovação');
    assert.equal(info.databaseNumber, '169614');
    assert.equal(detectLicenseTicket(dom.document), null);
  } finally { dom.restore(); }
});

test('an editor without a recognized ticket container cannot inherit body text', () => {
  const dom = installDom('<h1>Cancelamento de licença</h1><textarea></textarea>');
  try {
    const editor = dom.document.querySelector('textarea');
    assert.equal(getScopedTicketContainer(editor), null);
    assert.equal(detectLicenseTicket(editor), null);
  } finally { dom.restore(); }
});

test('widget labels do not cause a ticket to be classified as a license request', () => {
  const dom = installDom(`<section ticket-id="A">Problema de impressão
    <div class="octablaster-floating-widget">Contratação de licença</div><textarea></textarea></section>`);
  try {
    assert.equal(detectLicenseTicket(dom.document.querySelector('textarea')), null);
  } finally { dom.restore(); }
});

test('an iframe editor inherits only its embedding ticket container', () => {
  const dom = installDom(`<section ticket-id="A">Falha de impressão<iframe></iframe></section>
    <section ticket-id="B">Contratação de licença</section>`);
  try {
    const frame = dom.document.querySelector('iframe');
    frame.contentDocument.body.innerHTML = '<div contenteditable="true">Rascunho</div>';
    const editor = frame.contentDocument.querySelector('[contenteditable]');
    assert.equal(getScopedTicketContainer(editor), frame.closest('section'));
    assert.equal(detectLicenseTicket(editor), null);
  } finally { dom.restore(); }
});

test('iframe child visibility follows the iframe and its parent ticket', () => {
  const dom = installDom('<section ticket-id="A"><iframe></iframe></section>');
  try {
    const frame = dom.document.querySelector('iframe');
    frame.contentDocument.body.innerHTML = '<textarea></textarea>';
    const editor = frame.contentDocument.querySelector('textarea');
    frame.getBoundingClientRect = editor.getBoundingClientRect = () => ({ width: 300, height: 100 });
    assert.equal(isTicketElementVisible(editor), true);
    frame.hidden = true;
    assert.equal(isTicketElementVisible(editor), false);
    frame.hidden = false;
    frame.parentElement.style.display = 'none';
    assert.equal(isTicketElementVisible(editor), false);
  } finally { dom.restore(); }
});

for (const innerBoundary of ['class="space-x-md" ticket="vm.ticket"', 'class="tab-pane"']) {
  test(`license classification includes the current ticket header outside a nested ${innerBoundary}`, () => {
    const dom = installDom(`<title>Outro chamado sem relação</title>
      <section class="ticket-view" id="current-ticket">
        <header><h1>Contratação LICENÇA FACIAL (135744)</h1></header>
        <div ${innerBoundary}><div class="space-x-md" id="toolbar"></div><textarea id="editor"></textarea></div>
      </section>
      <section class="ticket-view" id="other-ticket"><h1>Cancelamento Licença Secullum (999999)</h1></section>`);
    try {
      const ticket = dom.document.querySelector('#current-ticket');
      for (const element of [dom.document.querySelector('#toolbar'), dom.document.querySelector('#editor')]) {
        assert.equal(getScopedTicketContainer(element), ticket);
        const detected = detectLicenseTicket(element);
        assert.equal(detected?.type, 'Contratação');
        assert.equal(detected?.licenseType, 'Licença Facial');
        assert.equal(detected?.databaseNumber, '135744');
      }
    } finally { dom.restore(); }
  });
}

test('a subject input value inside a data-ticket-id boundary classifies its own license ticket', () => {
  const dom = installDom(`<title>Cancelamento de licença (999999)</title>
    <section data-ticket-id="135744"><input name="subject" id="subject"><div class="tab-pane"><textarea id="editor"></textarea></div></section>
    <section data-ticket-id="other">Falha de impressão<textarea id="other-editor"></textarea></section>`);
  try {
    dom.document.querySelector('#subject').value = 'Contratação LICENÇA FACIAL (135744)';
    const editor = dom.document.querySelector('#editor');
    assert.equal(getScopedTicketContainer(editor), dom.document.querySelector('[data-ticket-id="135744"]'));
    const detected = detectLicenseTicket(editor);
    assert.equal(detected?.type, 'Contratação');
    assert.equal(detected?.databaseNumber, '135744');
    assert.equal(detectLicenseTicket(dom.document.querySelector('#other-editor')), null);
  } finally { dom.restore(); }
});

test('structural ticket attributes remain separate inside a shared ticket-page wrapper', () => {
  const dom = installDom(`<main class="ticket-page">
    <section ticket="A"><h1>Contratação LICENÇA FACIAL (135744)</h1><textarea id="a"></textarea></section>
    <section ticket="B"><h1>Falha de impressão</h1><div class="space-x-md" ticket="vm.ticket"><textarea id="b"></textarea></div></section>
  </main>`);
  try {
    const editorA = dom.document.querySelector('#a');
    const editorB = dom.document.querySelector('#b');
    assert.equal(getScopedTicketContainer(editorA), dom.document.querySelector('[ticket="A"]'));
    assert.equal(getScopedTicketContainer(editorB), dom.document.querySelector('[ticket="B"]'));
    assert.equal(detectLicenseTicket(editorA)?.databaseNumber, '135744');
    assert.equal(detectLicenseTicket(editorB), null);
  } finally { dom.restore(); }
});
