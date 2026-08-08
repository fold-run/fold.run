// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import remarkGfm from 'remark-gfm';
import starlightLlmsTxt from 'starlight-llms-txt';
import { foldDark, foldLight } from './code-theme.mjs';

const SITE = process.env.FOLD_DOCS_URL ?? 'https://docs.fold.run';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  // Astro's MDX pipeline doesn't apply GFM to .mdx pages the way .md gets it —
  // without this, markdown tables in .mdx render as literal pipes.
  markdown: { remarkPlugins: [remarkGfm] },
  integrations: [
    starlight({
      title: 'fold',
      description:
        'The enterprise MCP gateway. Every team keeps building its own MCP servers — fold presents them as one governed virtual server. fold is the one; fold.run is the execution.',
      favicon: '/favicon.svg',
      logo: { src: './src/assets/logo.svg', alt: '' },
      customCss: ['./src/styles/fold.css'],
      // Code surfaces run on the brand palette, not Starlight's teal default.
      expressiveCode: { themes: [foldDark, foldLight] },
      // /llms.txt + /llms-full.txt for AI agents and answer engines.
      plugins: [starlightLlmsTxt()],
      lastUpdated: true,
      editLink: { baseUrl: 'https://github.com/fold-run/fold.run/edit/main/apps/docs/' },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/fold-run/fold' },
        { icon: 'external', label: 'fold.run', href: 'https://fold.run' },
      ],
      head: [
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'fold docs',
            url: 'https://docs.fold.run',
          }),
        },
      ],
      sidebar: [
        { label: 'Getting started', slug: 'getting-started' },
        { label: 'Run it locally', slug: 'run-it-locally' },
        { label: 'Try the live demo', slug: 'try-the-demo' },
        { label: 'Use cases', slug: 'use-cases' },
        { label: 'Configuration', slug: 'configuration' },
        {
          label: 'Guides',
          items: [
            { label: 'Deployment', slug: 'deployment' },
            { label: 'Operations', slug: 'operations' },
            { label: 'The console', slug: 'console' },
            { label: 'Discovery & Kubernetes', slug: 'discovery' },
            { label: 'Embedding in Go', slug: 'embedding' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'Architecture', slug: 'architecture' },
            { label: 'Security model', slug: 'security' },
            { label: 'Conformance', slug: 'conformance' },
            { label: 'Benchmarks', slug: 'benchmarks' },
            { label: 'Defaults', slug: 'defaults' },
          ],
        },
      ],
    }),
  ],
});
