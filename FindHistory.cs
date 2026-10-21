namespace LexPen;

/// <summary>A search kept in the find history: its text and switches.</summary>
public sealed class FindEntry
{
    public string Text { get; set; } = "";
    public bool Case { get; set; }
    public bool Word { get; set; }
    public bool Regex { get; set; }
}

/// <summary>The find and replace histories (the find bar, the search in files): newest first, a text once (its
/// latest switches), at most `max` long.</summary>
static class FindHistory
{
    public const int DefaultMax = 20;

    public static List<FindEntry> Push(List<FindEntry> list, FindEntry entry, int max) =>
        entry.Text.Length == 0 ? list : [entry, .. list.Where(e => e.Text != entry.Text).Take(Math.Max(0, max - 1))];

    public static List<string> Push(List<string> list, string text, int max) =>
        text.Length == 0 ? list : [text, .. list.Where(t => t != text).Take(Math.Max(0, max - 1))];
}
