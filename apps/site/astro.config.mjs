// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import { rehypeHeadingId } from './rehype-heading-id.mjs';

export default defineConfig({
  site: 'https://fold.run',
  integrations: [mdx(), sitemap()],
  markdown: {
    // Off deliberately. The posts were authored with straight quotes, and
    // SmartyPants both changes them under us and gets them wrong: it read an
    // opening quote after an em dash as a closing one, printing ”not mine”.
    smartypants: false,
    // Posts used to carry hand-written `id`s and a literal `#` anchor on every
    // heading, which meant a renamed heading silently broke its own deep link.
    // These generate the same markup from the heading text instead.
    rehypePlugins: [
      // Before rehype-slug, which only fills in an id when one is absent.
      rehypeHeadingId,
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { class: 'h-anchor', ariaLabel: 'Link to this section' },
          content: { type: 'text', value: '#' },
        },
      ],
    ],
  },
});
