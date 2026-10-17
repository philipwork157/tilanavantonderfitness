import { readingTimeLabel } from '@tilana/content';
import type { PublicBlogPost } from '@tilana/contracts/blog';
import { getPublishedPosts } from '@web/utils/blog-posts';
import { href } from './config';
import type { PostCard } from './components/BlogExplorer';
import type { Tone } from './data';

export type Post = PublicBlogPost;

/** Published posts from the admin, newest first (read live, cached on Cloudflare). */
export async function getPosts(): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return [...posts].sort((a, b) => b.publishedAt.valueOf() - a.publishedAt.valueOf());
}

export const formatDate = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });

/** Colour of the typographic cover used when a post has no photo. */
const categoryTone: Record<string, Tone> = {
  Nourishment: 'terracotta',
  Movement: 'sage',
  Strength: 'caramel',
  Nurturance: 'sand',
  Motherhood: 'white',
};

const fitsCover = (word: string) => /^[A-Za-z’']{4,9}$/.test(word);

/**
 * One short word for the typographic cover shown when a post has no photo:
 * the first word of the title, else the last ("…Eat Carbs?" → "Carbs"),
 * else the category when it is short enough, else "Notes".
 */
export function coverWord(post: Pick<Post, 'title' | 'category'>): string {
  const words = post.title.split(/[\s:,.!?–-]+/).filter(Boolean);
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  if (fitsCover(first)) return first;
  if (fitsCover(last)) return last;
  return fitsCover(post.category) ? post.category : 'Notes';
}

export function coverTone(post: Pick<Post, 'category'>): Tone {
  return categoryTone[post.category] ?? 'sand';
}

export function toCard(post: Post): PostCard {
  return {
    slug: post.slug,
    href: href(`/blog/${post.slug}`),
    title: post.title,
    description: post.excerpt,
    category: post.category,
    readingTime: readingTimeLabel(post.bodyMarkdown),
    date: formatDate(post.publishedAt),
    cover: post.coverImageUrl
      ? {
          kind: 'image',
          src: post.coverImageUrl,
          srcSet: '',
          width: post.coverImageWidth ?? 944,
          height: post.coverImageHeight ?? 1104,
          alt: post.coverImageAlt ?? '',
        }
      : { kind: 'type', word: coverWord(post), tone: coverTone(post) },
  };
}
