import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Posts and changelog entries were previously hard-coded: the blog index kept
// its own list of `.post-row` items ("Add new posts as .post-row items in the
// list below"), and nothing else on the site knew a post existed. These
// collections are what let the index, the feed, the sitemap and llms.txt all
// render from one source.
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.mdx' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Publication date; also the sort key and the feed's pubDate. */
    date: z.coerce.date(),
    category: z.string().default('engineering'),
    /** The index's one-line pitch. Falls back to `description`. */
    teaser: z.string().optional(),
    /** Absolute-from-root social card. A post wants one that names the post. */
    ogImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const changelog = defineCollection({
  loader: glob({ base: './src/content/changelog', pattern: '**/*.md' }),
  schema: z.object({
    /** Release date, newest first. */
    date: z.coerce.date(),
    title: z.string(),
    /** The gateway version this entry ships, when it names one. */
    version: z.string().optional(),
  }),
});

export const collections = { blog, changelog };
