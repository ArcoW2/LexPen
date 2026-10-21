# Plan: Overview ruler (marks along the scrollbar)

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Where in the file the find matches, the changes, the bookmarks and the problems are, is visible only where they
are shown. Visual Studio's scroll bar shows marks for all of them (and a minimap if wanted).

## 2. The solution, in brief

A thin strip next to the scrollbar with a mark per find match, unsaved change, git change, bookmark and problem
(3.7e of the reformat plan), at its place in the file; a click goes there. A setting switches it and each kind.

## 3. Details

- Drawn as a canvas over the scrollbar's height, recomputed when its sources change (debounced).
- Colours: the gutter's (git), the find colours, the bookmark colour.
- A minimap (a small picture of the text) is left out: more work, less use.

### 3.1 Tests

In-app: find marks appear at their height; a click goes there; changes and bookmarks; the setting off.

## 4. Open questions

1. Which kinds by default?
