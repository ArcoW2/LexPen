# Plan: Locate the cursor with a short Ctrl tap

Status: executed 2026-10-21 (web/locate.js; in-app test t86, 21 checks). From the user: "Sometimes it's difficult to find the cursor."
The number in the file name is the priority; rename to reorder.

## 1. What this is about

In a long or busy document the cursor is hard to find: a thin line between many characters, after scrolling away
from it, or with several cursors spread over the file. Windows has the same problem for the mouse pointer and
solves it with a tap on Ctrl ("Show location of pointer"). LexPen has nothing for the text cursor.

## 2. The solution, in brief

Pressing Ctrl alone and releasing it shortly after, with no other key or mouse button in between, shows a radar
effect: rings that shrink onto every cursor in the editor that has the focus. A cursor outside the visible part
gets a marker at the edge of the editor, pointing in its direction. The effect is a short animation on a layer
above the text; it changes nothing and takes no clicks. It is also an action, so a key can be given to it. A double tap
scrolls to the cursor first, when the setting for it is on (off by default).

## 3. Details

### 3.1 The tap

- keydown of Control alone starts it; keyup of Control within the tap time triggers it.
- Cancelled by any other keydown (so Ctrl+S, the chords such as Ctrl+D, A, and Ctrl+Alt+... never trigger it),
  any mousedown (Ctrl+click, Ctrl+Alt+click) and a wheel event (Ctrl+wheel zoom).
- Held longer than the tap time: nothing (a Ctrl that was held while thinking is not a tap).
- Left or right Ctrl both count. AltGr (which Windows sends as Ctrl+Alt) does not: Alt in between cancels.
- Works while the focus is in the editor and also in the find bar (the cursors stay visible there); not in
  dialogs.
- Windows' own "Show location of pointer" reacts to the same tap; both show, which is harmless (one for the
  mouse, one for the text cursor).

### 3.2 The effect

- Per visible cursor: a few rings in the find box's colour (a search effect, so the search colour), starting large and shrinking onto the cursor's
  position, then fading. The position comes from the cursor's coordinates, including a cursor past the line end
  (virtual space) and the extra cursors of multiple cursors.
- Per cursor out of view: a wedge at the edge of the editor (top when it is higher, bottom when it is lower; left or
  right for a long line),
  pointing at it, with its line number. With several out of view in the same direction: one wedge with the
  count.
- The layer is pointer-events none and is removed after the animation; a new tap restarts it.
- With prefers-reduced-motion: no movement, one ring that fades.
- Only the editor with the focus; in a split view the other pane is left alone.

### 3.3 Settings and action

- Setting `locateCursor`: on (default) / off.
- Setting `locateCursorTap`: the longest tap in milliseconds (proposed default 400, a design choice, not a
  measurement).
- Setting `locateCursorJump`: a double tap (Ctrl, Ctrl) scrolls to the cursor first (with several: the main one);
  off by default.
- Action `locateCursor` (View menu, F1), so it can also be on a key and in a macro.

### 3.4 Tests

In-app:
- a Ctrl tap shows rings at the cursor's coordinates; with three cursors, three ring sets;
- a cursor scrolled out of view below gets a wedge at the bottom edge with its line number, one above at the top;
- a cursor past the line end (virtual space): the rings are at the virtual column;
- no effect for Ctrl+S, Ctrl+D, A, Ctrl+click, Ctrl+wheel, AltGr, and a Ctrl held past the tap time;
- the setting off: no effect; the action still works;
- the layer is gone after the animation and nothing in the document or the selection changed.

To check first: that the WebView2 page gets keyup for a lone Control (the host does not swallow it).

## 4. Open questions

None.

## 5. Resolved during execution

- The answers: the double tap scrolls to the cursor as a setting (`locateCursorJump`, default off); the colour is the
  find box's, because it is a search effect.
- The page does get the release of a lone Ctrl: the Ctrl+Tab tab walk already ends on it (app.js), and the tap uses
  the same event. The in-app test sends the key events through the DevTools protocol, so it does not prove this for
  the host by itself.
- A double tap: the second tap ends within twice the tap time of the first. Ctrl+Tab, the chords and Ctrl+click
  cancel a tap because another key or a mouse button comes in between.
- The marker says `line N` for one cursor and `N cursors` for several in one direction; its place along the edge
  follows the (first) cursor, kept inside the editor.
- In View: Locate the cursor (tap Ctrl), no key of its own (the tap is the key).
- With reduced motion: one small ring that fades, without the shrinking.
