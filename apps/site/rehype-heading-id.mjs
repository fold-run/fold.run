import { visit } from 'unist-util-visit';

/**
 * Lets a Markdown heading pin its own slug: `## Some long title {#short-id}`.
 *
 * rehype-slug derives an id from the heading text, which is right for new
 * headings and wrong for the ones migrated out of the hand-written posts —
 * those carried shorter ids than their text would generate, and a fragment is
 * the one kind of link a server cannot redirect. Pinning the legacy id keeps
 * every published deep link working.
 *
 * Runs before rehype-slug, which only assigns an id when one is absent.
 */
export function rehypeHeadingId() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const last = node.children.at(-1);
      if (last?.type !== 'text') return;
      const m = last.value.match(/^([\s\S]*?)\s*\{#([\w-]+)\}\s*$/);
      if (!m) return;
      last.value = m[1];
      node.properties = { ...node.properties, id: m[2] };
    });
  };
}
