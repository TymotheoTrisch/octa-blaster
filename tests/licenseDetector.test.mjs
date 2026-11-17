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
