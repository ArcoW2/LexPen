# Plan: Character tools: code at the cursor, insert by code

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

The bottom bar does not show which character is at the cursor (its code), and a character cannot be inserted by
its code or picked from a table. UltraEdit shows the code (hex) and has a character map; Windows has Alt+code.

## 2. The solution, in brief

The bottom bar shows the character at the cursor as `U+00E9` (with its name in the tooltip); a click there opens
"Insert character": type a code (`e9`, `U+1F600`, `&eacute;`) or a name to search, Enter inserts.

## 3. Details

- Code: the code point at the cursor (surrogate pairs as one), decimal and hex in the tooltip.
- Names: a small table of Unicode names would be large; names for Latin-1 and common signs only, or none (4.1).
- Insert: as text (also in a block: on each line).

### 3.1 Tests

In-app: the code shown for ASCII, an accented letter and an emoji; insert by hex and by entity name.

## 4. Open questions

1. Character names: worth the size, or codes only?
