# Plan: close or hide a pane

Status: built on branch `feature/next-features`. Section 7 records what was decided or found during the build.

## 1. What this is about

With two panes visible there is no direct way to go back to one. The second pane only disappears when
every tab in it has been closed, one by one. Asked for: an option to close a pane, or to hide it
completely, when two markdown panes are visible.

## 2. The solution, in brief

Two commands per pane. "Close pane" closes all its tabs (the usual question per unsaved tab) and the
other pane takes the full width. "Hide this pane" keeps its tabs but takes the pane out of view; the
other pane takes the full width, and "Show hidden pane" brings it back. Each item appears only when it
can be used. They are on one small button at the right end of each pane's tab strip, in the tab and
tab-strip right-click menus, and in a new right-click menu on the divider.

## 3. Behaviour

### 3.1 Close pane

- Closes the pane's tabs one by one, through the existing close (unsaved tab: Save / Don't save /
  Cancel; draft: kept as a draft, as now). The closed files go to "Recently closed", as with Ctrl+W.
- Cancel on one tab: that tab stays, the others are still closed; the pane stays with what is left.
- Closing the left (or top) pane: the tabs of the right pane move into it, so the remaining one is
  always "the first pane" (the page assumes the first pane is the one that is always there).

### 3.2 Hide pane

- The pane and the divider go; its tabs, scroll positions and unsaved text stay as they are.
- "Show hidden pane" (tab right-click menu, tab-strip right-click menu, the tab-strip button) brings it
  back. The item is only there while a pane is hidden; "Hide this pane" only while two are visible.
- The hidden pane also comes back automatically when something is sent to it:
  "Move to other pane", Ctrl+click in the tree (other pane), dropping on the far half of the pane.
- While a pane is hidden: compare scroll is off (nothing to compare), the orientation button is hidden
  as it is with one pane now.
- Remembered in the session: a pane hidden at closing time is hidden after a restart.
- Either pane can be hidden.

### 3.3 Where the commands are

| Place | Items |
|---|---|
| Tab strip button (each pane; shown when one of its items applies) | One button with a small menu: Hide this pane, Close this pane (two panes visible); Show hidden pane (a pane is hidden) |
| Right-click on a tab | Hide this pane, Close this pane, Show hidden pane, each only when possible (below the existing items) |
| Right-click on the empty part of a tab strip | Same items, below "Reopen closed tab" |
| Right-click on the divider | A menu: Side by side / Above each other (what the right-click does now), then Hide left pane, Hide right pane, Close left pane, Close right pane (top / bottom when the panes are above each other) |

Change to existing behaviour: right-clicking the divider now opens this menu instead of flipping the
orientation at once. The orientation stays one click away in that menu and on the toolbar button.

No keyboard shortcut (not chosen).

## 4. How it is built

- Page only (`app.js`, `index.html`, `app.css`); no host changes.
- `state.hidden`: null, 0 or 1. `layout()` treats "two panes" as two panes with tabs and none hidden.
  The active pane is always a visible one.
- Close pane: `closeTabs(pane.tabs)`, then for the first pane, move the second pane's tabs into it
  (the existing `moveToPane`).
- Session: `hidden` stored next to `activePane` and `ratio`; on restore it only applies when that pane
  has tabs.
- Read mode startup: nothing new is loaded; the button and menus are a few elements and CSS rules.

## 5. Tests

In the running app through the debugging port, as before:

- Close right pane: tabs gone, one pane, recently closed filled. Close left pane: the right pane's
  tabs now in the first pane.
- Close with an unsaved tab: the question appears (stubbed answer, as in earlier tests); Cancel keeps
  that tab and the pane.
- Hide either pane: pane and divider gone, compare scroll off, "Hide" items gone and "Show hidden pane"
  present in all three menus; show again: tabs, active tab and scroll position unchanged, unsaved text
  intact.
- Hidden pane comes back on Move to other pane, Ctrl+click in the tree, drop on the far half.
- Divider menu: orientation still works; the four items act on the right pane.
- Restart with a hidden pane: still hidden, tabs restored.
- Screenshots light and dark, side by side and above each other.

## 6. Decisions (your answers)

| # | Question | Decision |
|---|---|---|
| Q1 | Divider right-click opens a menu instead of flipping at once | Yes, better than the instant flip |
| Q2 | Tab strip: one button with a menu, or two buttons | One button |
| Q3 | A hidden pane in a secondary window remembered | No |
| - | Showing a hidden pane | "Show hidden pane" in the right-click menus (and the strip button); "Hide this pane" and "Show hidden pane" only appear when possible. No separate "show n hidden tabs" button |

## 7. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | Section 3.1 said an unsaved tab asks "Save / Don't save / Cancel" | That is the window's close prompt. Closing a tab asks "Discard unsaved changes?" (Yes / No), and "Close this pane" goes through the same close per tab. No: the tab stays and so does the pane |
| 2 | A hidden element loses its scroll position | The scroll position is stored on the tab when the pane is hidden and put back when it is shown. The session also takes the stored position for a hidden pane (its own would read 0) |
| 3 | When a hidden pane comes back by itself | Whenever a tab in it is activated: Move to other pane, Ctrl+click in the tree (shows the file in that pane's current tab, as before), a drop on the far half of the remaining pane, back / forward to one of its tabs |
| 4 | Pane button | At the right end of each tab strip (the strip now sits in a row with it). Shown with two panes, or while a pane is hidden; its menu lists only the items that apply |
| 5 | Bug found while testing: the divider menu closed straight after opening | A window-wide right-click handler closed every menu unless the click was on a tab strip; the divider is now excluded too |
| 6 | Verified in the running app | Hide left / right (divider gone, other pane active, compare scroll off, orientation button hidden), show again with the scroll position back, hidden pane back via Ctrl+click in the tree and Move to other pane, close right with an unsaved tab kept (stubbed "No") and discarded, closed files in Recently closed, close left moving the right tabs (order and active tab kept), divider menu labels for both orientations, orientation items, menus show only the items that apply, restart with the right pane hidden restores it hidden. Screenshots light and dark |
| 7 | Added afterwards: "Hide other pane" and "Close other pane" | In the tab menu, the tab-strip menu and the pane button menu, next to the "this pane" items and shown under the same rule (two panes visible). Verified from both sides: hide / close other from a left tab acts on the right pane and the other way round; closing the left pane from the right moves the right tabs into the first pane; none of the pane items with one pane |
| 8 | Added afterwards: double-click a tab | Two panes visible: the other pane is hidden; a pane hidden: it is shown again; one pane and nothing hidden: nothing. The first click redraws the tab strip, so the browser never sends "dblclick"; the second click's click count is used instead. Verified with real mouse double-clicks on both sides |
