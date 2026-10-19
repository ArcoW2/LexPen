'use strict';
// The installed fonts for the font settings (F1's font list in menus.js, the settings window): asked from the
// host once, each marked monospaced or not. Fonts the page cannot use by name (some weight variants, as
// "Cascadia Code SemiLight") are left out: text in them would fall back to another font.
let installedFonts = null;

async function usableFonts() {
  installedFonts ??= (await host('fonts')).filter(f => fontUsable(f.name));
  return installedFonts;
}

function fontUsable(name) {
  const ctx = (fontUsable.canvas ??= document.createElement('canvas')).getContext('2d');
  const width = font => { ctx.font = font; return ctx.measureText('mmmmmmmmmmlli 0O1W').width; };
  const quoted = `"${name.replace(/["\\]/g, '')}"`;
  return ['monospace', 'serif'].some(base => width(`20px ${quoted}, ${base}`) !== width(`20px ${base}`));
}
