import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SEO, SITE } from '../lib/seo';

// The feed renders from the same collection the index does, so a post cannot
// exist on one and not the other.
export async function GET() {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: 'fold',
    description: SEO.blog.description,
    site: SITE,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.teaser ?? post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
      categories: [post.data.category],
    })),
    customData: '<language>en</language>',
  });
}
