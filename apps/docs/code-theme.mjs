// Syntax themes for Expressive Code, built from the fold palette (DESIGN.md §2).
// Starlight ships a teal-accented default theme that introduces hues the brand
// doesn't own — "no new hues" applies to code surfaces too.
//
// These two are the neutral ramp, and only the neutral ramp. Live used to mark
// keys, keywords, and function names; on a docs site that is mostly JSON config
// that put chartreuse on every property name of every block, which is the
// single largest accent surface either origin had. Live is licensed to proof —
// a config key is not proof. Emphasis now comes from the ramp itself: keys at
// Signal, values at Static, structure and comments receding to Trace-bright.

/** Dark — Rack surface, matching --ec-codeBg in src/styles/fold.css. */
export const foldDark = {
  name: 'fold-dark',
  type: 'dark',
  colors: {
    'editor.background': '#1A1A1A',
    'editor.foreground': '#BCBCBC',
    'editorLineNumber.foreground': '#6E6E6E',
    'editor.selectionBackground': '#2B2B2B',
    'terminal.background': '#1A1A1A',
    'terminal.foreground': '#BCBCBC',
  },
  settings: [
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: '#6E6E6E' },
    },
    {
      scope: ['punctuation', 'meta.brace', 'keyword.operator', 'meta.delimiter'],
      settings: { foreground: '#8A8A8A' },
    },
    {
      scope: [
        'keyword',
        'keyword.control',
        'storage',
        'storage.type',
        'storage.modifier',
        'support.type.property-name',
        'entity.name.tag.yaml',
        'entity.name.function',
        'support.function',
      ],
      settings: { foreground: '#FFFFFF' },
    },
    {
      scope: ['string', 'constant.numeric', 'constant.language', 'constant.other'],
      settings: { foreground: '#BCBCBC' },
    },
    {
      scope: ['variable', 'entity.name', 'support.type', 'support.class', 'meta.definition'],
      settings: { foreground: '#E0E0E0' },
    },
  ],
};

/** Light — the same ramp inverted onto Paper. */
export const foldLight = {
  name: 'fold-light',
  type: 'light',
  colors: {
    'editor.background': '#F6F6F6',
    'editor.foreground': '#3D3D3D',
    'editorLineNumber.foreground': '#8A8A8A',
    'editor.selectionBackground': '#D4D4D4',
    'terminal.background': '#F6F6F6',
    'terminal.foreground': '#3D3D3D',
  },
  settings: [
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: '#8A8A8A' },
    },
    {
      scope: ['punctuation', 'meta.brace', 'keyword.operator', 'meta.delimiter'],
      settings: { foreground: '#5C5C5C' },
    },
    {
      scope: [
        'keyword',
        'keyword.control',
        'storage',
        'storage.type',
        'storage.modifier',
        'support.type.property-name',
        'entity.name.tag.yaml',
        'entity.name.function',
        'support.function',
      ],
      settings: { foreground: '#121212' },
    },
    {
      scope: ['string', 'constant.numeric', 'constant.language', 'constant.other'],
      settings: { foreground: '#3D3D3D' },
    },
    {
      scope: ['variable', 'entity.name', 'support.type', 'support.class', 'meta.definition'],
      settings: { foreground: '#1F1F1F' },
    },
  ],
};
