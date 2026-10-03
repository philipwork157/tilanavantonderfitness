import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { getPublicProgramsUrl } from '@app/utils/public-site';

describe('public programs navigation', () => {
  it('keeps local customer navigation on the public localhost server', () => {
    assert.equal(getPublicProgramsUrl('http://localhost:4321'), 'http://localhost:4321/program');
  });

  it('uses the configured deployed environment rather than hardcoding production', () => {
    assert.equal(getPublicProgramsUrl('https://website-dev.tilanavantonder.co.za'), 'https://website-dev.tilanavantonder.co.za/program');
    assert.equal(getPublicProgramsUrl('https://tilanavantonder.co.za'), 'https://tilanavantonder.co.za/program');
  });

  it('handles trailing slashes and resolves the catalogue from the site root', () => {
    assert.equal(getPublicProgramsUrl('http://localhost:4321/'), 'http://localhost:4321/program');
    assert.equal(getPublicProgramsUrl('http://localhost:4321///'), 'http://localhost:4321/program');
    assert.equal(getPublicProgramsUrl('http://localhost:4321/account/sign-in'), 'http://localhost:4321/program');
  });

  it('rejects missing or invalid configuration instead of silently linking to production', () => {
    assert.throws(() => getPublicProgramsUrl(''), TypeError);
    assert.throws(() => getPublicProgramsUrl('not-a-url'), TypeError);
  });

  it('wires the sign-in page back link to the configured public URL', () => {
    const page = readFileSync(new URL('../app/pages/account/sign-in.vue', import.meta.url), 'utf8');
    assert.match(page, /getPublicProgramsUrl\(runtimeConfig\.public\.siteUrl\)/);
    assert.match(page, /<a :href="programsUrl">← Back to programs<\/a>/);
    assert.doesNotMatch(page, /href="https:\/\/tilanavantonder\.co\.za\/program"/);
  });
});
