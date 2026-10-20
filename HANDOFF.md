# LexPen - handoff (sessions of 2026-10-16 and 2026-10-19)

## 0. Current state (2026-10-19)

**Repository**
- GitHub: `https://github.com/ArcoW2/LexPen` (private, MIT license, Visual Studio `.gitignore`).
- Local folder: `D:\prive\SynologyDrive\Projects\LexPen`.
- `main` is on GitHub (pushed 2026-10-19, last at `caa3f7b`; `git ls-remote origin` showed only `main`).
- Work is done on a local branch and squash-merged into `main` when you approve it (`git merge --squash`, one
  commit with the time of the merge), then only `main` is pushed: the commit times of the work stay on this PC
  (your wish, 2026-10-19). Branch `editor-first` was merged that way into `7933b15`; it stays local, never pushed.
- Local branch `scratch` holds the raw copy from before the cleanup, under the old name. It must **never be
  pushed**; delete it (`git branch -D scratch`) once you have checked nothing is missing on GitHub.
- Commits use only the GitHub noreply address: `user.email` is set in this repository's own config
  (`147609951+ArcoW2@users.noreply.github.com`). The global `user.email` is a different address, so any
  new personal repository needs its own `user.email` too. GitHub blocks pushes that expose a private email.
- Git credentials: the global config has per-host entries; `https://github.com` uses the GitHub username
  `ArcoW2` (not an email; set on 2026-10-19, before that every push opened the browser) and no
  `usehttppath`, so the stored login is used.
- Synology Drive: exclude `bin`, `obj`, `.vs`, `publish`, `node_modules` from syncing (and preferably
  `.git`); work in this folder from one machine only.

**Name and icon**
- Name: LexPen. One web search per name: no product found with that exact name; the nearest is Lex (an AI
  word processor). Rejected on the way: LexEdit (Brazilian legislative drafting system, Italian 1990
  prototype), Lexed (PyPI editor), Lexory, Lexemo, Lexora (all in use), Lexwerk (close to Lexwork and
  Lexware), Lexit (sounds like exit).
- Repo description: "Fast, intuitive and flexible text and code editor for Windows, with a built-in viewer."
  (also in About, README and `register.ps1`).
- Icon: `img/icon/lexpen.svg` is the source: an L drawn as an I-beam cursor, dark blue `#1f3a5f` on a
  light-blue `#82c0ff` rounded square, the foot fading in bands dark green `#2e8b47`, yellow `#e0a82e`,
  light red `#ff8f87`. One icon for light and dark. `img/icon/make-ico.ps1` rebuilds `lexpen.ico`
  (16 to 256 px) and `lexpen.png` from it with Edge headless. These are the only files in `img/icon/`;
  the earlier candidates were removed.
- Explorer caches icons: a pinned shortcut may show an old icon until it is pinned again.

**Next**
- Merged into `main` (`7933b15`): `docs/plans/executed/PLAN-editor-first.md` (editor first, keys file with
  chords, menu bar, F1 as command palette, bookmarks, numbered clipboards, gutter, bottom bar, encodings, backup on
  save); its section 5 lists every decision taken during the run.
- Also merged: the settings window and settings.json, the data folder's `State\` subfolder
  (`docs/plans/executed/PLAN-settings-window.md`); pinned and read-only tabs, Close all tabs (`docs/plans/executed/PLAN-pinned-tabs.md`); wrapping, the editor / preview splitter and the heartbeat
  (`docs/plans/executed/PLAN-long-lines.md`); fonts and line height (`docs/plans/executed/PLAN-fonts.md`) and the fix for Ctrl+V with the Windows
  clipboard.
- Language packs: `docs/plans/executed/PLAN-language-packs.md`, merged into `main` (`0e6417d`).
- Merged into `main` (`498d791`) and pushed: theme inheritance, the language set, pane marks, whitespace, the
  fixes of that branch.
- Merged into `main` (`8b73c1f`) and pushed (2026-10-20): projects and window sessions
  (`docs/plans/executed/PLAN-window-sessions.md`), embedded languages
  (`docs/plans/executed/PLAN-embedded-languages.md`), the tab bar's show-in-folder-pane button.
- Merged into `main` (`cec859e`) and pushed: column mode (`docs/plans/executed/PLAN-column-selection.md`).
- Merged into `main` (`b207422`) and pushed: conversions, pretty print (JSON, XML), trailing whitespace on save,
  tab and indent stops, the Format menu from the bars (`docs/plans/executed/PLAN-formatters.md`). Plan waiting:
  `PLAN-virtual-space.md` (cursor past the end of the line; no questions left).
- On the local branch `app-files`: one `LexPen.exe` and a folder `defaults` (the page in the exe, served from
  there; `docs/plans/executed/PLAN-app-files.md`, with the start-up measurements).
- Earlier, on `theme-inheritance` (now merged): theme inheritance
  (`docs/plans/executed/PLAN-theme-inheritance.md`), the language set from the UltraEdit word files and the debug
  build reading packs and themes from the project (`docs/plans/executed/PLAN-language-set.md`), Esc closing the
  find bar / sidebar search first, File > Open on All files, the languages guide (`defaults/languages/README.md`).
- Before making the repository public, also: YamlDotNet (MIT) in THIRD-PARTY-NOTICES.
- Merged into `main` (`caa3f7b`): themes (`docs/plans/executed/PLAN-themes.md`), the preview theme per mode and
  find at the end of the file; the padlock for read-only tabs (`752eb7c`).
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
| Hex view (idea, 2026-10-19) | A hex layout of the file: the bytes in hex on the left, the characters on the right. Not planned yet |
| Multi-cursor (idea, 2026-10-19) | Several cursors, typing goes to all of them. CodeMirror 5 already adds a cursor with Ctrl+click; missing: adding cursors from the keyboard (next match, line above / below), keys and menu items |
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

## 4b. Editor first: things to know

- Keys are matched by physical key: a key name in keys.json means that key's place on a US keyboard.
- On this PC PowerToys takes Ctrl+Shift+C (clipboard list) and Ctrl+` (inline code); Windows takes Ctrl+Shift+0
  (an input language hotkey). Your own `%LOCALAPPDATA%\LexPen\keys.json` can move them.
- The release build has the WebView2 DevTools switched off (their element picker sits on Ctrl+Shift+C); the
  debug build keeps them, the tests need the debugging port.
- Tab, Shift+Tab, Enter and Shift+Enter are fixed editor keys, not in keys.json.
- One very long coloured line (thousands of coloured pieces) makes the browser take seconds to find what is
  under the mouse; it only shows with the real mouse, not with synthetic moves through the debugging port.
  Wrapping avoids it (docs/plans/executed/PLAN-long-lines.md).
- The comment and fold add-ons of CodeMirror and the line diff were added without Node.js: see section 5 of the
  editor-first plan before running `vendor.ps1`.

## 5. How it was tested (to repeat later)

- Unit tests: `dotnet test tests\LexPen.Tests` (routing, drafts, image links, recent lists, folder search).
- The app was driven through the WebView2 debugging port: start the debug build with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and `LEXPEN_DATA=<scratch folder>`
  (keeps the real session, drafts and settings in `%LOCALAPPDATA%\LexPen` untouched), then use
  `http://127.0.0.1:9222/json` and CDP (`Runtime.evaluate`, `Input.dispatchKeyEvent`,
  `Input.dispatchMouseEvent`, `Page.captureScreenshot`). The helper scripts lived in the session scratchpad
  and are not in the repository. In the editor-first run: a PowerShell module with Start-LexPen / Eval / Key /
  Check over CDP, one test script per step; checks include that every key in keys.json has an action.
- Keys that only a real keyboard can show (Windows, WebView2 or tools like PowerToys taking them first): the
  debug build with an on-screen key log injected through the debugging port; you press the keys, the log is
  read back. SendKeys only reaches the window in front, so it is not used.
- Use a port of its own for test copies (9333 in the last run) and refuse to start when it is taken: with
  9222 open on your own LexPen, a test copy cannot get it and the tests drive your LexPen instead.
- Problems that only the real mouse shows (see 4b): attach to your LexPen started with the port, run a
  recorder (page answer times, long tasks, CPU per process), a CPU profile or a browser trace
  (`Tracing.start`, category devtools.timeline) while you reproduce it.
- After changing files in `web` while the debug build runs: the debug build serves the project's `web` itself;
  reload with the cache ignored (`Page.reload` with `ignoreCache`), or the old `app.js` keeps running. The
  release build serves the page from the exe (WebFiles.cs).
- Close the test app before `dotnet build` (it locks `LexPen.exe`).

## 6. Your working rules that applied (from CLAUDE.md and this session)

- Plans go to the Docs folder or the project folder; no implementation until asked.
- Plain ASCII everywhere; no invented counts or figures.
- Commit freely, push only when asked.
- During "execute the plan" runs: no questions; decisions and problems go into the plan's
  "Resolved issues during execution" table.
