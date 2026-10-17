import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from './Icon';

export type PostCard = {
  slug: string;
  href: string;
  title: string;
  description: string;
  category: string;
  readingTime: string;
  date: string;
  cover: { kind: 'image'; src: string; srcSet: string; width: number; height: number; alt: string } | { kind: 'type'; word: string; tone: string };
};

function Cover({ post, sizes }: { post: PostCard; sizes: string }) {
  if (post.cover.kind === 'image') {
    const c = post.cover;
    return <img src={c.src} srcSet={c.srcSet || undefined} sizes={sizes} width={c.width} height={c.height} alt={c.alt} loading="lazy" decoding="async" />;
  }
  return (
    <div className={`type-cover tone-${post.cover.tone}`} aria-hidden="true">
      <span>{post.category}</span>
      <strong>{post.cover.word}</strong>
    </div>
  );
}

/** Blog list with category filters. */
export default function BlogExplorer({ posts, categories }: { posts: PostCard[]; categories: string[] }) {
  const [filter, setFilter] = useState('All');
  const counts = Object.fromEntries(categories.map((c) => [c, posts.filter((p) => p.category === c).length]));
  const shown = filter === 'All' ? posts : posts.filter((p) => p.category === filter);
  const [featured, ...rest] = shown;

  return (
    <div className="blog-explorer">
      <div className="chips" role="group" aria-label="Filter by category">
        {['All', ...categories.filter((c) => counts[c])].map((c) => (
          <button key={c} type="button" className={filter === c ? 'chip on' : 'chip'} aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {c}<small>{c === 'All' ? posts.length : counts[c]}</small>
          </button>
        ))}
      </div>

      <AnimatePresence mode="popLayout">
        {featured && (
          <motion.a layout key={`f-${featured.slug}`} href={featured.href} className="post-feature card lift" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}>
            <div className="post-cover"><Cover post={featured} sizes="(max-width: 52rem) 92vw, 34rem" /></div>
            <div className="post-body">
              <p className="eyebrow">Latest · {featured.category} · {featured.readingTime}</p>
              <h2>{featured.title}</h2>
              <p>{featured.description}</p>
              <span className="link-arrow">Read article <Icon name="arrow" /></span>
            </div>
          </motion.a>
        )}
      </AnimatePresence>

      <motion.div layout className="post-grid">
        <AnimatePresence mode="popLayout">
          {rest.map((p) => (
            <motion.a layout key={p.slug} href={p.href} className="post-card card lift" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.35 }}>
              <div className="post-cover"><Cover post={p} sizes="(max-width: 40rem) 92vw, (max-width: 64rem) 45vw, 26rem" /></div>
              <div className="post-body">
                <p className="eyebrow">{p.category} · {p.readingTime}</p>
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                <span className="link-arrow">Read article <Icon name="arrow" /></span>
              </div>
            </motion.a>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
