# Plan: Pinned tabs as they are, in one tab, or on a row of their own

Status: draft 2026-11-09, revised 2026-11-09; not started. The number in the file name is the priority; rename to reorder.

## 1. What this is about

Pinned tabs stand first in a pane's tab bar, among the other tabs (each with a pin). With many documents kept pinned
for reference they take most of the bar: the tabs worked in go out of view (scroll, the menu of tabs out of view) or
onto more rows, and the pinned ones are in the way of the tabs that change.

## 2. The solution, in brief

A setting chooses how a pane's pinned tabs are shown: as now (Regular); together in one tab "Pinned (3)", always
there, whose click opens a list of them in their tab colours to choose from, the tab itself reading and coloured as
the pinned document shown ("Pinned (3)-AlleProcedures.sql"), a tab dragged onto it pinned and one dragged out of the
list unpinned (Grouped); or on a row of their own above the other tabs, wrapping onto more rows when they do not fit, the other tabs on the row(s) below as the tab bar setting says (Own row). Pinning, closing and
moving pinned tabs work as now; only where they are shown changes.

## 3. Details

### 3.1 The setting

- `pinnedTabs` (Settings, Tabs): "regular" (as now, the default), "grouped" (one tab), "row" (a row of their own).
  One for all panes, windows and projects, as the tab bar setting is (an app setting, not a project's). Also in the
  tab bar's own menu and a pinned tab's right-click ("Pinned tabs: Regular / Grouped / Own row").

### 3.2 Grouped

- **One tab first in the bar, always there**: "Pinned" with the number of pinned tabs and a drop-down arrow ("Pinned
  (4)"). Without pinned tabs it reads "Pinned (0)", dimmed, and a click does nothing; it stays as the place to drop
  a tab on to pin it.
- **A click on it**: the list of the pinned tabs under it, each with its name (and the dot of unsaved changes, the
  read-only mark, as on a tab) in its own tab colours (the rules of tab-colours.json, applyTabStyle), the one shown
  marked as the active tab is (its active style); a choice shows that document. Esc or a click elsewhere closes the
  list.
- **A pinned document shown**: the group tab is the active tab, reading the number and that document's name
  ("Pinned (3)-AlleProcedures.sql"), in that document's tab colours as its own tab would have them while active; its
  tooltip the path, as a tab's. Another document shown: "Pinned (3)" in the plain tab look.
- **The rest of a tab's ways**: the list's right-click on an entry: the tab menu of that tab (Unpin, Close, Read-only,
  ...). Ctrl+Tab and the tab order go through the pinned ones as now (they are still tabs, only shown in the group).
- **Dragging**: a tab dragged onto the group tab is pinned (it goes into the group); an entry dragged out of the
  list onto the tab bar is unpinned and stands there as a regular tab, where it is dropped.

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
  read-only marked in the list, a right-click on an entry the tab menu, Ctrl+Tab through all ten, the group tab and its
  entries in their rule colours (a rule for .sql), the tab reading "Pinned (4)-name" in the shown one's colours, a tab
  dragged onto it pinned, an entry dragged out unpinned at the drop place, no pinned tabs: "Pinned (0)" dimmed and a
  click does nothing. Own row: the pinned ones on the first row (two rows when they do not fit), the others below with each
  tab bar setting, the line between them; switching the setting while tabs are open.

### 3.6 Alternatives

- **Pinned tabs smaller** (only an icon, as browsers do): LexPen's documents have no icon of their own to tell them
  apart; the name is needed.
- **A pinned pane** (the pinned documents in the second pane): the second pane is for working side by side.

## 4. Open questions

None.
