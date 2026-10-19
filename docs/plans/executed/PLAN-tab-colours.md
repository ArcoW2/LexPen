# Plan: tab colours

Status: built on branch `feature/next-features`. Section 7 records what was decided or found during the build.

## 1. What this is about

Tabs all look the same. Wanted: a list of rules, each a pattern and a style for the day theme and one
for the night theme (background, text colour, bold / italic / underline, font size). A tab takes the
style of the first rule that matches it. Markdown files get a dark gray tab by default.

## 2. The solution, in brief

The rules live in one file in LexPen's data folder, `tab-colours.json`: a list of rules, each with a
`match` (wildcard patterns separated by `;`, such as `*.sp;*.tr;*.sql`) and / or a `regex`, and a `light`
and a `dark` style (colours, bold / italic / underline, a font size a little larger or smaller). The
first rule that matches the tab's file styles it, with the style of the current theme, and its active style while it is the active tab (including the colour of the line on top). When the file
does not exist, LexPen writes it with two rules (markdown dark gray, and `*` with today's colours for all
other tabs), so it is there to edit. No
settings page: the file is edited by hand (in LexPen or any editor) and read again when it changes.

## 3. The file

```jsonc
// Tab colours: the first rule that fits the tab's file styles the tab.
// match: wildcard patterns separated by ";", not case sensitive, each fitting the whole name or path.
//   A pattern without "\" is matched against the file name only (*.md), one with "\" against the
//   full path. * any text and ? one character, not crossing "\"; ** any depth of folders
//   (D:\Projects\Bank_Connect\**).
// regex: a regular expression on the full path. A rule may have both: it applies when either fits.
// light / dark: the style for the day / night theme; either may be left out. "active" in it is the
//   style of the tab while it is the active one (what it leaves out comes from the normal style);
//   "line" is the colour of the bar on top of the active tab.
// The last rule, "*", fits every file: it gives all other tabs their colours (today's colours,
//   measured in the app; the active tab bold).
[
  { "match": "*.md;*.markdown",
    "light": { "background": "#5a5f66", "color": "#ffffff",
               "active": { "background": "#3d4248", "bold": true, "line": "#0969da" } },
    "dark":  { "background": "#3a3d44", "color": "#e6e6e6",
               "active": { "background": "#4a4f57", "color": "#ffffff", "bold": true, "line": "#58a6ff" } } },

  // Examples, not active until the // are removed:
  // { "match": "*.sp;*.tr;*.sql", "light": { "background": "#e8f3ff" }, "dark": { "background": "#1f3047" } },
  // Every file inside a folder named *.sp, at any depth (any extension), and .sp files themselves:
  // { "match": "*.sp;**\\*.sp\\**", "light": { "color": "#8250df" }, "dark": { "color": "#d2a8ff" } },
  // { "match": "*.json", "regex": "[\\/]settings[\\/]", "light": { "italic": true, "size": "-1" }, "dark": { "italic": true, "size": "-1" } },
  // { "regex": "[\\/]docs[\\/]plans[\\/]", "light": { "bold": true, "size": "+2" }, "dark": { "bold": true, "size": "+2" } },

  // All other tabs: the colours LexPen uses today, the active tab bold. Change them here.
  { "match": "*",
    "light": { "background": "#f6f7f9", "color": "#656d76",
               "active": { "background": "#ffffff", "color": "#1f2328", "bold": true, "line": "#0969da" } },
    "dark":  { "background": "#25262a", "color": "#8b929c",
               "active": { "background": "#1e1f22", "color": "#d7dae0", "bold": true, "line": "#58a6ff" } } }
]
```

| Key | Meaning |
|---|---|
| `match` | Wildcard patterns separated by `;`; not case sensitive. A pattern must fit the whole name or path, not a part of it. Without `\`: against the file name only, so `*.sp` fits `x.sp` but not `d:\test.sp\file.txt` (its name is `file.txt`). With `\`: against the full path. `*` is any text and `?` one character, neither crossing a `\`; `**` is any text including `\`, for any depth of folders: `D:\Projects\Bank_Connect\**` |
| `regex` | A regular expression (JavaScript, not case sensitive) against the full path. With `match` as well, the rule applies when either fits; a rule needs at least one of the two |
| `light`, `dark` | The style per theme: `background`, `color` (`#rrggbb` or any CSS colour), `bold`, `italic`, `underline` (`true` / `false`), `size` (`"+2"`, `"-1"`: pixels larger or smaller than the normal tab text, from -3 to +3). Each part may be left out; a theme left out means no style in that theme |
| `active` (in `light` / `dark`) | The style of the tab while it is the active tab of its pane: the same keys. Keys it leaves out come from the normal style, so `"active": { "background": "#4a4f57" }` only changes the background |
| `line` (in `active`) | The colour of the bar on top of the active tab (now blue in both themes) |

In a regular expression, `[\\/]` stands for one path separator (written in JSON as `"[\\/]"`), which
avoids the doubled and quadrupled backslashes. A draft has no file; the name on its tab (`edit1`, `edit2`, ...) is used
for both the name and the path. `//` comments and trailing commas are allowed.

## 4. Behaviour

- The first matching rule wins; later rules are not looked at. No match at all (the `*` rule removed):
  the tab looks as it does now.
- Switching day / night switches to the other style of the same rule. Making a tab active switches to
  its `active` style; the tab it replaces goes back to its normal style.
- The default file has two rules: `*.md;*.markdown` dark gray (day: `#5a5f66` with white text, active
  `#3d4248`; night: `#3a3d44` with light text, active `#4a4f57`), and `*` with today's colours for all
  other tabs, active and inactive, including the line on the active tab. In both rules the active tab is
  bold. Today's colours were measured in the running app (rendered colours, both themes): inactive
  `#f6f7f9` / `#656d76` (day) and `#25262a` / `#8b929c` (night); active `#ffffff` / `#1f2328` and
  `#1e1f22` / `#d7dae0`; line `#0969da` and `#58a6ff`. The file is written the first
  time LexPen starts without one; after that the file is yours and LexPen does not change it.
- `size` changes the text only: every tab keeps the same height, so the tab strip stays even (also with
  tabs on several rows); a larger text makes the tab wider, not taller. Values outside -3 to +3 are kept
  at the limit.
- The active tab keeps its close button; the unsaved and read-only marks stay as they are. Its top line
  takes `line` (the rule's, else the `*` rule's, else today's blue).
- The tab's tooltip names the rule that applied ("Tab colour: *.md;*.markdown").
- A broken file or an invalid pattern: the rules that can be read are used, and a toast names the
  problem when the file is read.
- One file per user, shared by all windows. A change to the file (saved in LexPen or elsewhere) is picked
  up by all windows: the host watches the file.

## 5. How it is built

- Host: reads `tab-colours.json` from the data folder (writes the default when it is missing), sends it
  with the startup data, watches the file and sends it again to every window when it changes.
- Page: the rules are turned into tests once per change (wildcards into regular expressions);
  `tabElement` applies the first match's style for the current theme as inline style; a theme switch
  redraws the tabs.
- Startup: one small file read, part of the data LexPen already gets at start, so no extra wait (checked
  as before).

## 6. Tests

- Default file written when missing, not touched when present.
- Wildcards: `*.md`, several patterns with `;`, `?`, case differences; `*.sp` does not fit
  `d:\test.sp\file.txt`; `*.md` does not fit `notes.md.bak` (whole name); a path pattern with `*` stays
  in one folder, with `**` any depth; `**\*.sp\**` fits `d:\test.sp\file.txt` and
  `d:\work\test.sp\sub\notes.md`, not `d:\test.sp` nor `d:\test.spx\file.txt`; `regex`; a rule with
  both `match` and `regex` (either fits).
- First match wins; no match leaves the tab as it was; the light / dark style follows the theme switch;
  a rule with only one theme.
- The default file: its `*` rule gives exactly today's rendered colours in both themes (measured, as
  when the plan was written), plus the bold active tab; a bold active tab keeps the strip's height.
- Active and inactive: a rule with an `active` part, one without (the active tab keeps the rule's normal
  colours), an `active` with only a background (the rest from the normal style), `line` on the active
  tab; the `*` rule styles every other tab; with the `*` rule removed, unmatched tabs look as today.
- Background only, colour only, bold / italic / underline each and together; `size` +3 and -3 (tab
  height unchanged, also with tabs on several rows), +5 kept at +3.
- Draft tabs; paths with spaces.
- Broken JSON and an invalid regex: the other rules still apply, toast.
- File changed outside LexPen: the tabs of every window change.
- Active, unsaved and read-only tabs keep their marks. Screenshots light and dark.
- Startup in Read mode: no measurable difference (measured before / after).

## 7. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | Your colours | Markdown yellow, Delphi (`*.pas;*.dfm`) blue, C# (`*.cs;*.csx`) green, YAML red, JSON (`*.json;*.jsonc`) purple: pale tints with dark text in the day theme, deep tints with light text at night; the active tab a stronger shade, bold, with a top line in the same colour. They replace the dark gray markdown default of the plan; the `*` rule keeps today's colours (measured) |
| 2 | A draft's name | Drafts are named `edit1`, `edit2`, ... on their tabs (not "Draft 3"); that name is what a rule matches |
| 3 | Found while testing: a file saved half-way through an edit (broken JSON) dropped all colours | The last rules that could be read stay until the file is fixed; a toast names the problem |
| 4 | Found while testing: an invalid regex was reported twice | One message per rule |
| 5 | Styling without breaking hover, drag marks and the draft / read-only italics | The rule's values are CSS variables on the tab (`--tab-bg`, `--tab-fg`, `--tab-line`, ...); hover is an overlay on the tab's own colour; the tab name has a fixed line height, so a font size of +3 / -3 keeps the strip's height |
| 6 | Verified in the running app | Default file written (and kept when present, also after a restart); all wildcard cases of section 6; comments and trailing commas; every file type inactive and active in both themes (rendered colours compared), other files today's colours with a bold active tab and the line; tooltip; all tabs the same height; a saved change applies within a second in the open window (size +3 at the same height); broken file and invalid regex; a draft by its tab name; screenshots light and dark. Unit tests: 36 passed (3 new for the file). Start-up, 5 launches each with a fresh data folder: 917-1068 ms before, 958-1080 ms after (warm runs) |
| 7 | Added afterwards: an example in the project | `docs/examples/tab-colours.json` with a README on where it goes (`%LOCALAPPDATA%\LexPen\`). The build embeds that file and LexPen writes it on first start, so there is one source: a fresh start wrote a byte-for-byte copy of it |
