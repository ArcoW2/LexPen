# Plan: favourite files

Status: built on branch `feature/next-features`.

## 1. What this is about

A list of files to keep at hand: managed by the user, opened from Open > Favourite files; a favourite
that is already open is selected instead of opened again.

## 2. The solution, in brief

The host keeps the list in its settings next to the recent lists, so all windows share it; it has no
limit and keeps the order in which files were added. Open > Favourite files shows "Add (or Remove)
current file", then the files, each with a small x to remove it. The tab and tree right-click menus
have "Add to / Remove from favourites".

## 3. Behaviour

- Click a favourite: if it is open in a tab of this window (either pane, also a hidden one), that tab is
  selected (a hidden pane is shown); otherwise it opens in the active pane.
- Add: Open > Favourite files > Add current file; right-click a tab or a file in the tree > Add to
  favourites. Adding a file that is already a favourite changes nothing.
- Remove: the x of an entry (the menu stays open), the same menu items (they read "Remove ..." for a
  favourite).
- A favourite that no longer exists is dimmed; clicking it removes it, as in the recent lists.
- Folders cannot be favourites (the tree menu has no item for them).

## 4. Resolved issues during execution

| # | Issue | Resolution |
|---|---|---|
| 1 | Where the list lives | `FavouriteFiles` in the host's settings.json, with `RecentList.Append` (at the end, once, no limit; unit test) |
| 2 | Right-click menus open at once, the list comes from the host | The item shows the label from the last known list straight away and corrects it when the host answers, so a change made in another window is picked up |
| 3 | Verified in the running app | Empty list, add from the Open menu / tab menu / tree menu, no item for folders, order kept, an open favourite selected (also in a hidden pane, which is shown), a closed one opened, x removes with the menu kept open, a missing file dimmed and removed on click, the toggle label, settings.json content. Unit tests: 33 passed |
