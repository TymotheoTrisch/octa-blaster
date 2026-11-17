import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { automateLicenseMentions } from '../utils/mentionHelper.ts';

for (const navigation of ['', '<nav><a ng-click="commentTypeSelected = 3">Anotação interna</a></nav>']) {
  test(`license automation keeps the public draft intact when internal note cannot be confirmed (${navigation ? 'inactive link' : 'missing link'})`, async () => {
    const dom = installDom(`<section ticket-id="A">${navigation}<textarea>Rascunho público</textarea></section>`);
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
    try {
      const editor = dom.document.querySelector('textarea');
      editor.focus();
      const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'),
        [{ id: 'person', name: 'Pessoa', query: 'pessoa', pattern: 'pessoa', enabled: true }]);
      assert.equal(result.success, false);
      assert.equal(editor.value, 'Rascunho público');
    } finally { dom.restore(); }
  });
}
