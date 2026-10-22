using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The lines on the ruler (tab stops and helper lines, ruler.js) of the last files (and drafts) opened, kept in
/// file-rulers.json: per file { opened, lines }, lines a list of { col, colour, kind }. `opened` orders the files:
/// opening one with lines, or changing its lines, puts it first; past <see cref="Max"/> the oldest goes. Only files
/// with lines are kept. Keys as in <see cref="BookmarkStore.Key"/>: a file by its path, a draft by its id.
/// </summary>
sealed class RulerStore
{
    public const int Max = 100;
    readonly string path;
    readonly JsonObject files;

    public RulerStore(string path)
    {
        this.path = path;
        try { files = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? []; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { files = []; }
    }

    /// <summary>A file opened: its lines (none: empty), and it moves to the front.</summary>
    public JsonArray Open(string key)
    {
        if (files[key] is not JsonObject entry) return [];
        entry["opened"] = Next();
        Save();
        return entry["lines"]?.DeepClone() as JsonArray ?? [];
    }

    /// <summary>An empty list removes the file.</summary>
    public void Set(string key, JsonArray lines)
    {
        if (lines.Count == 0) files.Remove(key);
        else
        {
            files[key] = new JsonObject { ["opened"] = Next(), ["lines"] = lines.DeepClone() };
            while (files.Count > Max) files.Remove(files.MinBy(p => Stamp(p.Value)).Key);
        }
        Save();
    }

    public IEnumerable<string> Keys => files.Select(p => p.Key);

    static long Stamp(JsonNode? entry) => (long?)entry?["opened"] ?? 0;
    long Next() => files.Count == 0 ? 1 : files.Max(p => Stamp(p.Value)) + 1;

    void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, files.ToJsonString());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
}
