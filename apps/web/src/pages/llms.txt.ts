import type { APIRoute } from 'astro';
import { site } from '@web/site/config';
import { productName } from '@web/site/programs';
import { getPublishedPosts } from '@web/utils/blog-posts';
import { loadSitePrograms } from '@web/utils/programs';
import { getPublishedRecipes } from '@web/utils/recipes';

/*
 * llms.txt (https://llmstxt.org): a short plain-text guide to the website for
 * AI assistants and answer engines. Rendered on request, so the programs,
 * prices, posts and recipes are the ones published in the admin.
 */
export const prerender = false;

const rand = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export const GET: APIRoute = async ({ site: siteUrl }) => {
  const base = siteUrl ?? new URL(site.url);
  const link = (path: string) => new URL(path, base).href;
  const [{ programs }, posts, recipes] = await Promise.all([
    loadSitePrograms(),
    getPublishedPosts().catch(() => []),
    getPublishedRecipes().catch(() => []),
  ]);

  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    'Tilana van Tonder lives in Cape Town, South Africa. She sells once-off digital training programs (PDF, emailed straight after payment, no subscription), writes about strength, movement and healthy habits, shares simple recipes with their protein and calories, and offers private training. Everything she shares is general education based on personal experience, not medical, physiotherapy or dietetic care.',
    '',
    '## Main pages',
    '',
    `- [Programs and pricing](${link('/program')}): every program, what it covers and its once-off price in South African rand`,
    `- [About Tilana](${link('/about')}): her story and approach`,
    `- [Blog](${link('/blog')}): articles on strength, movement, nourishment and motherhood`,
    `- [Kitchen](${link('/kitchen')}): recipes with protein, calories and steps`,
    `- [Contact](${link('/contact')}): questions, private training and business details`,
  ];

  if (programs.length) {
    lines.push('', '## Programs', '');
    for (const program of programs) {
      lines.push(`- [${productName(program)}](${link(`/program#${program.key}`)}): ${rand(program.priceCents)} once-off. ${oneLine(program.short)}`);
    }
  }

  if (posts.length) {
    lines.push('', '## Blog posts', '');
    for (const post of posts.slice(0, 20)) {
      lines.push(`- [${oneLine(post.title)}](${link(`/blog/${post.slug}`)})${post.excerpt ? `: ${oneLine(post.excerpt)}` : ''}`);
    }
  }

  if (recipes.length) {
    lines.push('', '## Recipes', '');
    for (const recipe of recipes.slice(0, 20)) {
      lines.push(`- [${oneLine(recipe.title)}](${link(`/kitchen/${recipe.slug}`)}): ${recipe.nutrition.protein} g protein, ${recipe.nutrition.kcal} kcal per serving. ${oneLine(recipe.description)}`);
    }
  }

  lines.push(
    '',
    '## Buying and policies',
    '',
    `- [Terms of sale](${link('/terms')}): seller details, payment through Paystack, delivery by email, licence`,
    `- [Refund and cancellation policy](${link('/refund-policy')})`,
    `- [Privacy policy](${link('/privacy')})`,
    '',
    '## Contact',
    '',
    `- Email: ${site.email}`,
    `- Phone and WhatsApp: ${site.phone}`,
    `- Address: ${site.address}`,
    '',
  );

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
};
