using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The bookmarks of every file (and draft), kept in bookmarks.json: per file a list of
/// { n (1 to 9; 0 for an unnumbered one), line, ch, text (the line's text) }. While a file is open the
/// editor keeps its bookmarks itself; this store is where they wait while it is closed. A file changed
/// outside LexPen meanwhile gets its bookmarks back by their line text (see Resolve).
/// </summary>
sealed class BookmarkStore
{
    readonly string path;
    readonly JsonObject files;

    public BookmarkStore(string path)
    {
        this.path = path;
        try { files = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? []; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { files = []; }
    }

    /// <summary>A file by its path (not case sensitive), a draft by its id.</summary>
    public static string Key(string? path, string? draft) => path is { Length: > 0 } ? path.ToLowerInvariant() : "draft:" + draft;

    public JsonArray Get(string key) => files[key]?.DeepClone() as JsonArray ?? [];

    public void Set(string key, JsonArray list)
    {
        if (list.Count == 0) files.Remove(key);
        else files[key] = list.DeepClone();
        Directory.CreateDirectory(Path.GetDirectoryName(this.path)!);
        File.WriteAllText(this.path, files.ToJsonString());
    }

    /// <summary>The bookmarks placed in `text`: a bookmark stays on its line when that line still has its
    /// text; else it goes to the nearest line with that text; else it stays on its line number (the last
    /// line at most). A column past the end of its line becomes the line end.</summary>
    public static JsonArray Resolve(JsonArray list, string text)
    {
        var lines = text.Split('\n').Select(l => l.TrimEnd('\r')).ToArray();
        var result = new JsonArray();
        foreach (var node in list)
        {
            if (node is not JsonObject mark) continue;
            var line = Math.Max(0, (int?)mark["line"] ?? 0);
            var saved = (string?)mark["text"];
            if (saved is not null && (line >= lines.Length || lines[line] != saved))
            {
                var found = Nearest(lines, line, saved);
                if (found >= 0) line = found;
            }
            line = Math.Min(line, lines.Length - 1);
            var ch = Math.Min(Math.Max(0, (int?)mark["ch"] ?? 0), lines[line].Length);
            result.Add(new JsonObject { ["n"] = (int?)mark["n"] ?? 0, ["line"] = line, ["ch"] = ch, ["text"] = lines[line] });
        }
        return result;
    }

    // The line with this text closest to `from` (above wins a tie); -1 when there is none.
    static int Nearest(string[] lines, int from, string text)
    {
        for (var d = 1; d < lines.Length + from; d++)
        {
            if (from - d >= 0 && from - d < lines.Length && lines[from - d] == text) return from - d;
            if (from + d < lines.Length && lines[from + d] == text) return from + d;
        }
        return -1;
    }
}
