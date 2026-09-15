export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function singleLineEmailText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function emailTextWithLineBreaks(value: string): string {
  return escapeEmailHtml(value).replace(/\r?\n/g, '<br>');
}
