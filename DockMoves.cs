using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// A floating tool's window moved by its title bar (not resized): the LexPen window it belongs to hears where the
/// cursor is while it moves (paneMoving) and where it is let go (paneMoved), in its page's coordinates, so its page
/// shows the places it can dock at and docks it there (docs/plans/24-PLAN-docking.md 3.8).
/// </summary>
static class DockMoves
{
    public static void Report(Form form, Func<MainForm?> owner, string id)
    {
        var moving = false;
        var moved = false;   // moved by its title bar: moves at its own size (a resize moves it at another size)
        var sizeAtStart = Size.Empty;
        void Tell(string what)
        {
            if (owner() is { IsDisposed: false } w) w.Post(new JsonObject { ["event"] = what, ["pane"] = id, ["at"] = w.PagePoint(Cursor.Position) });
        }
        form.ResizeBegin += (_, _) => { moving = true; moved = false; sizeAtStart = form.Size; };
        form.Move += (_, _) =>
        {
            if (!moving || form.Size != sizeAtStart) return;
            moved = true;
            Tell("paneMoving");
        };
        // Let go: also when Windows snapped it at the screen's edge (its size changed then; the LexPen window's right
        // edge is the screen's when it fills the screen), so it docks there all the same.
        form.ResizeEnd += (_, _) =>
        {
            if (moved) Tell("paneMoved");
            moving = moved = false;
        };
    }
}
