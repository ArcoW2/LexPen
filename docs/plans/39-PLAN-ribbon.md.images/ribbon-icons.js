// Plan 39: a proposed icon for every ribbon button. One drawing per action on LexPen's 16-unit grid, stroked in the
// text colour (as the formatting bar's icons, format.js ICONS); small: 16 px, line 1.4; large: 32 px, line 1.0 (2 px
// on screen). Key: the action; label: the button's text in the mock. A panel (Window > Panels, View's panel groups)
// is its own icon at half size inside a small window: a frame with a title bar.
window.RIBBON_ICONS = (() => {
  const page = 'M3.5 1.5h5.5l3 3V9M3.5 1.5v13H8';
  const mag = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/><path d="M${cx + r * 0.72} ${cy + r * 0.72}L${cx + r * 0.72 + 2.6} ${cy + r * 0.72 + 2.6}"/>`;
  const clip = 'M5.5 1.5h5v2.5h-5zM5.5 2.5H3v12h10v-12h-2.5';
  const mark = 'M9.5 2.5l4 4-5.5 5.5H5l-1-1V8z';
  const p = d => `<path d="${d}"/>`;
  const t = (x, y, s, txt, w = 600) => `<text x="${x}" y="${y}" font-size="${s}" font-weight="${w}" fill="currentColor" stroke="none" font-family="Segoe UI">${txt}</text>`;
  const dim = d => `<path d="${d}" opacity=".4"/>`;
  const dot = (x, y) => `<path d="M${x} ${y}h0"/>`;   // a round dot as wide as the line
  // A cogwheel: n teeth between radius ri and ro, a hole of radius rh.
  const gear = (cx, cy, ro, ri, n, rh) => {
    const pts = [];
    for (let i = 0; i < n * 4; i++) {
      const a = (i / (n * 4)) * 2 * Math.PI - Math.PI / 2, r = (i % 4 === 1 || i % 4 === 2) ? ro : ri;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return p('M' + pts.join('L') + 'z') + `<circle cx="${cx}" cy="${cy}" r="${rh}"/>`;
  };
  const cog = gear(8, 8, 6.6, 4.9, 8, 2);
  // Occurrences: marked text (the marks bold), room at the bottom right for a corner sign.
  const marked = dim('M2 3.5h12M2 8h12M2 12.5h6') + '<path d="M4 3.5h4M9 8h4M2.5 12.5h3" stroke-width="2.6"/>';
  const eraser = p('M11.6 8.6l3.2 3.2-2.6 2.6h-2l-1.4-1.4zM9.9 10.3l3.2 3.2');
  const sortLines = 'M2 3.5h7M2 7h5M2 10.5h3';
  const keyboard = '<rect x="1" y="4" width="14" height="8.5" rx="1.5"/>' + [3.6, 6.2, 8.8, 11.4].map(x => dot(x, 6.8)).join('') + dot(3.6, 9.8) + p('M6.2 9.8h3.6') + dot(12.4, 9.8);
  const buttons = {
    // File
    save: ['Save', p('M2.5 2.5h9l2 2v9h-11zM5 2.5v3.5h5.5V2.5M4.5 13.5V9.5h7v4')],
    saveAs: ['Save as...', p('M2.5 2.5h8l2 2V7M2.5 2.5v11h4.5M4.5 2.5v3h5v-3') + p('M8.5 14.5l.5-2 4.5-4.5 1.5 1.5-4.5 4.5z')],
    newFile: ['New file', p(page) + p('M12 10.5v4M10 12.5h4')],
    openFile: ['Open file...', p('M1.5 13V3h4l1.5 1.5h5.5V7M1.5 13h11l2-6h-10z')],
    print: ['Print...', p('M4.5 6V1.5h7V6M4.5 12h-2V6h11v6h-2M4.5 9.5h7v5h-7z')],
    closeTab: ['Close tab', p('M1.5 13.5V4a1 1 0 0 1 1-1h5l1.5 1.5h5v9zM6 7l4 4M10 7l-4 4')],
    // Edit, Lines
    indentMore: ['Indent', p('M7 3h7M7 7h7M7 11h7M2 14h12M2 5l2.5 2L2 9')],
    indentLess: ['Outdent', p('M7 3h7M7 7h7M7 11h7M2 14h12M4.5 5L2 7l2.5 2')],
    insertCharacter: ['Insert character', p('M3.5 13.5h2.5v-1.6A4.6 4.6 0 1 1 10 11.9v1.6h2.5')],
    complete: ['Complete word', p('M2 4h5M2 7h3') + p('M7.5 8.5h7v6h-7zM9 10.5h4M9 12.5h2.5')],
    duplicateLines: ['Duplicate', p('M2 4h8M2 8h8M12.5 9.5v5M10 12h5')],
    deleteLines: ['Delete', p('M2 4h8M2 8h5M10 9.5l4.5 4.5M14.5 9.5L10 14')],
    joinLines: ['Join', p('M2 3.5h6.5a2.5 2.5 0 0 1 0 5H2M2 13h12M11.5 10.5L14 13l-2.5 2.5')],
    // Clipboard
    paste: ['Paste', p(clip + 'M6 8h4M6 11h4')],
    pasteImage: ['Paste image', p(clip + 'M5 13l2.5-2.5 1.5 1.5 1.5-1.5 1.5 1.5') + '<circle cx="10" cy="7.5" r="1"/>'],
    cut: ['Cut', '<circle cx="4.5" cy="12" r="2"/><circle cx="11.5" cy="12" r="2"/>' + p('M5.7 10.4L12 1.5M10.3 10.4L4 1.5')],
    copy: ['Copy', p('M5.5 5.5h8v9h-8zM10.5 5.5v-4h-8v9h3')],
    // Find, Occurrences, Go to
    find: ['Find', mag(6.8, 6.8, 4.5)],
    findPrevious: ['Find previous', mag(5.5, 9, 3.3) + p('M12.5 8V1.5M10.5 3.5l2-2 2 2')],
    findNext: ['Find next', mag(5.5, 9, 3.3) + p('M12.5 1.5V8M10.5 6l2 2 2-2')],
    replace: ['Replace', p('M2 4.5h8.5M8.5 2.5l2 2-2 2M14 11.5H5.5M7.5 9.5l-2 2 2 2')],
    searchReplace: ['Replace in files', p('M2.5 1.5h5l2 2v3M2.5 1.5v12H6') + p('M8 9.5h6.5M12.5 7.5l2 2-2 2M14.5 13.5H8.5M10.5 11.5l-2 2 2 2')],
    searchInFiles: ['Search in files', p('M2.5 1.5h6l2.5 2.5v3M2.5 1.5v13H7') + mag(10.3, 10.3, 2.5)],
    findReferences: ['Find references', marked + mag(11.6, 11.4, 2.2)],
    'occurrences.show': ['Show', dim('M2 3.5h12M2 8h12M2 12.5h12') + '<path d="M4 3.5h4M9 8h4M3 12.5h4" stroke-width="2.6"/>'],
    'occurrences.clear': ['Clear', marked + eraser],
    goToLine: ['Line', p('M2 8h8M7 5l3 3-3 3M12.5 2.5v11')],
    goToDefinition: ['Definition', p('M1.5 8h6M5 5.5L7.5 8 5 10.5') + p('M12 2.5c-1.6 0-1.6 1.2-1.6 2.6S10.2 7.6 9.5 8c.7.4.9 1.4.9 2.9s0 2.6 1.6 2.6M13 2.5c1.2 0 1.5.8 1.5 2.2M13 13.5c1.2 0 1.5-.8 1.5-2.2')],
    // Bookmarks
    bookmarkToggleFree: ['Toggle bookmark', p('M4 1.5h8v13l-4-3-4 3z')],
    'bookmarkNext.-1': ['Previous', p('M2.5 3h5v10.5l-2.5-2-2.5 2zM12 13.5v-10M9.5 6L12 3.5 14.5 6')],
    'bookmarkNext.1': ['Next', p('M2.5 3h5v10.5l-2.5-2-2.5 2zM12 3.5v10M9.5 11L12 13.5 14.5 11')],
    // Select & Sort
    selectAll: ['Select all', '<rect x="1.5" y="1.5" width="13" height="13" rx="1" stroke-dasharray="2 1.7"/>' + p('M4.5 5.5h7M4.5 8h7M4.5 10.5h5')],
    selectLine: ['Line', dim('M2 3h12M2 13h12') + '<rect x="1.5" y="5.5" width="13" height="5" rx="1"/>' + p('M3.5 8h9')],
    blockSelect: ['Block', dim('M2 3h12M2 6.3h12M2 9.7h12M2 13h12') + '<rect x="5" y="1.5" width="6" height="13" rx="1"/>'],
    selectInsideBrackets: ['Brackets', p('M4.5 2q-3 6 0 12M11.5 2q3 6 0 12') + '<rect x="6" y="5.5" width="4" height="5" rx=".8"/>'],
    columnMode: ['Column mode', dim('M2 3h12M2 6.3h12M2 9.7h12M2 13h12') + '<path d="M8 1.5v13" stroke-width="2.4"/>'],
    'edit.sortWindow': ['Sort...', p(sortLines + 'M12 2.5v9M10 9.5l2 2 2-2') + '<circle cx="8" cy="14" r=".5" fill="currentColor"/><circle cx="10.5" cy="14" r=".5" fill="currentColor"/><circle cx="13" cy="14" r=".5" fill="currentColor"/>'],
    'edit.sortAsc': ['Sort ascending', t(1, 7, 6.5, 'A') + t(1, 14.5, 6.5, 'Z') + p('M12 2v11M10 11l2 2 2-2')],
    'edit.sortDesc': ['Sort descending', t(1, 7, 6.5, 'Z') + t(1, 14.5, 6.5, 'A') + p('M12 2v11M10 11l2 2 2-2')],
    'edit.sortAgain': ['Sort again', p(sortLines + 'M14.6 7.5a2.8 2.8 0 1 1-2.8-2.8M10.7 3.5l1.1 1.2-1.2 1.1')],
    undo: ['Undo', p('M5.5 3.5L2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H6')],
    redo: ['Redo', p('M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h4')],
    // Review
    'highlight.toggle': ['Highlight', p(mark + 'M2 14.5h8')],
    'highlight.note': ['Highlight note', p('M2 2.5h12v8.5H7.5L4.5 14v-3H2zM4.5 5.5h7M4.5 8h4.5')],
    'highlight.remove': ['Remove highlight', p(mark + 'M2 2l12 12')],
    // View
    editor: ['Editor', p('M2 3h12M2 6.5h8M2 10h11M2 13.5h5M12.5 11.5v3.5M11.5 11.5h2M11.5 15h2')],
    preview: ['Preview', p('M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z') + '<circle cx="8" cy="8" r="2"/>'],
    wrap: ['Wrap long lines', p('M2 3.5h12M2 8h9.5a2.3 2.3 0 0 1 0 4.6H8.5M10 11l-1.5 1.6 1.5 1.5M2 12.5h3.5')],
    'lineNumbers.set': ['Line numbers', p('M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5') + t(0.6, 5.6, 5, '1') + t(0.6, 9.6, 5, '2') + t(0.6, 13.6, 5, '3')],
    ruler: ['Ruler', '<rect x="1.5" y="5" width="13" height="6" rx="1"/>' + p('M4 5v2.5M6.5 5v1.5M9 5v2.5M11.5 5v1.5')],
    formatBar: ['Formatting bar', '<rect x="1.5" y="2" width="13" height="5" rx="1"/>' + t(3, 6.3, 4.2, 'B', 700) + t(7.2, 6.3, 4.2, 'I', 400) + dim('M2 10.5h12M2 13.5h8')],
    zoomIn: ['Zoom in', mag(6.8, 6.8, 4.5) + p('M6.8 4.8v4M4.8 6.8h4')],
    zoomOut: ['Zoom out', mag(6.8, 6.8, 4.5) + p('M4.8 6.8h4')],
    zoomReset: ['Zoom 100%', mag(6.8, 6.8, 4.5) + p('M5 4.8v4M8.6 4.8v4') + '<circle cx="6.8" cy="5.8" r=".45" fill="currentColor"/><circle cx="6.8" cy="7.8" r=".45" fill="currentColor"/>'],
    'theme.day': ['Day', '<circle cx="8" cy="8" r="3"/>' + p('M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3')],
    'theme.night': ['Night', p('M13 10.5A5.5 5.5 0 1 1 6 2.8a4.5 4.5 0 0 0 7 7.7z')],
    // Tools
    'macro.record': ['Record', '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.8" fill="currentColor"/>'],
    'macro.play': ['Play', p('M4.5 2.5l8.5 5.5-8.5 5.5z')],
    'macro.playTimes': ['Play X times...', p('M3 1.5l11.5 6.5L3 14.5zM5 6.2l3.6 3.6M8.6 6.2L5 9.8')],
    compareFiles: ['Compare files...', p('M1.5 2.5h5v11h-5zM9.5 2.5h5v11h-5zM3 5h2M3 7.5h2M11 5h2M11 7.5h2') + '<path d="M3 10h2M11 10h2" stroke-width="2.2"/>'],
    compareFolders: ['Compare folders...', p('M1 4h3l1 1h2.5v7.5H1zM8.5 4h3l1 1H15v7.5H8.5z')],
    compareClose: ['Leave the compare', p('M1.5 2.5h4v8h-4zM10.5 2.5h4v8h-4zM6.5 11l3 3M9.5 11l-3 3')],
    compareNext: ['Next difference', p('M1.5 2.5h4v11h-4zM10.5 2.5h4v11h-4zM8 3.5v8M6 9.5l2 2 2-2')],
    comparePrevious: ['Previous difference', p('M1.5 2.5h4v11h-4zM10.5 2.5h4v11h-4zM8 12.5v-8M6 6.5l2-2 2 2')],
    settings: ['Settings...', cog],
    themeColours: ['Theme colours...', p('M8 1.5a6.5 6.5 0 1 0 0 13c1 0 1.5-.7 1.5-1.5s-.6-1.2-.6-2 .7-1.5 1.5-1.5h1.6a2.5 2.5 0 0 0 2.5-2.5C14.5 4 11.6 1.5 8 1.5z') + '<circle cx="4.7" cy="7.5" r=".9" fill="currentColor"/><circle cx="6.5" cy="4.5" r=".9" fill="currentColor"/><circle cx="10" cy="4.3" r=".9" fill="currentColor"/>'],
    commands: ['Keyboard shortcuts', keyboard],
  };
  // The panels: the inner drawing, framed by panelIcon.
  const panels = {
    folders: ['Folder', p('M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z')],
    searchView: ['Search', mag(6.8, 6.8, 4.5)],
    'bookmarks.pane': ['Bookmarks', p('M4 1.5h8v13l-4-3-4 3z')],
    'outline.toggle': ['Outline', p('M3 3h5.5M5.5 6.5h6M5.5 10h6M8 13.5h6M3 3v7h2.5M3 6.5h2.5')],
    'highlight.list': ['Highlights', p(mark + 'M2 14.5h8')],
    'csv.columns': ['Columns', '<rect x="1.5" y="2.5" width="13" height="11" rx="1"/>' + p('M1.5 6h13M6 2.5v11M10.5 2.5v11')],
    insertCharacter: ['Characters', p('M3.5 13.5h2.5v-1.6A4.6 4.6 0 1 1 10 11.9v1.6h2.5')],
    'clipboards.pane': ['Clipboards', p(clip + 'M6 8h4M6 11h4')],
    'edit.sortWindow': ['Sort', p(sortLines + 'M12 2.5v10M10 10.5l2 2 2-2')],
    'macro.manage': ['Macros', p('M2 3.5h8M2 7h8M2 10.5h5M10.5 9.5l4 2.5-4 2.5z')],
    step: ['Step by step', p('M1.5 14h3v-3h3V8h3V5h3V2')],
    settings: ['Settings', cog],
    commands: ['Keyboard shortcuts', t(1.5, 12, 9, 'F1', 700)],
    messages: ['Messages', p('M2 2.5h12v8.5H7.5L4.5 14v-3H2zM8 5v2.8') + '<circle cx="8" cy="9" r=".5" fill="currentColor"/>'],
    themesets: ['Theme sets', '<rect x="1.5" y="3.5" width="4" height="9" rx="1"/><rect x="6" y="3.5" width="4" height="9" rx="1" fill="currentColor" fill-opacity=".35"/><rect x="10.5" y="3.5" width="4" height="9" rx="1" fill="currentColor" fill-opacity=".8"/>'],
    projects: ['Projects', p('M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z') + p('M4 9h8')],
  };
  return { buttons, panels };
})();
// The groups of View that hold panels (as Window > Panels).
window.PANEL_GROUPS = ['Files and finding', 'The document', 'Editing', 'Macros panels', 'LexPen'];
// The svg of a drawing: small 16 px with lines of 1.4, large 32 px with lines of 1.0. A panel: a window (frame and
// title bar) with the drawing at 0.6 of its size in it, about a pixel from the frame; its lines widened by as much,
// so they show as wide as the frame's.
window.iconSvg = (body, size, panel) => {
  const px = size === 'large' ? 32 : 16, w = size === 'large' ? 1 : 1.4;
  const inner = panel ? `<rect x="1" y="1" width="14" height="14" rx="1.5"/><path d="M1 3.8h14"/><g transform="translate(3.2 4.6) scale(.6)" style="stroke-width: ${(w / 0.6).toFixed(2)}">${body}</g>` : body;
  return `<svg viewBox="0 0 16 16" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
};
// The icon of a label in the mock: a panel in View's panel groups, else a button ("Line" is Go to line and Select
// line: the group tells).
window.ribbonIcon = (label, group, size) => {
  const { buttons, panels } = window.RIBBON_ICONS;
  if (window.PANEL_GROUPS.includes(group) || (group === 'Macros' && window.RIBBON_GROUP_TAB === 'View')) {
    const hit = Object.values(panels).find(([l]) => l === label);
    if (hit) return window.iconSvg(hit[1], size, true);
  }
  const hit = Object.entries(buttons).filter(([, [l]]) => l === label);
  const pick = hit.length > 1 ? hit.find(([k]) => group === 'Go to' ? k === 'goToLine' : k !== 'goToLine') : hit[0];
  return pick ? window.iconSvg(pick[1][1], size, false) : null;
};
'icons ' + (Object.keys(window.RIBBON_ICONS.buttons).length + Object.keys(window.RIBBON_ICONS.panels).length)
