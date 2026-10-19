# Plan: editor font and app font

Status: executed on 2026-10-19 on the branch `editor-first` (fonts, then the editor line height). Decisions of the run are in section 5.

## 1. What this is about

The editor font and size, and the font of the rest of the app, cannot be chosen.

## 2. The solution, in brief

Options > Settings > Fonts gets four items: editor font, editor font size, app font, app font size. The font
lists come from the host (the installed fonts), monospaced fonts first. Ctrl+mouse wheel and the zoom keys
in the editor change the editor font size; in the preview they keep zooming the preview. The preview keeps
its own look.

## 3. Details

- Sizes in points, as Windows shows them. "Default" keeps today's look: Consolas 14 px (10.5 pt) in the
  editor, Segoe UI 13 px (9.75 pt) for the app.
- App font: the menus, tabs, folder pane, search, find bar, format bar, bottom bar and dialogs. Their smaller
  texts (key hints, counts) scale along with the chosen size. Places that are monospaced on purpose (key
  names in F1, find options) stay monospaced.
- The font lists: each name shown in its own font. A proportional font in the editor is allowed but listed
  under "Other fonts": it throws off column alignment.
- Kept per user like the other settings; a change shows in every open window.
- Language packs: their `colors` part may also give bold, italic, underline and strikethrough per token type
  (added to PLAN-language-packs.md; built with that plan).

## 4. Tests

- Unit test: the host's font list holds Consolas as monospaced and Segoe UI as not.
- In-app script: each setting changes the computed font of the editor or the app, survives a restart, and
  Default returns to today's look; Ctrl+wheel and Ctrl+= in the editor change the editor size and leave the
  preview zoom alone; in the preview they zoom the preview.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
| 1 | Zoom in the editor: a zoom on top of the chosen size, or the size itself? | The size itself: Ctrl+= / Ctrl+- / Ctrl+wheel set the editor font size a point up or down (6 to 48 pt) and it is kept; Ctrl+0 (Zoom 100%) sets the default. A short message shows the new size. One size, so there are not two kinds of bigger. |
| 2 | Which zoom a key or the View menu means. | The editor's when an editor has the focus (the menus leave it there), else the preview's. Ctrl+wheel follows the place under the mouse. |
| 3 | The app's smaller texts (key hints, counts, the bottom bar) had fixed pixel sizes. | They are multiplied by `--ui-scale` (chosen size / 13 px), so they keep their proportion to the app font. The bookmark numbers in the gutter and the preview are left alone. |
| 4 | The font list showed names of symbol fonts (barcode, Marlett) as symbols. | The name is shown in the app font, with a sample `AaBb 0O 1lI` in the font itself. |
| 5 | Some installed families cannot be used by name in the page; text in them would silently fall back. | Left out of the list: a canvas measures a sample in the font against two fallbacks; when both are equal the font is not usable. |
| 6 | Sizes offered. | Default, then 8 to 14 pt per point, 16, 18, 20, 24 pt. The default shows its size: 10.5 pt editor, 9.75 pt app (today's 14 and 13 px). |
| 7 | F1 and the four font actions (a font name is no fixed list of variants). | Without a font or size (F1) the action opens the same list as the menu. |
| 8 | Tests. | Unit tests: Fonts (84 in total pass). In-app script t13-fonts: settings, restart, defaults, Ctrl+wheel and zoom keys in editor and preview, the F1 list; the earlier scripts (keys, menus, clipboards, menu letters, paste) pass again. |
| 9 | Editor line height (asked on 2026-10-19: too large, preferably selectable). | Options > Settings > Fonts > Editor line height: 1 to 2 times the font size. The default goes from 1.6 to 1.3. Change markers in the gutter do not make a line taller (checked at 1). |
