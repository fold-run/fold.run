import { getCollection } from 'astro:content';
import { LINKS } from '../lib/nav';
import { SITE } from '../lib/seo';

/**
 * llms.txt (llmstxt.org): the entry point an agent reads to find what fold is
 * and where the machine-readable surfaces are, without crawling the site.
 *
 * Generated rather than static, and from the same collections the pages render
 * from, so the post list and the release list cannot fall behind the pages
 * they describe. docs.fold.run publishes its own llms.txt and llms-full.txt
 * through starlight-llms-txt; this one covers the marketing surface and points
 * at that.
 */
export async function GET() {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
  const releases = (await getCollection('changelog')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const out: string[] = [];
  out.push('# fold');
  out.push('');
  out.push(
    '> The enterprise MCP gateway. One governed endpoint between every MCP (Model Context Protocol) client and every MCP server: federation, auth, policy, tenancy, budgets, and audit, built on the official MCP Go SDK on both sides of the proxy.',
  );
  out.push('');
  out.push(
    'fold presents any number of upstream MCP servers as one virtual server. It is a single static Go binary, Apache-2.0, and passes 40/40 of the official MCP conformance checks on every merge. Deploy it as a binary, a container, or a Helm chart.',
  );
  out.push('');

  out.push('## Documentation');
  out.push('');
  out.push(
    `- [Getting started](${LINKS.docs}/getting-started/): run a governed endpoint in 60 seconds.`,
  );
  out.push(`- [Configuration](${LINKS.docs}/configuration/): every field, validated at load.`);
  out.push(`- [Architecture](${LINKS.docs}/architecture/): the request pipeline, end to end.`);
  out.push(
    `- [Security model](${LINKS.docs}/security/): auth, policy, audit, and credential brokering.`,
  );
  out.push(
    `- [llms.txt for the docs](${LINKS.docs}/llms.txt): the full documentation index, and [llms-full.txt](${LINKS.docs}/llms-full.txt) for the whole corpus as one file.`,
  );
  out.push('');

  out.push('## Try it');
  out.push('');
  out.push(`- [Live demo](${SITE}/#demo): three public MCP servers federated behind one endpoint.`);
  out.push(`- [Live console](${LINKS.demo}/console/): watch calls resolve through the gateway.`);
  out.push(
    `- [Governed gateway](${LINKS.enterprise}/console/): the same demo with auth, policy and audit switched on.`,
  );
  out.push('');

  out.push('## Writing');
  out.push('');
  for (const post of posts) {
    out.push(`- [${post.data.title}](${SITE}/blog/${post.id}/): ${post.data.description}`);
  }
  out.push(
    `- [Changelog](${SITE}/changelog/): what shipped, newest first${
      releases[0]?.data.version ? `; latest is ${releases[0].data.version}` : ''
    }.`,
  );
  out.push('');

  out.push('## Optional');
  out.push('');
  out.push(`- [Source](${LINKS.github}): the gateway, Apache-2.0.`);
  out.push(`- [Feed](${SITE}/rss.xml)`);
  out.push('');

  return new Response(out.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
