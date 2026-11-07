using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The stored sorts (docs/plans/executed/PLAN-sort-lines.md 3.4), for all of LexPen, in sorts.json at the top of the data
/// folder (they are yours, as favourites.json): { sorts: { name: sort }, last: sort }. A sort is the page's (sort.js)
/// as it is: As text or By columns, its keys, its options. `last`: what the panel opens with, kept by the page a moment
/// after each change ({ sort, name, changed }: the sort, the stored sort it came from, changed since; never in the list). A name is unique, not
/// case sensitive: saving under a name that differs only in case replaces that one. A file that cannot be read counts
/// as no stored sorts; before the first save over it, it is kept beside it as sorts.json.damaged.
/// </summary>
sealed class SortStore
{
    public const string FileName = "sorts.json";
    readonly string path;
    readonly JsonObject sorts;
    JsonNode? last;
    bool damaged;

    public SortStore(string path)
    {
        this.path = path;
        JsonObject? root = null;
        try
        {
            if (File.Exists(path))
            {
                root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject;
                damaged = root is null;
            }
        }
        catch (JsonException) { damaged = true; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        sorts = root?["sorts"]?.DeepClone() as JsonObject ?? [];
        last = root?["last"]?.DeepClone();
    }

    /// <summary>[{ name, sort }], by name.</summary>
    public JsonArray List() =>
        [.. sorts.OrderBy(p => p.Key, StringComparer.CurrentCultureIgnoreCase)
            .Select(p => (JsonNode)new JsonObject { ["name"] = p.Key, ["sort"] = p.Value?.DeepClone() })];

    public JsonNode? Get(string name) => Find(name) is string key ? sorts[key]?.DeepClone() : null;

    public JsonNode? Last => last?.DeepClone();

    /// <summary>Stores the sort under the name, replacing one with the same name (in any case).</summary>
    public void Save(string name, JsonNode sort)
    {
        if (Find(name) is string was) sorts.Remove(was);
        sorts[name] = sort.DeepClone();
        Write();
    }

    /// <summary>False when there is no such sort.</summary>
    public bool Delete(string name)
    {
        if (Find(name) is not string key) return false;
        sorts.Remove(key);
        Write();
        return true;
    }

    public void SetLast(JsonNode sort)
    {
        last = sort.DeepClone();
        Write();
    }

    string? Find(string name) => sorts.Select(p => p.Key).FirstOrDefault(k => string.Equals(k, name, StringComparison.CurrentCultureIgnoreCase));

    void Write()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            if (damaged)
            {
                File.Copy(path, path + ".damaged", true);
                damaged = false;
            }
            File.WriteAllText(path, new JsonObject { ["sorts"] = sorts.DeepClone(), ["last"] = last?.DeepClone() }.ToJsonString());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
}
