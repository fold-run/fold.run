/**
 * The wordmark, as data.
 *
 * Outlined glyph paths derived from Black Ops One (SIL OFL 1.1) with our own
 * spacing — see Wordmark.astro for the full note and licenses/ for provenance.
 *
 * It lives here rather than inside the component because the authored topology
 * diagrams need the same paths inline: the gateway node in a drawing IS the
 * product, so it carries the mark rather than a mono label like the generic
 * `client` nodes around it. Two copies of a 340-character path would drift.
 */
export const WORDMARK_PATH =
  'M105 1467V670H0V405H105V248L372 0H868V265H548V1467ZM615 670 618 405H868V670ZM1104 1467 839 1202V670L1104 405H1401V670H1286V1219H1401V1467ZM1471 1467V1219H1581V670H1471V405H1767L2032 670V1202L1767 1467ZM2419 1467 2171 1219V0H2613V1202H2811V1467ZM3555 1467V0H3997V1467ZM3069 1467 2830 1228V644L3069 405H3485V670H3272V1219H3485V1362L3380 1467Z';

/** Ink bounds of the composed word: ascender to baseline, f crossbar to d stem. */
export const WORDMARK_BOX = { x: 0, y: 0, width: 3997, height: 1467 } as const;

/**
 * Places the wordmark centred on (cx, cy) at a given width, in whatever user
 * units the surrounding drawing uses.
 */
export function wordmarkTransform(cx: number, cy: number, width: number): string {
  const scale = width / WORDMARK_BOX.width;
  const x = cx - width / 2 - WORDMARK_BOX.x * scale;
  const y = cy - (WORDMARK_BOX.height * scale) / 2;
  return `translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(5)})`;
}
