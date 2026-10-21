# Plan: Find history

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The find bar and the search panel forget what was searched. UltraEdit and Visual Studio keep a list of earlier
searches (and replacements) to pick from.

## 2. The solution, in brief

The last searches and replacements are kept (shared by all windows, in the app's state), and the find and search
fields show them in a list: Down in an empty field or Alt+Down opens it, Up / Down in the field step through
them.

## 3. Details

- What is kept: the text with its switches (case, word, regex), newest first, no duplicates, a limit (a setting).
- Where: the host's state folder (as clipboards), so all windows and a restart share it.
- The find bar's and the search panel's fields share the list; the replace fields have their own.
- A private search is not a thing here; a "clear history" item in the list.

### 3.1 Tests

In-app: three searches, the list newest first; picking one sets its switches; a restart keeps it; another window
sees it; clear.

## 4. Open questions

1. How many to keep (a setting with a default)?
