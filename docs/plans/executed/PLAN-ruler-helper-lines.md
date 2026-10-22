# Plan: Ruler follow-up: quieter column guides, an intensity, helper lines, kept per file

Status: executed 2026-10-22 (web/ruler.js, RulerStore.cs; in-app test t88, 63 checks). Follows plan 10 (docs/plans/executed/PLAN-column-guides.md, web/ruler.js).
The number in the file name is the priority; rename to reorder.

## 1. What this is about

- The column guides are too present. They are drawn in the theme's border colour, which is a full UI line colour;
  by day they should be lighter, at night darker, so they sit closer to the background.
- On a theme change the ruler itself (the numbers, the guide ticks, the cursor's column) keeps the old theme's
  colours until something else redraws it: the ruler is a canvas and a theme change does not repaint it. The lines
  in the text already follow (they use theme colours), except a tab given an "Other colour", which is a fixed one.
- A right-click on the ruler can only add a tab. There is no line that only shows, without a stop for Tab (a helper
  line); the nearest is "Column guide here", which sets the one global extra guide.
- Tabs live in memory only: closing LexPen (or the file) loses them.

## 2. The solution, in brief

The column guides are drawn in a mix of the theme's border colour and its background, and a new intensity setting,
a slider on the Ruler and column guides page, sets how much border colour is in the mix. Less intensity moves the
line towards the background, so it gets lighter by day and darker at night by itself, and a theme change gives the
new theme's mix at once. The ruler repaints on a theme change. A line on the ruler is either a tab stop or a helper
line: the right-click menu adds either kind at that column, in the colour chosen below those items, and a plain
click then adds the same kind. A helper line looks like a guide in its own colour and Tab ignores it. Both kinds are per document, copied together, and kept per file path
by the host (drafts by their id) for the last 100 files opened, so they come back when the file is opened again, also after LexPen
restarts. Actions helperAdd, helperRemove and helperClear match the tab actions.

## 3. Details

### 3.1 The guide colour and the intensity

- The guide colour: `color-mix(in srgb, var(--border) <intensity>%, var(--bg))`, one CSS variable on the editor,
  used by the guide lines in the text and the guide ticks on the ruler (the canvas reads the resolved colour).
- Setting `columnGuideIntensity`: 0 to 100 in steps of 5, default 20 (more background than border; first 40). The default
  gets checked on a screenshot, day and night, before it is final.
- On Options > Settings, Editor, Ruler and column guides, as a slider with its value next to it; it applies while
  dragging. A slider is a new setting row kind (`range`: min, max, step); no settings row has one yet.
- The guides' own colour `columnGuideColour` (a theme colour, default border) and three sliders:
  `columnGuideIntensity` (the guides, default 40), `helperLineIntensity` (default 20), `tabStopIntensity` (default 50). Each mixes every theme colour of its lines (the defaults and
  the menu's colours) into the background; a colour from "Other colour..." is drawn as picked. The handles on the
  ruler keep full colour.
- Not per theme: one value for all themes. The mix with the theme's own background is what makes it lighter by day
  and darker at night.

### 3.2 A theme change

- The theme apply calls `applyRuler()`, so the canvas is painted with the new colours.
- The lines in the text use CSS variables and follow without a repaint.
- A line with a colour from "Other colour..." keeps that colour in every theme (a fixed colour, not a theme colour).

### 3.3 Tab stops and helper lines

- One list per document (the tabs list now), each line `{col, colour, kind}`, kind `tab` or `helper`. One line per
  column: a line is either a tab stop or a helper line. Adding one where the other kind is replaces it.
- Tab and Shift+Tab use the `tab` lines only.
- A helper line: drawn 1px wide behind the text (in the guide layer), in its colour; default colour the guide colour
  of 3.1, so one without a colour chosen looks like a column guide. A tab stays as now: 2px, over the text.
- On the ruler a helper line is only its line, without a handle (a click or drag within a few pixels of it); a tab
  stop keeps its filled square.
- Mouse, the same for both: a click on empty ruler adds the kind last added from the menu (at first a tab stop), a
  click on a handle removes that line, a drag on a handle moves it.
- The right-click panel: on top the actions, which close it; below them "Settings" with the colour, where a click
  only moves the check and the panel stays open (an action takes the colour, Cancel or a click elsewhere drops it):
  - on empty ruler: "Add a &tab stop (column N)" and "Add a &helper line (column N)" (that kind is also the next
    plain click's, and the colour chosen is kept for plain clicks);
  - on a line (its handle, or a helper line within a few pixels): "&Tab stop" and "&Helper line" checked by what it
    is (the one clicked is what it becomes, in the colour checked), and "Re&move this line";
  - then "Clear column guides", "Clear all tab stops", "Clear all helper lines", and "Cancel";
  - Settings: Default (a tab stop orange, a helper line in the guide colour; a line in its kind's default colour
    shows Default and takes the other kind's default when converted), the theme colours, "Other colour..." (its
    dialog closes the panel, which opens again with the colour picked);
  - "Column guide here (after N)" is dropped: the helper line is the per-document way, and the setting stays on the
    settings page.
- The buttons at the left of the ruler: Clear clears both kinds; Copy from / Copy to copy both kinds (tooltips
  "Copy the tab stops and helper lines from ..." / "... to ...").
- Actions (group edit, editor: true): `helperAdd` (a column, or the cursor's), `helperRemove` (a column, or the
  cursor's), `helperClear`. `tabAdd`, `tabRemove` and `tabClear` act on tab stops only; `tabAdd` on a helper line
  turns it into a tab stop.

### 3.4 Kept per file

- The host keeps the lines by file path in `State\file-rulers.json`, the same way as a language chosen for a file
  (`State\file-languages.json`, AppHost.cs).
- For the last 100 files opened: each entry has the time its file was last opened (or its lines last changed);
  opening a file with lines moves it to the front, and past 100 the oldest entry goes. Only files with lines take
  a place, so opening files without lines pushes nothing out.
- Read when the document is first shown (as its bookmarks), so they are there when the file is opened again: after
  closing its tab, and after LexPen restarts.
- Every change of the lines (add, remove, move, colour, clear, copy) sends them to the host (`rulersSet`, half a
  second later; closing the window sends what is waiting); an empty list removes the file from the store.
- A draft that was never saved is kept the same way, by its draft id, so its lines come back after a restart too.
  Saved under a name, the draft's entry goes and the name gets the lines (when it has any); closed without saving,
  the draft's entry goes. A Save as of a file moves its lines to the new name as well.
- A file renamed or moved outside LexPen loses its lines (the path no longer matches).

### 3.5 Tests

- A new in-app test t88 (t87 kept for plan 10 itself):
  - the guide colour changes with the intensity, and differs between a day and a night theme;
  - after a theme change the ruler's canvas is repainted (the guide tick's pixel colour is the new theme's);
  - the right-click choice "Add a helper line", then a click: a helper line at that column, 1px, behind the text;
  - Tab passes a helper line without stopping;
  - a tab stop added on a helper line replaces it, and the other way round;
  - the helper actions; the clear button and the copy buttons take both kinds;
  - kept: close the file's tab, open it again: the lines are back; stop and start LexPen with the same data
    folder: the lines are back; a draft's lines come back with the session.
- Settings: the slider row shows and stores the value.
- Unit tests for the host's store (load, set, remove on empty, the oldest entry dropped past 100, an open moves an
  entry to the front).
- Regression: t87, t81, t86, t85, the unit tests.

## 4. Open questions

None.

## 5. Resolved during execution

| Topic | As built |
|---|---|
| The right-click menu (your remark during the build) | First built as a choice of kind (checked) where a colour item added the line. You read "Add a tab stop" / "Add a helper line" as the items that add, with the colours below them set first, and wanted that said. Now: the Add items add at the clicked column, an italic caption line "In the colour chosen here, choose it first:" sits between them and the colours, and a colour item only chooses. One colour choice for both kinds, Default giving each kind its own default (tab stop orange, helper line the guide colour); "The guide colour" item became that Default. A caption is a disabled menu line with its own style (`mm-menu-caption`, app.css). |
| The store | `RulerStore.cs`, `Stateile-rulers.json`, keys as the bookmarks (`BookmarkStore.Key`: the path in lower case, a draft as `draft:<id>`). Order by a counter that each open or change raises, not by a time. Messages `rulersGet` (also moves the file to the front) and `rulersSet`. |
| Drafts (your remarks during the build) | Not in the session as planned but in the same store by draft id, so a never-saved draft keeps its lines after a restart. The host drops the draft's entry when the draft is deleted (`draftDelete`): on its first save (the new name then gets the lines, when there are any) and when it is closed without saving. |
| When the lines are read | When the document is first shown in an editor (with the bookmarks), not in the file's read reply: one path for files and drafts. |
| A helper line on the ruler (your remark during the build) | First built with a hollow square handle; you said a helper line needs no handle, a tab stop does. Now only its 1px line on the ruler, caught within 3 pixels either side. One in the default (guide) colour is drawn on the ruler in the dim text colour, else it could hardly be seen there. |
| The slider | A new row kind `range` in the settings window (settings.js, settings.css): `range: [0, 100, 5]`, the value with `%` next to it; every step while dragging is sent as a setting. |
| Default 40 | Checked on screenshots by day and at night (t88-day.png, t88-night2.png): the guides faint, the tab stop and a coloured helper line clear. |
| "Column guide here" | Dropped from the menu; the setting's hint no longer mentions it. |
| Tests | t88: 38 checks pass (intensity 0, 40 and 100 against the theme's colours, day vs night, the ruler canvas pixel after a theme change, the menu and its caption, helper lines (no handle on the ruler, a click beside one removes it), Tab past one, one line per column, the actions, clear and copy, kept after closing the tab, after a restart for a file and a draft, a draft saved and a draft discarded leave the list, the settings row). t87: 39 pass (the menu checks changed: a colour only chooses, then Add a tab stop). Unit tests: 195 pass (5 new for RulerStore). Also run: t81 17, t86 21, t85 46, t84 11, t61 8, t21 7, t70 6, t10 11, t71 6, t79 45, t26 13, t52 41. t82 failed 4 checks once (find history after a restart) and passed 16 of 16 on two runs after, nothing of it touched here. |
| Two intensities (your remark after the build) | First one slider that only reached the guides and helper lines in the default colour. You wanted the menu's colours mixed too (they are theme colours, not picked ones) and a slider of its own for the tab stops. Now `columnGuideIntensity` (guides and helper lines, 40) and `tabStopIntensity` (tab stops, 100); a theme colour is drawn as `color-mix` with the background in ruler.js, a picked colour as is. A helper line's default colour is now the plain border colour (`var(--border)`), mixed like the guides; one stored as `var(--col-guide)` is read as that. t88 now 46 checks (a green helper line and tab stop at 100, 40 and 30, a picked red unchanged, the handle in full colour, both slider rows); t87 39 (its colour check reads the mix). |
| The menu on a line (your remark after the build) | A right-click on a line gave the Add menu, without a check of what the line is. Now it gives that line's menu: Tab stop / Helper line checked by its kind, its colour checked, a colour recolours it (the colour for new lines stays), Remove this line. A line in its kind's default colour shows Default checked and takes the other kind's default when converted. t88 55 checks (8 for this menu). |
| A panel: actions, then Settings (your remark after the build) | A colour click closed the menu, as any menu item. You read it as a panel: actions on top that close it (Add a tab stop, Add a helper line, Remove this line on a line, Cancel), under them the settings of the line to add or of this line, with a "Settings" header. Now a colour item is a setting: menus.js got items that keep the menu open (`keep`) with check marks that follow (`checked` as a function). The clearing sits with the actions, above Cancel. A colour applies when an action is clicked; on a line that is Tab stop / Helper line (the one checked keeps its kind). t88 57 checks (Cancel drops a colour, a colour click keeps the panel open), t87 40. |
| The copy buttons (your remark after the build) | The small icons did not say which way the lines go. The list of documents now starts with a heading, "Use rulers from:" or "Copy these rulers to:" (a caption line, as in the panel), and the buttons' tooltips say the same. t88 58 checks. |
| Defaults 20 and 50, the hints (your remark after the build) | First 40 and 100; you set 20 for the guides and helper lines and 50 for the tab stops. The tab stops' hint began "The same for...", which says nothing when a search finds only that row: each hint now stands alone ("Intensity of the ... lines shown in the editor: higher means brighter, lower fades them into the background ..."), as every setting's hint should (only a dependency may name another setting). |
| The guides on their own (your remark after the build) | The guides only borrowed the border colour and shared a slider with the helper lines, so the slider could only fade an already faint line. Now the guides have their own colour, `columnGuideColour` (a theme colour: border, the default, or orange, the find box, blue, green, purple, red, brown) and their own slider, `columnGuideIntensity` (default 40); the helper lines have `helperLineIntensity` (default 20), the tab stops `tabStopIntensity` (default 50). A helper line's Default is the border colour at its own intensity. Each hint stands alone. t88 63 checks (the three defaults, a guide in green at 70, each slider leaves the other lines alone, the ruler's ticks in the guide colour). This supersedes the two-slider rows above. |
| Not tested | The sliders themselves in the settings window (a separate window the test does not drive); only its row definition is checked. |
