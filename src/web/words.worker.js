'use strict';
// The words of a document for word completion (complete.js), gathered away from the page so typing never waits.
// In: { id, text, prefixes } (the prefixes of the languages' "starts with" words: '@', '@@', '$', ...).
// Out: { id, words, prefixed }: each a list of { w, lw (lower case), n (count), lines (the lines it is on, in order) },
// sorted by lw. words: every word of at least 3 characters not starting with a digit; prefixed: the words that start
// with a prefix and go on with word characters, as the highlighter matches them.

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

onmessage = ({ data: { id, text, prefixes } }) => {
  const words = new Map(), prefixed = new Map();
  const add = (map, w, line) => {
    let e = map.get(w);
    if (!e) map.set(w, e = { n: 0, lines: [] });
    e.n++;
    if (e.lines[e.lines.length - 1] !== line) e.lines.push(line);
  };
  const own = new Set(prefixes);
  const preRe = prefixes.length
    ? new RegExp('(?:' + [...prefixes].sort((a, b) => b.length - a.length).map(escapeRegex).join('|') + ')[\\w$]*', 'g') : null;
  const lines = text.split('\n');
  for (let l = 0; l < lines.length; l++) {
    const t = lines[l];
    for (const m of t.matchAll(/[\w$]+/g)) if (m[0].length >= 3 && !/^\d/.test(m[0])) add(words, m[0], l);
    if (preRe) for (const m of t.matchAll(preRe)) if (!own.has(m[0])) add(prefixed, m[0], l);
  }
  const list = map => [...map].map(([w, e]) => ({ w, lw: w.toLowerCase(), n: e.n, lines: e.lines }))
    .sort((a, b) => a.lw < b.lw ? -1 : a.lw > b.lw ? 1 : 0);
  postMessage({ id, words: list(words), prefixed: list(prefixed) });
};
