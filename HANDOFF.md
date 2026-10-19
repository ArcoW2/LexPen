# LexPen - handoff (sessions of 2026-10-16 and 2026-10-19)

## 0. Current state (2026-10-19)

**Repository**
- GitHub: `https://github.com/ArcoW2/LexPen` (private, MIT license, Visual Studio `.gitignore`).
- Local folder: `D:\prive\SynologyDrive\Projects\LexPen`.
- `main` is committed locally and **not pushed yet**. Push only `main` (`git push -u origin main`, never
  `--all`), then check `git ls-remote origin` shows only `main`.
- Local branch `scratch` holds the raw copy from before the cleanup, under the old name. It must **never be
  pushed**; delete it (`git branch -D scratch`) once `main` is on GitHub and nothing is missing.
- Commits use only the GitHub noreply address: `user.email` is set in this repository's own config
  (`147609951+ArcoW2@users.noreply.github.com`). The global `user.email` is a different address, so any
  new personal repository needs its own `user.email` too. GitHub blocks pushes that expose a private email.
- Git credentials: the global config has per-host entries; `https://github.com` uses the GitHub username
  (not an email) and no `usehttppath`, so the browser login is asked once.
- Synology Drive: exclude `bin`, `obj`, `.vs`, `publish`, `node_modules` from syncing (and preferably
  `.git`); work in this folder from one machine only.

**Name and icon**
- Name: LexPen. Names considered and rejected, with the reason, are in `docs/plans/PLAN-editor-first.md` 3.8.
- Repo description: "Fast, intuitive and flexible text and code editor for Windows, with a built-in viewer."
  (also in About, README and `register.ps1`).
- Icon: `img/icon/lexpen.svg` is the source: an L drawn as an I-beam cursor, dark blue `#1f3a5f` on a
  light-blue `#82c0ff` rounded square, the foot fading in bands dark green `#2e8b47`, yellow `#e0a82e`,
  light red `#ff8f87`. One icon for light and dark. `img/icon/make-ico.ps1` rebuilds `lexpen.ico`
  (16 to 256 px) and `lexpen.png` from it with Edge headless. These are the only files in `img/icon/`;
  the earlier candidates were removed.
- Explorer caches icons: a pinned shortcut may show an old icon until it is pinned again.

**Next**
- The plan for this phase: `docs/plans/PLAN-editor-first.md` (editor first, chord keys Ctrl+H / Ctrl+K /
  Ctrl+Q, bookmarks, gutter, multi-clipboard). Open questions are in its section 4; first one: which
  features to strip (3.7).
- Before making the repository public: a name check (GitHub, winget, trademark registers), a
  `THIRD-PARTY-NOTICES.md` for the bundled libraries (licenses verified from `node_modules`), and a
  read-through of `docs/` for internal context.

## Earlier state

Where the work stands, so it can be picked up later. Details per feature are in the two plans:
`docs/plans/executed/PLAN-tabs-panes-windows.md` and `docs/plans/executed/PLAN-next-features.md` (both have a "Resolved issues during
execution" table with every decision taken without asking and every bug found).

## 1. What LexPen does now (short)

- Tabs per pane, two panes (side by side / above each other), compare scroll by source line, outline per pane.
- One process, several windows: later launches hand their paths over a named pipe; Shift opens a new window.
  Edit lock per file across windows, tabs move between windows with unsaved text and undo history.
- Drafts (`Drafts\editN.md`), session restore by the primary window, one close prompt.
- Disk changes: blue bar (changed, unsaved edits), red bar (removed), blue banner for silent reloads out of sight.
- Images: Ctrl+V / drop; linked in place inside the document's folder, else copied to `<name>.md.images`.
- Open menu with recently opened files/folders and recently closed files; search (Ctrl+Shift+F) with `^p` etc.;
  preview zoom; tree keyboard navigation; back/forward per window; help window (F1) with all shortcuts.

## 2. Not implemented yet

| Item | Status / notes |
|---|---|
| Line numbers in Read mode (L1) | Deferred by you ("not yet"). Proposal was: a gutter with the source line where each block starts, from the `data-line` attributes the compare scroll already uses; toggle in the More menu |
| Spell check (S1) | Deferred by you. The browser spell checker would also underline code blocks, inline code, URLs and front matter; excluding those needs marking editor tokens as not-to-check (untried). Whether LexPen can choose the languages (Dutch/English) or must follow Windows settings is not verified |
| Diff highlighting in compare mode | Dropped for now. Lining up two different files needs filler space on the shorter side; possible in the editor (CodeMirror line widgets), not cleanly in the rendered preview |
| Outline in narrow panes | Suggested, not asked: with two panes side by side the 220 px outline leaves a narrow text column. Option: hide the outline automatically below a pane width |
| Recent list on the welcome page | Proposed earlier; you chose the Open menu instead. Not built |
| Spell check / line numbers settings in the More menu | Would come with the two items above |
| Declined by you (listed so they are not proposed again) | Quick open by file name (xplorer2 is as fast); file actions in the tree (new, rename, delete); replace in search |

## 3. Built but not verified

These are implemented, but the test harness could not exercise them (native dialogs would wait on the
desktop, or a real mouse drag across windows / from Explorer is needed). Worth a manual check:

| Item | Where |
|---|---|
| Dragging a tab onto another LexPen window | HTML drag data between two WebView2 controls; fallback is right-click > Move to next window |
| Dragging a tab out of the window (new window at the drop point) | Only tested with a synthetic event |
| Dropping files or a folder from Explorer onto a pane | Uses `postMessageWithAdditionalObjects` |
| The close prompt dialog itself (TaskDialog: Save / Don't save / Cancel) | The flow was tested with the answer stubbed |
| The Shift question when adding images (relative / absolute / copy here / copy to image folder) | TaskDialog in `MainForm.AskImageMode` |
| "Save the draft as a file first" when pasting an image into a draft | Confirm dialog |
| Windows 10: dimmed title bar of secondary windows | Only Windows 11 was available; on Windows 10 only the toolbar dims |

## 4. Known limitations

- A tab moved to another window with unsaved changes stays marked unsaved even when undone back to the
  saved text (the undo history moves, the "saved" point does not).
- In the editor, Alt+Left / Alt+Right move the cursor (CodeMirror); back/forward works outside the editor.
- During testing a primary window once closed without a visible cause; not reproduced
  (`docs/plans/executed/PLAN-tabs-panes-windows.md`, item 22).
- A page reload would leave the host's edit locks of that window in place; not reachable (F5 / Ctrl+R are blocked).

## 5. How it was tested (to repeat later)

- Unit tests: `dotnet test tests\LexPen.Tests` (routing, drafts, image links, recent lists, folder search).
- The app was driven through the WebView2 debugging port: start the debug build with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and `LEXPEN_DATA=<scratch folder>`
  (keeps the real session, drafts and settings in `%LOCALAPPDATA%\LexPen` untouched), then use
  `http://127.0.0.1:9222/json` and CDP (`Runtime.evaluate`, `Input.dispatchKeyEvent`,
  `Input.dispatchMouseEvent`, `Page.captureScreenshot`). The helper scripts lived in the session scratchpad
  and are not in the repository.
- After changing files in `wwwroot` while the debug build runs: copy them to `bin\...\wwwroot` and reload
  with the cache ignored (`Page.reload` with `ignoreCache`), or the old `app.js` keeps running.
- Close the test app before `dotnet build` (it locks `LexPen.exe`).

## 6. Your working rules that applied (from CLAUDE.md and this session)

- Plans go to the Docs folder or the project folder; no implementation until asked.
- Plain ASCII everywhere; no invented counts or figures.
- Commit freely, push only when asked.
- During "execute the plan" runs: no questions; decisions and problems go into the plan's
  "Resolved issues during execution" table.
