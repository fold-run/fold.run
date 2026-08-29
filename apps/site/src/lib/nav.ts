// Single source of truth for cross-surface links and the header's navigation
// tree. The header, the mega-menu panels and the mobile sheet all render from
// the data below, so a moved surface is one edit rather than three.
//
// Voice rules from DESIGN.json apply to every description here: no marketing
// adjectives, periods and colons over em-dashes, and every claim is something
// the linked page actually shows.

export const LINKS = {
  site: 'https://fold.run',
  docs: 'https://docs.fold.run',
  demo: 'https://demo.fold.run',
  enterprise: 'https://enterprise.fold.run',
  github: 'https://github.com/fold-run/fold',
  license: 'https://github.com/fold-run/fold/blob/main/LICENSE',
} as const;

export type NavLink = { label: string; href: string; description: string };
export type NavSection = { title: string; items: NavLink[] };
/** A nav entry is either a plain link (href) or a mega-menu (sections). */
export type NavItem = { label: string; href?: string; sections?: NavSection[] };

// Two disclosures, two direct links. Three mega-menus and no direct link is
// the generic-SaaS header PRODUCT.md names as an anti-reference, and it put
// this audience's two highest-intent destinations — the docs and the repo —
// two interactions deep. Product and Docs earn a panel because each fans out
// to six or more surfaces; Blog and GitHub are single destinations and stay
// one click. Changelog lives in the footer, where a changelog belongs.
export const headerNav: NavItem[] = [
  {
    label: 'Product',
    sections: [
      {
        title: 'See it running',
        items: [
          {
            label: 'Live demo',
            href: '/#demo',
            description: 'Three upstreams federated behind one endpoint.',
          },
          {
            label: 'Live console',
            href: `${LINKS.demo}/console/`,
            description: 'Watch calls resolve through the gateway in real time.',
          },
          {
            label: 'Governed gateway',
            href: `${LINKS.enterprise}/console/`,
            description: 'The same demo with auth, policy and audit switched on.',
          },
        ],
      },
      {
        title: 'What it does',
        items: [
          {
            label: 'Use cases',
            href: `${LINKS.docs}/use-cases/`,
            description: 'Federation, governance, tasks, discovery.',
          },
          {
            label: 'Benchmarks',
            href: `${LINKS.docs}/benchmarks/`,
            description: 'Honest numbers, caveats attached.',
          },
          {
            label: 'Conformance',
            href: `${LINKS.docs}/conformance/`,
            description: 'The MCP conformance suite, run in the open.',
          },
        ],
      },
    ],
  },
  {
    label: 'Docs',
    sections: [
      {
        title: 'Start',
        items: [
          {
            label: 'Getting started',
            href: `${LINKS.docs}/getting-started/`,
            description: 'Run a governed endpoint in 60 seconds.',
          },
          {
            label: 'Run it locally',
            href: `${LINKS.docs}/run-it-locally/`,
            description: 'One binary, one config file.',
          },
          {
            label: 'Configuration',
            href: `${LINKS.docs}/configuration/`,
            description: 'Every field, validated at load.',
          },
        ],
      },
      {
        title: 'Operate',
        items: [
          {
            label: 'Architecture',
            href: `${LINKS.docs}/architecture/`,
            description: 'The request pipeline, end to end.',
          },
          {
            label: 'Security model',
            href: `${LINKS.docs}/security/`,
            description: 'AuthN, policy, audit, credential brokering.',
          },
          {
            label: 'Deployment',
            href: `${LINKS.docs}/deployment/`,
            description: 'Binary, container, Kubernetes.',
          },
          {
            label: 'Operations',
            href: `${LINKS.docs}/operations/`,
            description: 'Health, metrics, budgets, tenancy.',
          },
        ],
      },
    ],
  },
  { label: 'Blog', href: '/blog/' },
  { label: 'GitHub', href: LINKS.github },
];
