import { productName, type Program } from './programs';

/*
 * schema.org data for search engines and AI answer engines: what each program
 * is and costs, and the buying questions and answers. Pages pass it to
 * SiteLayout, which adds the website and Tilana herself.
 */

type Faq = { q: string; a: string };

/** Programs as products with a once-off price in rand. */
export function programsStructuredData(programs: Program[], pageUrl: string, personId: string, fallbackImage: string) {
  return {
    '@type': 'ItemList',
    '@id': `${pageUrl}#programs`,
    name: 'Programs by Tilana van Tonder',
    numberOfItems: programs.length,
    itemListElement: programs.map((program, index) => {
      const url = `${pageUrl}#${program.key}`;
      const cover = program.preview?.pages.find((page) => !page.blurred)?.url;
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Product',
          '@id': `${url}-product`,
          name: productName(program),
          description: program.description || program.short,
          url,
          image: cover ?? fallbackImage,
          category: 'Digital training program (PDF)',
          brand: { '@type': 'Brand', name: 'Tilana van Tonder' },
          ...(program.tags.length ? { keywords: program.tags.join(', ') } : {}),
          offers: {
            '@type': 'Offer',
            url,
            price: (program.priceCents / 100).toFixed(2),
            priceCurrency: 'ZAR',
            availability: 'https://schema.org/InStock',
            seller: { '@id': personId },
          },
        },
      };
    }),
  };
}

/** Questions and answers shown on the page. */
export function faqStructuredData(items: readonly Faq[], pageUrl: string) {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
