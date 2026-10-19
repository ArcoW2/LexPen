namespace LexPen;

/// <summary>Recently opened files and folders, and recently closed files: newest first, no doubles.</summary>
static class RecentList
{
    public const int Max = 15;

    /// <summary>The list with the path on top (moved there when it was already in it), at most Max long.</summary>
    public static List<string> Push(List<string> list, string path) =>
        [path, .. list.Where(p => !string.Equals(p, path, StringComparison.OrdinalIgnoreCase)).Take(Max - 1)];

    /// <summary>Favourites: the path at the end, unless it is in the list already. No limit.</summary>
    public static List<string> Append(List<string> list, string path) =>
        list.Any(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase)) ? list : [.. list, path];

    public static List<string> Remove(List<string> list, string path) =>
        list.Where(p => !string.Equals(p, path, StringComparison.OrdinalIgnoreCase)).ToList();
}
