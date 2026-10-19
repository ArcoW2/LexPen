# Plan: pinned tabs, read-only tabs, close all tabs

Status: executed on 2026-10-19 on the branch `editor-first`. Decisions of the run are in section 5.

## 1. What this is about

Three things for tabs:
- **Pin:** a tab can be pinned so it is not closed by accident. A pinned tab still edits as usual.
- **Read-only:** a tab can be set read-only by the user, so its file cannot be changed there by accident.
  A pinned file can then also be made read-only. A file that is read-only on disk opens read-only.
- **Close all tabs:** closes every tab of a pane except the pinned ones.

## 2. The solution, in brief

The tab's right-click menu gets "Pin tab" / "Unpin tab", "Read-only" (a check mark) and "Close all
tabs". All three are actions too (F1, keys.json), without a default key. A pinned tab shows a pin before its
name; a read-only tab shows the existing read-only look. Closing one pinned tab asks first; closing several at
once (other tabs, tabs to the right, all tabs, a pane) leaves pinned tabs open without asking. Closing the
second pane or a secondary window moves its pinned tabs to the main pane or the primary window (a setting, on
by default). Pin and read-only are kept per tab, in the session and when a tab moves.

## 3. Details

### 3.1 Close paths

| Path | Today | Pinned tab |
|---|---|---|
| Ctrl+W, Ctrl+F4, the tab's x, middle-click, tab menu Close, File > Close tab | `closeTab` | Asks "X is pinned. Close it anyway?"; No keeps it |
| Tab menu: Close other tabs, Close tabs to the right, Close all tabs (new) | `closeTabs` | Stays open, no question |
| Close this pane / Close other pane, for the second pane | `closePane` -> `closeTabs` | Moved to the main pane (setting on), else stays and the pane stays too (the existing "a tab was kept" path) |
| Close the main pane | Its tabs close, the second pane's tabs move in | Pinned tabs stay; the second pane's tabs move in after them |
| Red bar "Close" on a removed file | `closeTab(tab, true)` | Asks first (a user choice, not a move) |
| Move to other pane / next window / new window | `closeTab(tab, true)` | No question; pin and read-only move with the tab |
| Closing the primary window | The session keeps every tab | Nothing changes: pinned tabs come back with the session |
| Closing a secondary window | Its tabs are gone | Moved to the primary window (setting on), else they close as today |

`force` today means two things (a move, and the red bar Close). The red bar needs the question, a move does
not, so a move gets its own flag.

### 3.2 Close all tabs

- Tab menu item "Close all tabs", an action `closeAllTabs`, and an item in the File menu next to Close tab.
- Always only the tabs of one pane: the pane whose tab bar was right-clicked, or from the File menu and F1
  the active pane.
- Each unpinned tab closes as with Ctrl+W: unsaved changes are asked per file, a kept one stays open.

### 3.3 Read-only

- Per tab (`tab.readOnly`), from the tab menu ("Read-only", with a check mark) and an action `readOnly`.
- A read-only tab never edits: the editor is read-only, as it is today for a tab whose file is edited in the
  other pane or another window. It gives up its edit lock, so another tab of the same file (other pane or
  window) that is not read-only can take it.
- Switching read-only off checks first whether another tab of that file, in this window or another one,
  is editing it (not read-only). If so, the switch is refused with a message ("a.md is edited in the other
  pane; set that one read-only first") and the tab stays read-only.
- It is the tab's setting: LexPen never changes the read-only attribute of the file on disk.
- A file with the Windows read-only attribute opens as a read-only tab by itself (checked when the file is
  read or read again). Switching read-only off on such a tab is refused with "The file is read-only on disk".
- Look: the existing read-only look of a tab (name in italics with "(read-only)" after it), and a tooltip
  line saying why: "Read-only (set by you)", "Read-only file on disk", or today's "edited in the other pane" /
  "edited in another window".

### 3.4 Where pin and read-only live

- On the tab: `tab.pinned`, `tab.readOnly`. (`pinned`, not `locked`: the code already has an edit lock,
  `doc.lock`, which tab may edit a file across panes and windows.)
- Session: `pinned` and `readOnly` on the tab's entry; restore reads them.
- Moving a tab to another pane or window: the tab's data sent along gets both fields.

### 3.5 Look of a pinned tab

- A pin before the file name, drawn in CSS (no icon font, plain ASCII in the source).
- The tab keeps its place in the tab bar.
- Tooltip line: "Pinned: asks before closing".
- The tab menu shows "Pin tab" or "Unpin tab", and "Read-only" with a check mark.

### 3.6 Setting

- "Move pinned tabs to the main pane / primary window when closing" (on by default), in a new group Tabs of
  the settings window (with Ctrl+Tab order and Tabs on several rows). Until that window exists, an item in
  Options > Settings.

### 3.7 Tests

- In-app script (debug build over the debugging port): pin, then close with Ctrl+W (confirm stubbed both
  ways); close others / to the right / all leave it open; close all only touches its own pane; closing the
  second pane moves it to the main pane (setting on) or keeps the pane (setting off); the pin shows;
  read-only blocks typing and format actions; switching read-only off is refused while the other pane edits
  the file, and works once that one is read-only; a file with the read-only attribute opens read-only and
  cannot be switched to editable; pin and read-only survive a move to the other pane and a restart.
- Two windows: closing the secondary window moves its pinned tabs to the primary one.
- Every key in keys.json still has an action (existing check).

## 4. Open questions

None.

## 5. Resolved issues during execution

| # | Issue | Decision |
|---|---|---|
| 1 | The plan said moves use `closeTab(tab, true)`. They do not: moving a tab to the other pane or a window takes it out with `detachTab`. Only the red bar's Close passes `force`. | `closeTab(tab, force, bulk)`: a pinned tab asks unless `bulk`, also with `force` (the red bar). No separate move flag was needed. |
| 2 | The pin: drawn in CSS, as the plan said? | A small inline SVG in the tab (plain ASCII markup, `PIN_ICON` in app.js): a CSS-only pin did not read as a pin at tab size. |
| 3 | The Read-only item's check mark in the tab menu. | The existing check style of the menus (`mm-check` / `mm-on`, as Side by side / Above each other). |
| 4 | Handing the editing to another window when every tab of the file here is read-only. | Done when another window shows the file and there are no unsaved edits here (the edits would be lost to the other window, which starts from disk). Otherwise this window keeps the file's edit lock and the tab is just read-only. |
| 5 | A file opened in the other pane while the tab that edits it is read-only stayed read-only there too. | A new tab takes the editing when the editing tab is read-only (`makeTab`). |
| 6 | Closing the main pane or moving pinned tabs to it when the main pane already shows the same file. | The file is not shown twice: the main pane's tab stays and gets the lock (`intoMainPane`). |
| 7 | Moving pinned tabs to the primary window needed a way to name it. | `moveTab` target "primary" in AppHost.MoveTab; on closing a secondary window its pinned tabs move first, then the usual close prompt runs for the rest. |
| 8 | When the read-only attribute on disk is checked. | Whenever the file is read: opening, reloading after an outside change, the bar's Reload, taking over from another window, and a tab moved in from another window. A change of the attribute alone, without a change of the text, is seen at the next read. |
| 9 | Menu letters. | File > Close a&ll tabs (L); Options > Settings > Mo&ve pinned tabs when closing a pane or window (V). Checked by the menu-letter script: no letter twice. |
| 10 | Tests. | In-app script t20-locked (debug build, own port): 26 checks, all pass: pin from the tab menu, pin and tooltip, Ctrl+W asks and No keeps it, close others / close all leave it open without a question, read-only from the tab menu, typing blocked, read-only off refused while the other pane edits and allowed after, read-only on disk opens read-only and cannot be switched, closing the second pane moves its pinned tab (setting on) or keeps the pane (off), session and restart keep pin and read-only, closing a secondary window moves its pinned tab to the primary window. The earlier scripts pass again; the key script now checks Outline is greyed out on a code file. |
| 11 | Name, asked on 2026-10-19 after the run: "Lock" should be "Pin". | Renamed everywhere: menu texts (Pin tab / Unpin tab), tooltip, question, action `pinTab`, setting `movePinned`, code `tab.pinned`, session field `pinned`, this plan's file name. |
| 12 | Asked on 2026-10-19 after the run: Close all tabs also in the menu of the tab bar itself (right-click next to the tabs), not only on a tab. | Added there; greyed out when the pane has no tabs. The test script checks it (28 checks, all pass). |
| 13 | Asked on 2026-10-19: the "(read-only)" text after the name looked ugly. | A padlock before the name, in the style of the pin; underlined for read-only set by you, plain for read-only on disk or edited in the other pane or another window. The text and the italics are gone (drafts stay italic); the tooltip still says why. |
