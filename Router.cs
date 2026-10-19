namespace LexPen;

/// <summary>
/// Decides which window gets which paths from a launch. Pure, so it can be tested without windows.
/// </summary>
static class Router
{
    /// <summary>One window to open or reuse. <see cref="Window"/> is an index into the open windows; null opens a new one.</summary>
    public sealed record Target(int? Window, string? Folder, List<string> Files)
    {
        /// <summary>The new window restores the saved session (only on the first start).</summary>
        public bool Restore { get; set; }
        /// <summary>The new window becomes the primary window.</summary>
        public bool Primary { get; set; }
    }

    /// <summary>
    /// <paramref name="windows"/> holds the open folder of each open window (null: none), in opening order;
    /// <paramref name="recent"/> is the index of the most recently active one (-1 when there are none).
    /// The last target in the result is the one to bring to the front.
    /// </summary>
    public static List<Target> Route(IReadOnlyList<(string Path, bool Dir)> items, IReadOnlyList<string?> windows, int recent, bool shift)
    {
        var targets = new List<Target>();

        // Every folder gets a window: the one that already shows it, or a new one.
        foreach (var (path, _) in items.Where(i => i.Dir))
        {
            var folder = Trim(path);
            if (targets.Any(t => Same(t.Folder, folder))) continue;
            var open = windows.ToList().FindIndex(w => Same(w, folder));
            targets.Add(new Target(open >= 0 ? open : null, folder, []));
        }

        // A file goes to the window of the deepest folder it lies under; the rest stay together.
        var rest = new List<string>();
        foreach (var (path, _) in items.Where(i => !i.Dir))
        {
            var owner = targets.Where(t => IsUnder(path, t.Folder!)).MaxBy(t => t.Folder!.Length);
            if (owner is null) rest.Add(path); else owner.Files.Add(path);
        }

        if (windows.Count == 0)
        {
            // First start: Shift does not matter. The window for the remaining files (or the only
            // window, without arguments) restores the session; otherwise the first folder window does.
            if (rest.Count > 0 || targets.Count == 0)
                targets.Add(new Target(null, null, rest) { Restore = true, Primary = true });
            else
                targets[0].Restore = targets[0].Primary = true;
        }
        else if (rest.Count > 0 || targets.Count == 0)
        {
            // Shift: a new window; otherwise the most recently active one (without files: just activate it).
            targets.Add(shift ? new Target(null, null, rest) : new Target(recent, null, rest));
        }
        return targets;
    }

    static string Trim(string folder) => folder.Length > 3 ? folder.TrimEnd('\\') : folder;

    static bool Same(string? a, string? b) =>
        a is not null && b is not null && string.Equals(Trim(a), Trim(b), StringComparison.OrdinalIgnoreCase);

    static bool IsUnder(string path, string folder) =>
        path.StartsWith(folder.TrimEnd('\\') + '\\', StringComparison.OrdinalIgnoreCase);
}
