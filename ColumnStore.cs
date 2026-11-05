using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// How a CSV is read and shown (docs/plans/29-PLAN-csv-columns.md 3.4): its column definition, CSV on the Web (CSVW)
/// metadata. Next to the file (<see cref="Beside"/>, <see cref="SaveBeside"/>), else kept here, in file-columns.json:
/// per file { opened, table }, the last <see cref="Max"/> files with a definition, as <see cref="RulerStore"/> keeps its
/// lines. Keys as in <see cref="BookmarkStore.Key"/>: a file by its path, a draft by its id.
/// </summary>
sealed class ColumnStore
{
    public const int Max = 100;
    readonly string path;
    readonly JsonObject files;

    public ColumnStore(string path)
    {
        this.path = path;
        try { files = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? []; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { files = []; }
    }

    /// <summary>A file opened: its definition (none: null), and it moves to the front.</summary>
    public JsonObject? Open(string key)
    {
        if (files[key] is not JsonObject entry) return null;
        entry["opened"] = Next();
        Save();
        return entry["table"]?.DeepClone() as JsonObject;
    }

    /// <summary>Null removes the file.</summary>
    public void Set(string key, JsonObject? table)
    {
        if (table is null) files.Remove(key);
        else
        {
            files[key] = new JsonObject { ["opened"] = Next(), ["table"] = table.DeepClone() };
            while (files.Count > Max) files.Remove(files.MinBy(p => Stamp(p.Value)).Key);
        }
        Save();
    }

    /// <summary>A file or folder renamed (FileRename): the definitions of the files in it go along.</summary>
    public void Rename(string from, string to)
    {
        var moved = false;
        foreach (var (key, value) in files.ToList())
            if (FileRename.Renamed(key, from, to) is string renamed)
            {
                files.Remove(key);
                files[BookmarkStore.Key(renamed, null)] = value;
                moved = true;
            }
        if (moved) Save();
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

    // ---------- Next to the file ----------
    /// <summary>The CSVW name for one file: data.csv -> data.csv-metadata.json.</summary>
    public static string OwnName(string csvPath) => csvPath + "-metadata.json";

    /// <summary>The CSVW name for a folder: csv-metadata.json, which may describe several files.</summary>
    public static string FolderName(string csvPath) => Path.Combine(Path.GetDirectoryName(csvPath) ?? "", "csv-metadata.json");

    /// <summary>
    /// The definition next to the file: name.csv-metadata.json, else the folder's csv-metadata.json when it describes
    /// this file (its url, or one of its tables' url, names it; a table gets the dialect of the whole when it has
    /// none). Null when neither does, or what is there is not JSON.
    /// </summary>
    public static (string Path, JsonObject Table)? Beside(string csvPath)
    {
        var own = OwnName(csvPath);
        if (Read(own) is JsonObject mine) return (own, mine["tables"] is JsonArray ? TableFor(mine, csvPath) ?? mine : mine);
        var folder = FolderName(csvPath);
        return Read(folder) is JsonObject all && TableFor(all, csvPath) is JsonObject table ? (folder, table) : null;
    }

    /// <summary>
    /// Writes the definition next to the file: into the folder's csv-metadata.json when that one describes the file and
    /// it has no file of its own (the other tables there stay), else name.csv-metadata.json. Returns the path written.
    /// </summary>
    public static string SaveBeside(string csvPath, JsonObject table)
    {
        var own = OwnName(csvPath);
        var folder = FolderName(csvPath);
        if (!File.Exists(own) && Read(folder) is JsonObject all)
        {
            if (all["tables"] is JsonArray tables)
            {
                var i = tables.ToList().FindIndex(t => t is JsonObject o && Names(o, csvPath));
                if (i >= 0)
                {
                    var copy = (JsonObject)table.DeepClone();
                    copy.Remove("@context");
                    tables[i] = copy;
                    Write(folder, all);
                    return folder;
                }
            }
            else if (Names(all, csvPath))
            {
                Write(folder, table);
                return folder;
            }
        }
        Write(own, table);
        return own;
    }

    static JsonObject? TableFor(JsonObject meta, string csvPath)
    {
        if (meta["tables"] is JsonArray tables)
        {
            if (tables.OfType<JsonObject>().FirstOrDefault(t => Names(t, csvPath)) is not JsonObject t) return null;
            var table = (JsonObject)t.DeepClone();
            if (table["dialect"] is null && meta["dialect"] is JsonNode dialect) table["dialect"] = dialect.DeepClone();
            return table;
        }
        return Names(meta, csvPath) ? meta : null;
    }

    // A table's url names the file: its name, relative to the metadata's folder (a path or a URL; case does not count).
    static bool Names(JsonObject table, string csvPath)
    {
        var url = table["url"]?.GetValueKind() == JsonValueKind.String ? table["url"]!.GetValue<string>() : null;
        if (string.IsNullOrWhiteSpace(url)) return false;
        var name = Uri.UnescapeDataString(url.Split('?', '#')[0]).Replace('\\', '/').TrimStart('.', '/');
        return string.Equals(name, Path.GetFileName(csvPath), StringComparison.OrdinalIgnoreCase);
    }

    static JsonObject? Read(string file)
    {
        try { return File.Exists(file) ? JsonNode.Parse(File.ReadAllText(file)) as JsonObject : null; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { return null; }
    }

    // Readable for people too: a quote as ", not " (the file is JSON, not HTML).
    static void Write(string file, JsonObject json) =>
        File.WriteAllText(file, json.ToJsonString(new JsonSerializerOptions
        {
            WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        }) + Environment.NewLine);
}
