using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The stored sorts (docs/plans/executed/PLAN-sort-lines.md 3.4), for all of LexPen, in sorts.json at the top of the data
/// folder (they are yours, as favourites.json): { sorts: { name: sort }, templates: [name], last: sort }. A sort is the page's (sort.js)
/// as it is: As text or By columns, its keys, its options. `last`: what the panel opens with, kept by the page a moment
/// after each change ({ sort, name, changed }: the sort, the stored sort it came from, changed since; never in the list). A name is unique, not
/// case sensitive: saving under a name that differs only in case replaces that one. A file that cannot be read counts
/// as no stored sorts; before the first save over it, it is kept beside it as sorts.json.damaged. A template is a stored
/// sort pinned as one (`templates`): first in the list; it stays one when saved, renamed or replaced under its name.
/// </summary>
sealed class SortStore
{
    public const string FileName = "sorts.json";
    readonly string path;
    readonly JsonObject sorts;
    readonly HashSet<string> templates = new(StringComparer.CurrentCultureIgnoreCase);
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
        foreach (var t in root?["templates"] as JsonArray ?? [])
            if (t?.GetValueKind() == JsonValueKind.String && Find((string)t!) is string key) templates.Add(key);
    }

    /// <summary>[{ name, sort, template }]: the templates by name, then the others by name.</summary>
    public JsonArray List() =>
        [.. sorts.OrderBy(p => templates.Contains(p.Key) ? 0 : 1).ThenBy(p => p.Key, StringComparer.CurrentCultureIgnoreCase)
            .Select(p => (JsonNode)new JsonObject { ["name"] = p.Key, ["sort"] = p.Value?.DeepClone(), ["template"] = templates.Contains(p.Key) })];

    public JsonNode? Get(string name) => Find(name) is string key ? sorts[key]?.DeepClone() : null;

    public JsonNode? Last => last?.DeepClone();

    /// <summary>Stores the sort under the name, replacing one with the same name (in any case).</summary>
    public void Save(string name, JsonNode sort)
    {
        var template = false;
        if (Find(name) is string was) { sorts.Remove(was); template = templates.Remove(was); }
        sorts[name] = sort.DeepClone();
        if (template) templates.Add(name);
        Write();
    }

    /// <summary>False when there is no such sort, or another one has the new name (a change of case only is fine).</summary>
    public bool Rename(string from, string to)
    {
        if (Find(from) is not string key || Find(to) is string other && other != key) return false;
        var sort = sorts[key];
        sorts.Remove(key);
        sorts[to] = sort;
        if (templates.Remove(key)) templates.Add(to);
        Write();
        return true;
    }

    /// <summary>Pinned as a template, or back to a regular one; false when there is no such sort.</summary>
    public bool SetTemplate(string name, bool template)
    {
        if (Find(name) is not string key) return false;
        if (template) templates.Add(key); else templates.Remove(key);
        Write();
        return true;
    }

    /// <summary>False when there is no such sort.</summary>
    public bool Delete(string name)
    {
        if (Find(name) is not string key) return false;
        sorts.Remove(key);
        templates.Remove(key);
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
            File.WriteAllText(path, new JsonObject { ["sorts"] = sorts.DeepClone(), ["templates"] = new JsonArray([.. templates.Order(StringComparer.CurrentCultureIgnoreCase).Select(t => (JsonNode)t)]), ["last"] = last?.DeepClone() }.ToJsonString());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
}
