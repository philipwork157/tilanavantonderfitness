import MarkdownIt from 'markdown-it';

/**
 * Blog Markdown → HTML, shared by the website and the admin preview.
 *
 * Security: raw HTML in the Markdown is NOT rendered (it is shown as text),
 * links may only be http(s), mailto, site-relative or #anchors, and images
 * are disabled. Everything else markdown-it outputs is escaped, so editor
 * content cannot inject scripts into the website.
 */
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
markdown.disable(['image']);

const SAFE_LINK = /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i;
markdown.validateLink = (url: string) => SAFE_LINK.test(url.trim());

// The page title is the only <h1>; headings in the body start at <h2>.
markdown.core.ruler.push('demote_h1', (state) => {
  for (const token of state.tokens) {
    if ((token.type === 'heading_open' || token.type === 'heading_close') && token.tag === 'h1') {
      token.tag = 'h2';
    }
  }
});

const renderLinkOpen = markdown.renderer.rules.link_open
  ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

// External links open in a new tab without giving that page access to ours.
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]!;
  if (/^https?:\/\//i.test(String(token.attrGet('href') ?? ''))) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return renderLinkOpen(tokens, index, options, env, self);
};

export function renderMarkdown(source: string): string {
  return markdown.render(source ?? '');
}

const WORDS_PER_MINUTE = 220;

export function countWords(source: string): number {
  return (source ?? '')
    .replace(/[#>*_`~[\]()|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/** "4 min read", at least one minute. */
export function readingTimeLabel(source: string): string {
  const minutes = Math.max(1, Math.round(countWords(source) / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}
