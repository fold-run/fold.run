// One home for the site's canonical origin and its page metadata, so a title
// or description is written once rather than restated in every page's
// frontmatter and again in its JSON-LD.
export const SITE = 'https://fold.run';

export interface Meta {
  title: string;
  description: string;
  /** Absolute-from-root path, with a trailing slash. */
  pathname: string;
}

/** Builds the props Base.astro expects, so canonical can never drift. */
export function meta({ title, description, pathname }: Meta) {
  return { title, description, canonical: `${SITE}${pathname}` };
}

export const SEO = {
  blog: {
    title: 'Blog · fold',
    description:
      'Engineering notes from the team building fold: federation, governance, and what it takes to put one governed endpoint in front of many MCP servers.',
    pathname: '/blog/',
  },
  changelog: {
    title: 'Changelog · fold',
    description: 'What shipped in fold, newest first.',
    pathname: '/changelog/',
  },
} as const satisfies Record<string, Meta>;
