namespace LexPen;

/// <summary>
/// Decides which window gets which paths from a launch. Pure, so it can be tested without windows.
/// </summary>
static class Router
{
    /// <summary>One window to open or reuse. <see cref="Window"/> is an index into the open windows; null opens a new one.</summary>
    public sealed record Target(int? Window, string? Folder, List<string> Files);

    /// <summary>
    /// <paramref name="windows"/> holds the open folder of each open window (null: none), in opening order;
    /// <paramref name="here"/> the windows on the virtual desktop shown now, most recently active first. The last
    /// target in the result is the one to bring to the front. At start the windows of the projects are open before
    /// this runs (AppHost.Launch).
    /// </summary>
    public static List<Target> Route(IReadOnlyList<(string Path, bool Dir)> items, IReadOnlyList<string?> windows, IReadOnlyList<int> here, bool shift)
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

        // The rest (or, without arguments, just a window): the most recently active window on this desktop; Shift,
        // or no LexPen window on this desktop: a new window.
        if (rest.Count > 0 || targets.Count == 0)
            targets.Add(new Target(shift || here.Count == 0 ? null : here[0], null, rest));
        return targets;
    }

    static string Trim(string folder) => folder.Length > 3 ? folder.TrimEnd('\\') : folder;

    static bool Same(string? a, string? b) =>
        a is not null && b is not null && string.Equals(Trim(a), Trim(b), StringComparison.OrdinalIgnoreCase);

    static bool IsUnder(string path, string folder) =>
        path.StartsWith(folder.TrimEnd('\\') + '\\', StringComparison.OrdinalIgnoreCase);
}
