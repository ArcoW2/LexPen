'use strict';
// The find bar on a PDF (docs/plans/38-PLAN-pdf-view.md 3.3): on its text, as its frame reads it (each page's text
// items, a line break where a line ends; the offsets the highlights use). The texts are asked for once per frame
// (`texts`; a long PDF takes a moment: the bar says so meanwhile); the matches are found here with the bar's regex and
// sent to the frame to mark, the current one shown there. A match is [key, end, page, from, to]: key = page * 1e7 +
// from, so find.js's pickMatch compares them in order. find.js hands a PDF here (pdfFinding). Loaded after pdfview.js.

const pdfFinding = pane => !!pane.active?.doc.pdf && !!pane.find;
const PDF_PAGE_KEY = 1e7;

// The pages' texts, from the frame (pdfview.js passes the answer on); null while not yet there.
function pdfTexts(tab) {
  if (tab.pdf?.texts) return tab.pdf.texts;
  if (tab.pdf && !tab.pdf.asked) { tab.pdf.asked = true; pdfSend(tab, { kind: 'texts' }); }
  return null;
}
function pdfGotTexts(tab, texts) {
  tab.pdf.texts = texts;
  tab.pdf.findCache = null;
  const pane = paneOf(tab);
  if (pane?.active === tab && pane.find && !pane.find.el.hidden) refresh(pane, false);
}

function pdfMatches(tab, regex) {
  const texts = pdfTexts(tab), key = regex.source + '/' + regex.flags;
  if (!texts) return null;
  if (tab.pdf.findCache?.key === key) return tab.pdf.findCache.matches;
  const matches = [];
  texts.forEach((text, i) => {
    if (matches.length >= FIND_LIMIT) return;
    for (const [s, e] of matchesIn(text, regex)) matches.push([(i + 1) * PDF_PAGE_KEY + s, (i + 1) * PDF_PAGE_KEY + e, i + 1, s, e]);
  });
  tab.pdf.findCache = { key, matches };
  return matches;
}

// The find bar's colours, resolved in the preview (its theme), for the frame.
function pdfFindColours(tab) {
  const el = paneOf(tab)?.previewEl ?? document.body, probe = document.createElement('span');
  el.append(probe);
  probe.style.color = 'var(--find-hit)';
  const hit = getComputedStyle(probe).color;
  probe.style.color = 'var(--find-current)';
  const now = getComputedStyle(probe).color;
  probe.remove();
  return { hit, now };
}

const pdfSendMarks = (tab, matches, current) => pdfSend(tab, { kind: 'findMarks', ...pdfFindColours(tab),
  list: matches.map(m => ({ page: m[2], from: m[3], to: m[4] })), current: current ? { page: current[2], from: current[3], to: current[4] } : null });

// find.js refresh: counted and marked, and (typing) to the first match from where the search started.
function pdfFindRefresh(pane, regex, moving) {
  const bar = pane.find, tab = pane.active, matches = pdfMatches(tab, regex);
  bar.marked = 'preview' + tab.id;
  if (!matches) { bar.count.textContent = 'Reading the PDF...'; bar.count.classList.remove('mm-none'); return; }
  pdfSendMarks(tab, matches, null);
  if (moving && matches.length) pdfFindGo(pane, regex, 1, true);
  else showCount(pane, matches, null);
}

// To the next / previous match: from the current one, else from the top of the page shown.
function pdfFindGo(pane, regex, dir, fromOrigin) {
  const bar = pane.find, tab = pane.active, matches = pdfMatches(tab, regex);
  if (!matches) return pdfFindRefresh(pane, regex, false);
  if (!matches.length) return notFound(pane, matches, fromOrigin);
  const shown = (tab.pdf.state?.page ?? 1) * PDF_PAGE_KEY;
  let i;
  if (fromOrigin) { bar.origin ??= shown; i = matches.findIndex(m => m[0] >= bar.origin); }
  else if (bar.at == null) i = dir > 0 ? matches.findIndex(m => m[0] >= shown) : matches.findLastIndex(m => m[0] < shown);
  else i = dir > 0 ? matches.findIndex(m => m[0] > bar.at) : matches.findLastIndex(m => m[0] < bar.at);
  i = pickMatch(pane, matches, i, dir, fromOrigin);
  if (i < 0) return;
  const m = matches[i];
  bar.at = m[0];
  pdfSend(tab, { kind: 'findShow', page: m[2], from: m[3], to: m[4] });
  showCount(pane, matches, i);
}

// find.js clearMarks: the frame's marks go too.
function pdfClearFind(pane) {
  const tab = pane.active;
  if (tab?.doc.pdf && tab.pdf?.frame?.isConnected) pdfSend(tab, { kind: 'findMarks', list: [], current: null });
}

// A one-line selection in the PDF fills the search when the bar opens (find.js selectedText).
function pdfSelectedText(pane) {
  const parts = pane.active?.pdf?.selection ?? [], text = parts.length === 1 ? parts[0].text : '';
  return text && !text.includes('\n') ? text : '';
}

// The frame loaded again (the tab moved, shown again): its marks again, with the bar open.
function pdfFindAgain(tab) {
  tab.pdf.asked = false;
  const pane = paneOf(tab);
  if (pane?.active === tab && pane.find && !pane.find.el.hidden && tab.pdf.texts) refresh(pane, false);
}
