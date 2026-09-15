import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  emailTextWithLineBreaks,
  escapeEmailHtml,
  singleLineEmailText,
} from '../server/email-templates/html.ts';

describe('shared email HTML helpers', () => {
  it('escapes user-controlled HTML characters', () => {
    assert.equal(
      escapeEmailHtml(`<a title="Tilana's">&</a>`),
      '&lt;a title=&quot;Tilana&#039;s&quot;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('normalizes header text and preserves safe message line breaks', () => {
    assert.equal(singleLineEmailText('  First\r\nLast  '), 'First Last');
    assert.equal(emailTextWithLineBreaks('<hello>\nworld'), '&lt;hello&gt;<br>world');
  });
});
