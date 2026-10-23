using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The highlights of every file (and draft) (docs/plans/executed/PLAN-highlights.md): in highlights.json in the state folder,
/// or, with the setting highlightsStore "beside", in a file next to the highlighted one: its whole name plus .lph
/// ("report.md.lph"). Per file { size, time, list }: the file's size and change time when its highlights were last
/// written (the page places them without looking them up when the file is still so), and the highlights, each
/// { from, to, text, before, after, note, state, was } (the page's; the host keeps them as they come). A .lph next to a
/// file wins when reading; writing goes where the setting says and removes them from the other place. The store also
/// keeps which files have theirs next to them (`beside`), for the list of all files and for moving them all. Used off
/// the UI thread: every call locks.
/// </summary>
sealed class HighlightStore
{
    public const string Extension = ".lph";
    readonly string path;
    readonly JsonObject files;   // key (BookmarkStore.Key) -> { size, time, list }
    readonly HashSet<string> beside = new(StringComparer.OrdinalIgnoreCase);   // paths with a .lph
    readonly object gate = new();

    public HighlightStore(string path)
    {
        this.path = path;
        JsonObject root;
        try { root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? []; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { root = []; }
        files = root["files"] as JsonObject ?? [];
        if (root["beside"] is JsonArray list)
            foreach (var p in list) if (p?.GetValue<string>() is string s) beside.Add(s);
    }

    public static string BesidePath(string file) => file + Extension;

    /// <summary>The file's size and change time as the highlights note them; nulls when it is not there.</summary>
    public static (long? Size, string? Time) Stamp(string? file)
    {
        if (file is null || !File.Exists(file)) return (null, null);
        var info = new FileInfo(file);
        return (info.Length, info.LastWriteTimeUtc.Ticks.ToString());
    }

    /// <summary>A file's (or draft's) highlights: { size, time, list, beside, nowSize, nowTime }: as written last, where
    /// they were found (next to the file or not), and the file as it is now.</summary>
    public JsonObject Get(string? file, string? draft)
    {
        lock (gate)
        {
            JsonObject? entry = null;
            var next = file is null ? null : BesidePath(file);
            var isBeside = false;
            if (next is not null && File.Exists(next))
            {
                try { entry = JsonNode.Parse(File.ReadAllText(next)) as JsonObject; isBeside = entry is not null; }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
                if (isBeside && beside.Add(file!)) Save();
            }
            entry ??= files[BookmarkStore.Key(file, draft)]?.DeepClone() as JsonObject;
            var (size, time) = Stamp(file);
            return new JsonObject
            {
                ["size"] = entry?["size"]?.DeepClone(), ["time"] = entry?["time"]?.DeepClone(),
                ["list"] = entry?["list"]?.DeepClone() ?? new JsonArray(), ["beside"] = isBeside,
                ["nowSize"] = size, ["nowTime"] = time,
            };
        }
    }

    /// <summary>Writes a file's (or draft's) highlights, noting the file as it is now; next to the file when `toBeside`
    /// (a file only), else in the store, and gone from the other place. None left: gone from both. Returns where they
    /// went: "beside", "store", or "store-readonly" when the folder could not be written to.</summary>
    public string Set(string? file, string? draft, JsonArray list, bool toBeside)
    {
        lock (gate)
        {
            var key = BookmarkStore.Key(file, draft);
            var next = file is null ? null : BesidePath(file);
            var (size, time) = Stamp(file);
            var entry = new JsonObject { ["path"] = file, ["size"] = size, ["time"] = time, ["list"] = list.DeepClone() };
            if (list.Count == 0)
            {
                files.Remove(key);
                if (next is not null) { TryDelete(next); beside.Remove(file!); }
                Save();
                return "store";
            }
            if (toBeside && next is not null)
            {
                try
                {
                    File.WriteAllText(next, entry.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
                    files.Remove(key);
                    beside.Add(file!);
                    Save();
                    return "beside";
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
            }
            files[key] = entry;
            var fell = toBeside && next is not null;
            if (next is not null && !fell) { TryDelete(next); beside.Remove(file!); }
            Save();
            return fell ? "store-readonly" : "store";
        }
    }

    /// <summary>Every file with highlights: [{ path or draft, count, beside }].</summary>
    public JsonArray All()
    {
        lock (gate)
        {
            var all = new JsonArray();
            foreach (var (key, value) in files)
            {
                var count = (value?["list"] as JsonArray)?.Count ?? 0;
                all.Add(key.StartsWith("draft:", StringComparison.Ordinal)
                    ? new JsonObject { ["draft"] = key[6..], ["count"] = count, ["beside"] = false }
                    : new JsonObject { ["path"] = value?["path"]?.GetValue<string>() ?? key, ["count"] = count, ["beside"] = false });
            }
            foreach (var file in beside.ToList())
            {
                var next = BesidePath(file);
                if (!File.Exists(next)) { beside.Remove(file); continue; }
                int count;
                try { count = (JsonNode.Parse(File.ReadAllText(next))?["list"] as JsonArray)?.Count ?? 0; }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { continue; }
                all.Add(new JsonObject { ["path"] = file, ["count"] = count, ["beside"] = true });
            }
            return all;
        }
    }

    /// <summary>A file renamed or moved inside LexPen: its highlights go along (the .lph too).</summary>
    public void Move(string from, string to)
    {
        lock (gate)
        {
            var oldKey = BookmarkStore.Key(from, null);
            if (files[oldKey] is JsonObject entry) { files.Remove(oldKey); entry["path"] = to; files[BookmarkStore.Key(to, null)] = entry; }
            if (File.Exists(BesidePath(from)))
            {
                try { File.Move(BesidePath(from), BesidePath(to), true); beside.Remove(from); beside.Add(to); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
            }
            Save();
        }
    }

    /// <summary>A file deleted inside LexPen: its highlights go too.</summary>
    public void Delete(string file)
    {
        lock (gate)
        {
            files.Remove(BookmarkStore.Key(file, null));
            TryDelete(BesidePath(file));
            beside.Remove(file);
            Save();
        }
    }

    /// <summary>A draft saved as a file: its highlights move to the file (where the setting says).</summary>
    public void DraftSaved(string draft, string file, bool toBeside)
    {
        JsonArray? list;
        lock (gate)
        {
            var key = BookmarkStore.Key(null, draft);
            list = files[key]?["list"]?.DeepClone() as JsonArray;
            files.Remove(key);
            Save();
        }
        if (list is { Count: > 0 }) Set(file, null, list, toBeside);
    }

    /// <summary>The setting switched: every file's highlights to the place it says now (the button beside the
    /// setting). Returns how many files moved.</summary>
    public int MoveAll(bool toBeside)
    {
        List<(string File, JsonArray List)> moving = [];
        lock (gate)
        {
            if (toBeside)
            {
                foreach (var (key, value) in files.ToList())
                    if (!key.StartsWith("draft:", StringComparison.Ordinal) && value?["path"]?.GetValue<string>() is string file
                        && File.Exists(file) && value["list"] is JsonArray list)
                        moving.Add((file, (JsonArray)list.DeepClone()));
            }
            else
            {
                foreach (var file in beside.ToList())
                {
                    try
                    {
                        if (JsonNode.Parse(File.ReadAllText(BesidePath(file)))?["list"] is JsonArray list) moving.Add((file, (JsonArray)list.DeepClone()));
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
                }
            }
        }
        foreach (var (file, list) in moving) Set(file, null, list, toBeside);
        return moving.Count;
    }

    static void TryDelete(string file)
    {
        try { if (File.Exists(file)) File.Delete(file); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var root = new JsonObject { ["files"] = files.DeepClone(), ["beside"] = new JsonArray(beside.Select(p => (JsonNode?)p).ToArray()) };
        File.WriteAllText(path, root.ToJsonString());
    }
}
