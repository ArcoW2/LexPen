# Plan: A menu structure that follows the features

Status: proposal, not built; open questions in section 4. Asked for on 2026-10-31, after plan 24 (docking) was complete:
"due to adding features, a bit disorienting. Make a good menu structure ... first the structure of the features, pure
logically (by feature and/or by visibility and/or by UX flow), then the proposed menu. Later on we will have a bar with
all actions (with icons) too ... In that document you can make a proposal for such a bar. Every action that is needed
most often should be easy to find."

## 1. What this is about

The menus grew one feature at a time, each placed where it fitted at that moment. The result mixes kinds of things in
one menu, so an item is hard to find by reasoning about what it does:

- Edit holds editing (undo, clipboard, lines), but also navigation (bookmarks, sections, blocks, go to line), searching
  (find, replace, search in files, occurrences) and annotation (highlights).
- View holds how the document looks, but also navigation (position back / forward, back in the window), the compare,
  the macros, the language of the file and the messages.
- Some features live in two places at once without a clear reason (the clipboards in Edit and in the bottom bar; the
  compare in File and in View), and some frequent actions sit three levels deep while rare ones are on the first level.

The number of actions keeps growing (docking, macros, the coming action bar), so the menus need a structure that new
features can follow without thought.

## 2. The solution, in brief

Group the features by what they act on and when you use them, and give each group one home menu: the file and its
lifecycle (File), changing the text (Edit), choosing the text to act on (Select), finding things in it (Find), moving through it (Go), its formatting
(Format), how it is shown (View), where things are in the window (Window), the bigger tools (Tools), and LexPen itself with its help (Options).
Each menu shows at most about fifteen first-level entries, in small groups ordered by how often they are used, with
the larger families (bookmarks, macros, compare, panels, the clipboards) as submenus. The action names, keys and F1
stay as they are (the bookmarks get UltraEdit's F2 keys besides): only the menus move. The coming action bar is a separate, flat, icon-first view of the same actions,
ordered by frequency and work flow rather than by menu.

## 3. Details

### 3.1 The menus now

Measured on 2026-10-31 from the Debug build (the page's `MENUS` and `appActions`, dumped through the test bridge; the
Format menu as it is for a markdown file, it changes with the language). First-level entries, separators and headers
not counted:

| Menu | Entries | What is in it |
|---|---|---|
| File | 17 | new, open, favourites, recent lists, compare files / folders, save, revert, close, reopen, close window |
| Edit | 24 | undo, clipboard (with Select clipboard and Manage clipboards), column mode, find, replace, search in files, go to line, complete word, brackets, multiple cursors, line commands, occurrences, sections, blocks, Bookmarks >, Highlights > |
| Format | 18 | per language: comments, bold / italic / ..., headings, lists, links, images, tables, code, rule, reformat |
| Convert | 12 | case, tabs / spaces, whitespace at line ends, line ends |
| View | 28 | panels, document panels, preview place, macros, ruler, formatting bar, wrap, tab bar, gutter, occurrences, scroll bar marks, pane orientation, scroll together, layout, zoom, locate the cursor, messages, pane visibility, level, split, position back / forward, back / forward in the window, language, compare, compare options, day / night |
| Projects | 5 + the projects | Manage projects, the projects with their windows, new, rename, move this window |
| Options | 4 | settings, theme set, keyboard shortcuts, about |

The action registry (F1) holds 238 entries in the same dump, including the on / off variants of the toggles. By the
groups the actions carry: view 89, edit 56, settings 22, files 19, macros 19, tabs 12, highlights 9, bookmarks 8,
clipboard 3, format 1. Those groups are as mixed as the menus (the compare and the zoom are "view", Insert character
and the occurrences are "edit"); section 3.6 aligns them too.

### 3.2 The features, by what they act on

Pure logic first, without menus. Each feature belongs to one subject; the subject is what the user thinks of when
looking for it.

| Subject | Features (actions) |
|---|---|
| A. The file | new, open, open folder, save, save as, revert, rename, close tab, close all, reopen closed, recent files / folders / closed, favourites, file types |
| B1. The text: changing it | undo / redo; cut / copy / paste, paste image; the clipboards (select, manage); insert character, complete word; insert / overwrite; line commands (duplicate, move, delete, join, indent, outdent) |
| B2. The text: selecting it (not editing: a selection changes nothing) | select all, select line, select inside brackets; column (block) mode, select a block; multiple cursors |
| B3. Helpers for editing (they change no text, they make editing easier) | tab stops (add, remove, clear), helper lines (add, remove, clear) |
| C. The text: finding in it | find, find next / previous, replace, replace all; search in files, replace in files; the occurrences (show all, field, clear, bar) |
| D. The text: moving through it | go to line; brackets (go to opening / closing, select inside); next / previous section and block; bookmarks (store, toggle, unnumbered, go to, next / previous, clear, list, manage); position back / forward; locate the cursor |
| E. The text: marking it for review | highlights (highlight, from selection, note, remove, remove all, keep adjusted, next / previous, window, move all) |
| F. The text: its form | the language's formatting (format bar items, reformat); convert (case, whitespace, tabs / spaces, line ends); the file's language |
| G. The document: how it shows | editor / preview / side by side, preview place; wrap; ruler; formatting bar; gutter columns and line numbers; scroll bar marks |
| H. The window: what is where | the panels (Folder, Search, Outline, Characters, Highlights, Bookmarks, Step by step, Messages, Clipboards, Macros, Settings, Manage projects, Theme sets) and the dock areas; the two editor panes (orientation, hide, close, show, split into the other, level, scroll together); the tabs (next / previous document and tab, back / forward in the window, pin, read-only, tab bar); the layout (save as default, reset, use layout of); messages |
| I. Projects and windows | manage projects, new, rename, move this window, the list of projects with their windows, close window |
| J. Comparing | compare files, compare folders; next / previous difference, align the cursor lines, swap, leave; ignore whitespace / case, line strip |
| K. Automation | macros: record / stop, play, play X times, play to the end, a macro's window, manage, step by step (step, step into, continue, stop, breakpoint), the macro language |
| L. LexPen itself | settings, theme sets, day / night, zoom (they act on the app on this screen, not on one document), keyboard shortcuts and commands (F1), about |

Three other views on the same features, used to order things inside a menu:

- **By visibility.** Always reachable: the menu bar and F1. Where you are: the right-click menus (the editor's text,
  a tab, the splitter between text and preview, the gutter, a dock tab, the bottom bar's items). Only in a state: the
  compare's actions while comparing, step by step while a macro runs, the formatting of the file's language. A
  feature that only works in a state should be in its state's place first (the compare bar, the Step by step pane,
  the format bar) and in the menu second, never only in the menu.
- **By work flow.** Open -> read / navigate -> find -> change -> format -> review (compare, highlights) -> save. The
  menu bar follows this order from left to right (File, Edit, Select, Find, Go, Format, View, Window, Tools, Options); within a
  menu the most used group comes first.
- **By frequency.** Several times a minute: undo, clipboard, find next, save, go to bookmark, switch document. Several
  times an hour: find / replace, search in files, go to line, preview, bookmarks, a panel. Now and then: compare,
  macros, layout, settings. There is no usage data: the frequencies are an estimate ([not yet calculated]: a local,
  opt-in count of action use per session would turn this into data; not part of this plan).

### 3.3 Rules for the menus

- At most ten menus on the bar; each with at most about fifteen first-level entries, in groups of two to five
  divided by separators; the most used group at the top.
- A family of more than three related actions is a submenu (Bookmarks, Highlights, Clipboards, Macros, Compare,
  Panels, Line commands); a submenu is never more than one level below the menu, except for lists (projects, recent
  files, the numbered bookmarks).
- One home per feature. A second place only where the work flow needs it (next / previous highlight in Go, beside
  their home in Edit > Highlights), and then exactly the same items.
- Toggles show their check; lists (recent, projects, clipboards, bookmarks) show their state (the active one marked).
- The item text says what happens, with "..." when a window or a question follows; the key shows at the right, as now.
- Everything stays in F1, also what has no menu item.

### 3.4 The proposed menus

`>` is a submenu, `|` a separator, `[ ]` a check or a state. The keys are those of today.

**File** (the file and its lifecycle)

- New file, Open file..., Open folder...
- | Recents & Favourites > (Recent files, Recent folders, Recently closed, | Favourite files, Favourite folders)
- | Save, Save as..., Revert to saved, Rename...
- | Close tab (Ctrl+W), Close all tabs, Reopen closed tab
- | Close window (Alt+F4)

The submenu holds both, so its name says both (in menus.js the `&` is written `&&`, a single one marks the access key). Ctrl+F4 is Close tab's second key; Alt+F4 is Close window (The Windows default), Close tab keeps Ctrl+W.

**Edit** (changing the text)

- Undo, Redo
- | Cut, Copy, Paste, Paste image...
- | Clipboards > (Windows clipboard, Clipboard 1 ... 9 [active], | Manage clipboards...)
- | Insert > (Character... (opens Characters as it was last), Emoticon..., | Link..., Image...), Complete word, Insert / overwrite [ ]
- | Lines > (Duplicate, Move up, Move down, Delete, Join, | Indent, Outdent)
- | Helpers > (Add tab stop, Remove tab stop, Clear tab stops, | Add helper line, Remove helper line, Clear helper lines)
- | Highlights > (Highlight, Selection to highlight, Highlight note..., Remove highlight, Remove all in this file, Keep the adjusted highlight, | Manage highlights...)

Insert > gathers what puts something into the text at the cursor. Link and Image run the file's language's own
link and image items (markdown, HTML, ...); for a language without them they are greyed out. Their home is Insert;
the format bar keeps its buttons for them.

Highlights stay in Edit because making one changes what is stored with the text (its note, its place); moving
between them is in Go. This is the one split by work flow (see question 4.2).

**Select** (choosing the text to act on; a selection changes nothing, so it is not Edit)

- Select all, Select line, Select inside brackets
- | Column mode [ ], Select a block
- | Multiple cursors > (Add occurrence, Next occurrence, Previous occurrence, Remove occurrence, Clear added cursors)

Select all is the editor's own Ctrl+A today; whether it has an action of its own for the menu and F1 is [not yet checked].

**Find** (finding in the text)

- Find, Find next, Find previous
- | Occurrences > (Show all occurrences, Occurrences field, Clear occurrences, The Occurrences bar [ ])
- | Replace, Replace all
- | Search in files, Replace in files

The occurrences come right after Find: they are the closest to it and used as often.

**Go** (moving through the text and the documents)

- Go to line..., Locate the cursor
- | Bookmarks > (Go to bookmark > 1 ... 9, Store bookmark > 1 ... 9, Toggle bookmark, Toggle unnumbered bookmark (Ctrl+F2), Next bookmark (F2), Previous bookmark (Shift+F2), Clear bookmark, Bookmarks of this file..., | Manage bookmarks...)
- | Next highlight, Previous highlight
- | Next section, Previous section, Next block, Previous block
- | Opening bracket, Closing bracket
- | Position back, Position forward
- | Next document, Previous document, Back in the window, Forward in the window

Go is the longest menu; its pairs (next / previous) sit side by side, so it reads as a few short groups. If it still
feels long, Section / block and Brackets become one submenu "In the text >".

New keys for the bookmarks, as UltraEdit has them: Ctrl+F2 toggles an unnumbered bookmark, F2 goes to the next
bookmark, Shift+F2 to the previous one. Next and previous stop at every bookmark, numbered or not (as
`bookmarkNext` does now). The Ctrl+K keys stay. F2 is free in the editor and the preview: today it is Rename only in
the Folder pane, the Manage projects window and the Theme sets window, which keep it while they have the focus.
Shift+F2 being Previous bookmark, the rule "Shift added to a move selects" (keys.json) does not give "select to the
next bookmark" on Shift+F2; selecting to a bookmark stays on the Ctrl+K keys with Shift.

**Format** (the text's form; per language, as now, plus)

- (the language's own formatting items, as now)
- | Convert > (UPPER CASE, lower case, Smart capitalize, | snake_case, camelCase, PascalCase, kebab-case, CONSTANT_CASE, | Tabs to spaces, Spaces to tabs, Remove whitespace at line ends, | Line ends >)
- | Language... (the file's language), Reformat

Convert stops being a menu of its own (one fewer on the bar); its key menu at the cursor (Ctrl+Alt+C) stays.

**View** (how the document shows)

- Editor [ ], Preview [ ], Side by side [ ]
- | Preview place > (At the right, At the left, Above, Below)
- | Wrap long lines [ ], Ruler [ ], Formatting bar [ ]
- | Gutter > (as now), Scroll bar marks > (as now), Tab bar > (as now)

**Window** (what is where in the window)

- Panels > (as built in plan 24: every panel with its check, the dock areas, Reset docking)
- | Panes > (Side by side, Above each other, | Hide this pane, Hide other pane, Close this pane, Close other pane, Show hidden pane, | Split into the other pane, Level the panes, Scroll both panes together [ ])
- | Layout > (Save as default, Reset to default, Use layout of >)
- | Messages...
- | Manage projects..., New project..., Rename this project..., Move this window to >
- | (each project with its windows, this one marked, as today's Projects menu)
- | Close window

This replaces today's Projects menu: a project is a set of windows, so it belongs with the windows (see question 4.3).

**Tools** (the larger tools)

- Macros > (Record / stop recording, Play, Play X times..., Play to the end of the file, | Step by step, | the stored macros, | Manage macros...)
- | Compare > (Compare files..., Compare folders..., | Next difference, Previous difference, Align the cursor lines, Swap the files, Leave the compare, | Ignore whitespace [ ], Ignore case [ ], Line strip [ ])
**Options** (LexPen itself, and its help)

- Settings..., Theme set >, File types...
- | Day / night [ ], Zoom > (as now)
- | Keyboard shortcuts and commands (F1), The macro language
- | About LexPen

Day / night and the zoom act on LexPen on this screen, not on the document, so they sit with the settings, not in
View. Help needs no menu of its own: its few items join Options, as today's Keyboard shortcuts and About do.

What moves, against today:

| Item | Today | Proposed |
|---|---|---|
| Bookmarks > | Edit | Go |
| Find, Replace, Search in files, Occurrences | Edit | Find |
| Go to line, sections, blocks, brackets | Edit | Go |
| Position back / forward, Back / forward in the window | View | Go |
| Macros > | View | Tools |
| Compare files / folders, Compare >, Compare options > | File, View | Tools > Compare |
| Convert | own menu | Format > Convert |
| Language... | View | Format |
| Pane orientation, Pane visibility, Level, Split, Scroll together | View | Window > Panes |
| Layout >, Messages..., Panels > | View | Window |
| Projects menu | own menu | Window |
| Settings, Theme set | Options | Options (stay) |
| Keyboard shortcuts, About | Options | Options (stay); The macro language joins them |
| Insert character | (removed in plan 24) | Edit > Insert > Character... (opens Characters as it was last) |
| Links, images | Format (per language) | Edit > Insert (the format bar keeps its buttons) |
| Emoticon | none | Edit > Insert > Emoticon... |
| Locate the cursor | View | Go |
| Zoom >, Day / night | View | Options |
| Tab stops, helper lines | no menu (the ruler, F1) | Edit > Helpers |
| Recent > | File | File > Recents & Favourites |
| Column mode, Select inside brackets, Multiple cursors > | Edit | Select (a menu of its own) |
| Toggle unnumbered bookmark, Next / Previous bookmark | Ctrl+K, K / N / P | also Ctrl+F2, F2, Shift+F2 |

The bar then has the ten menus File, Edit, Select, Find, Go, Format, View, Window, Tools and Options, against the seven of
3.1; each is smaller and has one subject. Fewer menus are possible by merging Find and Go into one "Search" menu
(question 4.1).

### 3.5 The right-click menus

They stay where you are and hold only what applies there. They follow the rules of 3.3 too: a family of more than
three items is a submenu, and an item that is not used is not shown.

The right-click in a document's editor and preview is WebView2's own menu (Cut, Copy, Paste, Select all, ... and its
More tools > Voice typing), with LexPen's items added by the host (MainForm.cs, `AddDocumentItems`): four highlight
items on the first level, and Show all occurrences of this selection on a selection. It grows with every feature that
adds an item there. Proposed:

- The four highlight items become one submenu: Highlight > (Highlight, Selection to highlight, Highlight note...,
  Remove highlight). WebView2 has submenu items for this.
- Voice typing: a setting (General, Voice typing, off by default). Off: the host removes WebView2's Voice typing item,
  and with it More tools, which holds nothing else. On: it stays as WebView2 gives it. The item's name in WebView2's
  menu is [not yet checked]; the host removes it by that name, as it removes Print now.
- Show all occurrences of this selection stays on the first level (one item, only with a selection).

The others:

- A tab: as now.
- The splitter between text and preview: the preview's place (plan 24).
- The gutter: Gutter > as in View.
- A dock tab: dock, float, close (plan 24).

### 3.6 The F1 groups

F1 shows each action with its group. The groups follow the menus of 3.4, so F1 and the menus tell the same story:
file, edit, select, find, go, format, view, window, tools, options (and settings for the setting toggles). This changes only the
`group` of the actions (actions.js and the other registrations); names, keys and keys.json stay.

### 3.7 A bar with all actions (proposal)

A row of icon buttons under the menu bar, for the actions used most, ordered by frequency and work flow rather than
by menu. It is a second view on the same actions (each button runs an action, its tooltip shows the title and the
key, as the menus do); it can be shown or hidden (View, and its own right-click).

Proposed default content, left to right, in groups:

| Group | Buttons |
|---|---|
| File | New, Open, Save |
| History | Undo, Redo |
| Clipboard | Cut, Copy, Paste, the active clipboard (a number badge; a click opens Clipboards) |
| Find | Find, Replace, Search in files |
| Go | Back, Forward (position), Go to line, Toggle bookmark, Next bookmark |
| Document | Editor / Side by side / Preview (one three-way button), Wrap |
| Panels | Folder, Search, Outline, Characters, Highlights, Bookmarks (each a toggle with its check state) |
| Tools | Record macro, Play macro, Compare |
| Right end | Day / night, Zoom, the settings |

- **Configurable** as keys.json is: a `bar.json` in the data folder lists the buttons by action name (with a value,
  like keys.json's `["preview.left"]`), with separators; the shipped one as above. A right-click on the bar: Customize
  (a list of all actions with a search, as F1, to add, remove and reorder), Reset, Hide.
- **Icons**: one set, drawn as inline SVG in the app's own style (stroke icons, `currentColor`, so every theme
  colours them); an action without an icon shows its short title.
- **Overflow**: buttons that do not fit go into a ">>" menu at the right end, in their order.
- **State**: a toggle shows pressed when on (Wrap, Column mode, the panels); a button whose action is not available
  now is greyed out (the action's `enabled`).
- **The format bar stays** as the language's own bar above the text: the action bar is the window's, the format bar
  the document's.
- **What it replaces**: the top bar's buttons that are actions now (Editor / Preview, Day / night, the zoom) move into
  it, so there is one bar of buttons, not two (question 4.5).

### 3.8 How it would be built

- The menus: only `MENUS` in menus.js changes (and the Projects menu's items move into Window); every item still runs
  the same action. Edit > Insert > holds Insert character again, Emoticon (new) and the language's link and image.
- The right-click: MainForm.cs `AddDocumentItems` puts the highlight items in a submenu and, with the setting Voice
  typing off, removes WebView2's Voice typing item and the empty More tools.
- The F1 groups: the `group` of each registration.
- The action bar: a plan of its own (bar.json, the icons, Customize); this document only proposes its content.
- Tests: the in-app tests that look up a menu by its title (the Edit menu's bookmark items, View > Panels) follow the
  new places; a new test walks every menu and checks that each item's action exists, that no first-level menu has more
  than the rule of 3.3 allows, and that no action has two different homes except the ones named in 3.3.
- Effort: [not yet calculated].

## 4. Open questions

1. Find and Go as two menus (as proposed: ten menus, each small), or one Search menu (nine menus, that one larger)?
2. Highlights: making them in Edit and moving between them in Go (as proposed), or all of them in one place (a Review
   menu, or Go)?
3. Projects: inside Window (as proposed), or keep their own menu?
4. Convert inside Format (as proposed), or keep its own menu?
5. The action bar: replace the top bar's buttons (Editor / Preview, Day / night, zoom) as proposed, or a second row
   under them?
6. The action bar's default buttons in 3.7: anything to add or drop before it gets its own plan?
7. Emoticon...: open Windows' own emoji panel (as Win+. does; it types into the editor), or the Characters panel on
   an emoticon group of its own (LexPen's look, searchable, with recent ones)?

## 5. Resolved during execution

| Topic | As built |
|---|---|
