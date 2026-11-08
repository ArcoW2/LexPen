'use strict';
// The Theme colours window's page (themecolours.html; ThemeColoursForm hosts it), docs/plans/executed/PLAN-theme-colours.md:
// a theme chosen at the top (the app's theme of the window last worked in first); per colour name its group, what it
// is for (themecolourlist.js), where its value comes from (this theme, a base, or LexPen's default), the value as hex,
// rgb and hsl, and samples as text, line and block on that theme's background; under it the example, in that theme's
// colours only. The window itself stays in LexPen's look. Esc closes it.

const $ = s => document.querySelector(s);

// ---------- Host bridge (as in themesets.js) ----------
const pending = new Map(), events = {};
let lastId = 0;
function host(op, args) {
  return new Promise((resolve, reject) => {
    pending.set(++lastId, { resolve, reject });
    chrome.webview.postMessage({ ...args, id: lastId, op });
  });
}
chrome.webview.addEventListener('message', e => {
  if (e.data.event) return events[e.data.event]?.(e.data);
  const { id, result, error } = e.data;
  const call = pending.get(id);
  pending.delete(id);
  error ? call.reject(new Error(error)) : call.resolve(result);
});

const view = { list: null, values: {}, chosen: null };
const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Look: the app's theme (as the theme sets window) ----------
let themeVars = [];
function applyLook(look) {
  if (look) {
    document.documentElement.dataset.theme = look.mode;
    for (const name of themeVars) document.documentElement.style.removeProperty(name);
    for (const [name, value] of Object.entries(look.app.vars)) document.documentElement.style.setProperty(name, value);
    themeVars = Object.keys(look.app.vars);
  }
  const v = view.values, root = document.documentElement.style;
  root.setProperty('--app-font', v.appFont ? `"${v.appFont.replace(/["\\]/g, '')}", "Segoe UI", system-ui, sans-serif` : '"Segoe UI", system-ui, sans-serif');
  root.setProperty('--ui-scale', v.appSize ? v.appSize * 96 / 72 / 13 : 1);
  if (v.editorFont) root.setProperty('--editor-font', `"${v.editorFont.replace(/["\\]/g, '')}", Consolas, monospace`);
}

// ---------- Colour values ----------
// A theme value as [r, g, b, a]: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(); a var(--x) is the theme's --x.
function parseColour(value, vars, depth = 0) {
  const v = String(value ?? '').trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return depth < 5 ? parseColour(vars[ref[1]], vars, depth + 1) : null;
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? Math.round(n(6) / 255 * 100) / 100 : 1];
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
}
const hex2 = n => n.toString(16).padStart(2, '0');
function notations(c) {
  const [r, g, b, a] = c;
  const hex = '#' + hex2(r) + hex2(g) + hex2(b) + (a < 1 ? hex2(Math.round(a * 255)) : '');
  const rgb = a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  const [R, G, B] = [r / 255, g / 255, b / 255], max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = Math.round(h * 60 + 360) % 360;
  }
  const hsl = `hsl${a < 1 ? 'a' : ''}(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%${a < 1 ? ', ' + a : ''})`;
  return { hex, rgb, hsl, css: `rgba(${r}, ${g}, ${b}, ${a})` };
}

// ---------- Drawing ----------
const themeOf = id => view.list?.themes.find(t => t.id === id);

function drawChoice() {
  const list = view.list;
  const sel = $('.tc-theme');
  sel.innerHTML = list.themes.map(t => `<option value="${escapeHtml(t.id)}"${t.id === view.chosen ? ' selected' : ''}>${escapeHtml(t.name)}` +
    `${t.description ? ' - ' + escapeHtml(t.description) : ''}${t.mine ? ' (yours)' : ''}</option>`).join('');
}

function draw() {
  const list = view.list;
  if (!list) return;
  if (!themeOf(view.chosen)) view.chosen = themeOf(list.current) ? list.current : list.themes[0]?.id;
  const theme = themeOf(view.chosen);
  if (!theme) return;
  drawChoice();
  const vars = theme.vars, bg = vars['--bg'], fg = vars['--fg'];
  const own = Object.values(theme.from).filter(id => id === theme.id).length;
  $('.tc-about').textContent = `${theme.dark ? 'A dark theme' : 'A light theme'}; it sets ${own} of its colours itself`;
  const fromText = id => !id ? "LexPen's default" : id === theme.id ? 'this theme' : themeOf(id)?.name ?? id;
  let rows = '';
  for (const [group, colours] of THEME_COLOUR_GROUPS) {
    rows += `<tr class="tc-group"><td colspan="7">${escapeHtml(group)}</td></tr>`;
    for (const [key, what] of colours) {
      const cssVar = list.names[key], value = vars[cssVar], from = theme.from[cssVar] ?? null;
      const c = parseColour(value, vars), n = c && notations(c);
      const sample = inner => `<td class="tc-sample" style="background: ${escapeHtml(bg)}">${inner}</td>`;
      rows += `<tr class="tc-row${from === theme.id ? ' tc-own' : ''}" data-key="${key}">` +
        `<td class="tc-name">${key}</td><td class="tc-what">${escapeHtml(what)}</td>` +
        `<td class="tc-from" title="${from ? escapeHtml(from) + '.json' : 'app.css'}">${escapeHtml(fromText(from))}</td>` +
        `<td class="tc-value" title="As in the theme: ${escapeHtml(value)}">${n ? `<span>${n.hex}</span><span>${n.rgb}</span><span>${n.hsl}</span>` : escapeHtml(value ?? '-')}</td>` +
        (n ? sample(`<span class="tc-sample-text" style="color: ${n.css}">Text</span>`) +
          sample(`<div class="tc-sample-line" style="border-color: ${n.css}"></div>`) +
          sample(`<div class="tc-sample-block" style="background: ${n.css}; color: ${escapeHtml(fg)}">Block</div>`)
          : '<td></td><td></td><td></td>') + '</tr>';
    }
  }
  $('.tc-list').innerHTML = '<table class="tc-table"><thead><tr><th>Name</th><th>What it is for</th><th>From</th><th>Value</th>' +
    '<th>Text</th><th>Line</th><th>Block</th></tr></thead><tbody>' + rows + '</tbody></table>';
  // The example: the chosen theme's own variables (complete, with its mode's fallback), nothing of LexPen's look.
  const ex = $('.tc-example');
  ex.dataset.theme = theme.dark ? 'dark' : 'light';
  ex.style.cssText = Object.entries(vars).map(([name, v]) => `${name}: ${v}`).join('; ');
  if (!ex.firstChild) ex.innerHTML = themeExampleHtml();
}

// ---------- The divider between the list and the example (its place kept in this window's storage) ----------
const split = $('.tc-split');
function placeSplit(fraction) {
  const f = Math.min(0.85, Math.max(0.15, fraction));
  $('.tc-list').style.flex = `${f} 1 0`;
  $('.tc-example').style.flex = `${1 - f} 1 0`;
  return f;
}
try { const kept = parseFloat(localStorage.getItem('themeColoursSplit')); if (kept) placeSplit(kept); } catch { }
split.addEventListener('pointerdown', e => {
  split.setPointerCapture(e.pointerId);
  const top = $('.tc-list').getBoundingClientRect().top, bottom = $('.tc-example').getBoundingClientRect().bottom;
  let f = null;
  const move = m => { f = placeSplit((m.clientY - top) / (bottom - top)); };
  const up = () => {
    split.removeEventListener('pointermove', move);
    split.removeEventListener('pointerup', up);
    if (f !== null) try { localStorage.setItem('themeColoursSplit', String(f)); } catch { }
  };
  split.addEventListener('pointermove', move);
  split.addEventListener('pointerup', up);
});

// ---------- Events ----------
$('.tc-theme').addEventListener('change', e => { view.chosen = e.target.value; draw(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') host('close'); });
// A theme file or a setting changed: the look comes again, and with it the list.
events.look = async ({ look }) => { applyLook(look); view.list = await host('list'); draw(); };
events.settings = ({ settings }) => { view.values = settings ?? {}; applyLook(null); };

(async () => {
  const init = await host('init');
  view.values = init.settings ?? {};
  applyLook(init.look);
  view.list = init.list;
  draw();
})();
