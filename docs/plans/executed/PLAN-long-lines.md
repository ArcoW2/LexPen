# Plan: long lines, wrapping, the editor / preview splitter

Status: executed on 2026-10-19 on the branch `editor-first`, after a stall was found with a JSON file of one
line (241,477 characters). Decisions and findings are in section 5.

## 1. What this is about

- Moving the mouse over the preview of a file with one very long coloured line froze LexPen for 10 to 18
  seconds per move or click.
- There was no setting for wrapping long lines.
- Editor and preview side by side were always half and half.
- The Outline button did nothing visible on code files; the square between the editor's scrollbars was white
  in the dark theme; there was no sign whether LexPen was busy or stuck.

## 2. The solution, in brief

View > Wrap long lines (Alt+Z, on by default) wraps the editor and code in the preview; a line longer than
10,000 characters always wraps in the preview, because one long coloured line is what freezes the browser.
A splitter between editor and preview sets their widths. The Outline button is greyed out for files without
headings, the scrollbar corner follows the theme, and a heartbeat at the right of the bottom bar turns while
the page responds.

## 3. Details

- Wrap: `setWrap` (app.js): the editor's `lineWrapping` and `body[data-nowrap]` for the preview's code blocks.
  `renderNow` marks a code block with a line over `LONG_LINE` (10,000) as `mm-long-line`, which wraps anyway.
- Bottom bar: "Long line: colour stops at 10,000 characters" while such a file is in the editor (CodeMirror's
  `maxHighlightLength` is 10,000).
- Splitter: `.mm-split` between the editor and the preview; `--edit-share` (0.1 to 0.9) kept in
  `localStorage.editShare`; double-click: half and half; only shown with editor and preview side by side.
- Switching the preview on or off no longer sets the editor's language mode and gutter columns again when
  they did not change.

## 4. Tests

- In-app script t19-wrap: wrap default on in editor and preview, the long line marked and wrapped with wrap
  off, Alt+Z both ways, the View menu check mark, the long-line note, the Outline button for JSON and
  markdown, no mode or gutter reset on preview off / on, the splitter dragged to 30%, kept across a restart,
  double-click back to half and half, hidden without the preview.
- t17-filler: the scrollbar corner in the theme colour (dark), the heartbeat turns.
- The earlier scripts (keys, menus, clipboards, bookmarks, gutter, menu letters, fonts) pass again.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
| 1 | Where the stall came from. Profiles of the user's LexPen showed almost no JavaScript; a browser trace showed `HitTest` on mouse moves and presses taking 10.5 to 12 seconds. The user found it was hovering over the preview text, not the buttons. | Test pages in Edge with the same text (no LexPen): plain text fast, LexPen's styles fast; LexPen's colouring (41,637 coloured pieces in one line) stalled about 18 seconds, with or without LexPen's styles. Wrapped by the browser, or cut into lines of about 200 characters: fast. A browser limit on one long line of many pieces. |
| 2 | Synthetic mouse moves through the debugging port never stalled, in the test copy or in the user's LexPen. | Noted for later tests: this kind of problem only shows with the real mouse. |
| 3 | Fix: no colour for long lines, cut the line into blocks, or wrap. | Wrap: simplest, keeps the colour, and the user wants wrapping anyway. With wrapping off, a line over 10,000 characters still wraps in the preview. |
| 4 | Automatically switching the editor's wrapping off for files with a long line (proposed). | Dropped by the user: wrapping is needed. Also not the cause: the stall happened with the editor's wrapping off. |
| 5 | "Show the start, render the rest later" in the editor. | Not possible in CodeMirror 5: a line is laid out as one piece. Not needed once the preview wraps. |
| 6 | The heartbeat: in the page or in the host? | In the page, turned by the page's own timer (a CSS animation would keep turning on another thread), so it stands still exactly while the page is stuck. The user's alternative (turn red while stuck) needs the host; offered as a red title bar, not built. |
| 7 | The splitter: per pane or one value? | One value for all panes, kept across restarts, as the pane divider. |
| 8 | Outline on code files: the outline is hidden for them, so the button did nothing visible. | Greyed out for files with a language; an `outline` part (patterns for headings, procedures, functions) is added to the language packs plan. |
| 9 | The test helper used port 9222 while the user's LexPen had that port open, so three test runs drove the user's LexPen instead of the test copy (preview switched, wrapping off, preview content replaced, synthetic clicks; no edits or saves). | Test copies now use their own port (9333) and the helper refuses to start when that port is taken. |
