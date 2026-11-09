# Plan: Pinned tabs as they are, in one tab, or on a row of their own

Status: draft 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Pinned tabs stand first in a pane's tab bar, among the other tabs (each with a pin). With many documents kept pinned
for reference they take most of the bar: the tabs worked in go out of view (scroll, the menu of tabs out of view) or
onto more rows, and the pinned ones are in the way of the tabs that change.

## 2. The solution, in brief

A setting chooses how a pane's pinned tabs are shown: as now (Regular); together in one tab "Pinned", whose click
opens a list of them to choose from (Grouped); or on a row of their own above the other tabs, wrapping onto more rows
when they do not fit, the other tabs on the row(s) below as the tab bar setting says (Own row). Pinning, closing and
moving pinned tabs work as now; only where they are shown changes.

## 3. Details

### 3.1 The setting

- `pinnedTabs` (Settings, Tabs): "regular" (as now, the default), "grouped" (one tab), "row" (a row of their own).
  One for all panes and windows, as the tab bar setting is. Also in the tab bar's own menu and a pinned tab's
  right-click ("Pinned tabs: Regular / Grouped / Own row").

### 3.2 Grouped

- **One tab first in the bar**: "Pinned" with the number of pinned tabs and a drop-down arrow ("Pinned (4)"). Without
  pinned tabs it is not there.
- **A click on it**: the list of the pinned tabs under it, each with its name (and the dot of unsaved changes, the
  read-only mark, as on a tab), the active one checked; a choice shows that document. Esc or a click elsewhere closes
  the list.
- **A pinned document shown**: the group tab is the active tab, with that document's name after "Pinned:" ("Pinned:
  reference.md") so it is seen which one it is; its tooltip the path, as a tab's.
- **The rest of a tab's ways**: the list's right-click on an entry: the tab menu of that tab (Unpin, Close, Read-only,
  ...). Ctrl+Tab and the tab order go through the pinned ones as now (they are still tabs, only shown in the group).
  Dragging to pin or unpin: open question 1.

### 3.3 Own row

- **The pinned tabs on the first row(s)** of the tab bar, all of them (as "Several rows" does), the others on the row(s)
  below in the tab bar setting's way (one row that scrolls, one row and a menu, several rows). A thin line between
  the two parts.
- **No pinned tabs**: no row for them; the bar as now.
- **The bar's height** grows by the pinned row(s); the editor below it gets the rest.

### 3.4 Kept

- The setting in settings.json; a tab's pinned state as now (the session).

### 3.5 Tests

- In the test copy, per setting: four pinned and six other tabs in a narrow pane. Regular: as now. Grouped: one tab
  "Pinned (4)", its list, a choice shows that document and the tab reads "Pinned: name", unsaved changes and
  read-only marked in the list, a right-click on an entry the tab menu, Ctrl+Tab through all ten, no pinned tabs no
  group tab. Own row: the pinned ones on the first row (two rows when they do not fit), the others below with each
  tab bar setting, the line between them; switching the setting while tabs are open.

### 3.6 Alternatives

- **Pinned tabs smaller** (only an icon, as browsers do): LexPen's documents have no icon of their own to tell them
  apart; the name is needed.
- **A pinned pane** (the pinned documents in the second pane): the second pane is for working side by side.

## 4. Open questions

1. **Pinning and unpinning by dragging in Grouped**: a tab dragged onto the group tab pinned, and an entry dragged out
   of the list onto the bar unpinned? Suggestion: yes for dragging onto the group tab (pins it); unpinning by the
   list's right-click (Unpin), not by dragging out of a list.
2. **Per pane or for all**: one setting for every pane and window (suggestion, as the tab bar setting), or per pane?
