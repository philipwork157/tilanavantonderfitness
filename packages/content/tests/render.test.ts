import { describe, expect, it } from 'vitest';
import { readingTimeLabel, renderMarkdown } from '../src/index';

describe('renderMarkdown security', () => {
  it('shows raw HTML as text instead of running it', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses dangerous link protocols', () => {
    for (const href of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.example.com']) {
      expect(renderMarkdown(`[click](${href})`)).not.toContain('<a');
    }
  });

  it('allows normal links and protects external ones', () => {
    expect(renderMarkdown('[About](/about)')).toContain('<a href="/about">About</a>');
    expect(renderMarkdown('[Mail](mailto:hi@example.com)')).toContain('href="mailto:hi@example.com"');
    const external = renderMarkdown('[Site](https://example.com)');
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noopener noreferrer"');
  });

  it('does not render images', () => {
    expect(renderMarkdown('![x](https://example.com/x.png)')).not.toContain('<img');
  });

  it('escapes quotes inside link text and attributes', () => {
    expect(renderMarkdown('[a" onmouseover="x](https://example.com/"x)')).not.toContain('onmouseover="x"');
  });
});

describe('renderMarkdown formatting', () => {
  it('renders the formatting the editor produces', () => {
    const html = renderMarkdown('# Big\n\n## Section\n\n**bold** and *soft*\n\n- one\n- two\n\n> a thought');
    expect(html).toContain('<h2>Big</h2>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>soft</em>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<blockquote>');
  });
});

describe('readingTimeLabel', () => {
  it('rounds to minutes with a minimum of one', () => {
    expect(readingTimeLabel('just a few words')).toBe('1 min read');
    expect(readingTimeLabel(Array.from({ length: 1100 }, () => 'word').join(' '))).toBe('5 min read');
  });
});
