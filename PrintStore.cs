using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The stored print settings (docs/plans/executed/PLAN-printing.md 3.5), for all of LexPen, in prints.json at the top of the
/// data folder: { prints: { name: settings }, templates: [name], last: { settings, name, origin, changed } }. A set of
/// settings is the Print window's (print.js) as it is: the printer and its paper, the layout, the colours, the
/// highlights and notes, and the printer's own settings (its DEVMODE, base64) when Printer settings... was used. It
/// works as SortStore does, in a file of its own: a name is unique, not case sensitive; a template is pinned and listed
/// first; `last` is never in the list; a file that cannot be read counts as none and is kept as prints.json.damaged.
/// </summary>
sealed class PrintStore
{
    public const string FileName = "prints.json";
    readonly string path;
    readonly JsonObject prints;
    readonly HashSet<string> templates = new(StringComparer.CurrentCultureIgnoreCase);
    JsonNode? last;
    bool damaged;

    public PrintStore(string path)
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
        prints = root?["prints"]?.DeepClone() as JsonObject ?? [];
        last = root?["last"]?.DeepClone();
        foreach (var t in root?["templates"] as JsonArray ?? [])
            if (t?.GetValueKind() == JsonValueKind.String && Find((string)t!) is string key) templates.Add(key);
    }

    /// <summary>[{ name, settings, template }]: the templates by name, then the others by name.</summary>
    public JsonArray List() =>
        [.. prints.OrderBy(p => templates.Contains(p.Key) ? 0 : 1).ThenBy(p => p.Key, StringComparer.CurrentCultureIgnoreCase)
            .Select(p => (JsonNode)new JsonObject { ["name"] = p.Key, ["settings"] = p.Value?.DeepClone(), ["template"] = templates.Contains(p.Key) })];

    public JsonNode? Get(string name) => Find(name) is string key ? prints[key]?.DeepClone() : null;

    public JsonNode? Last => last?.DeepClone();

    /// <summary>Stores the settings under the name, replacing one with the same name (in any case).</summary>
    public void Save(string name, JsonNode settings)
    {
        var template = false;
        if (Find(name) is string was) { prints.Remove(was); template = templates.Remove(was); }
        prints[name] = settings.DeepClone();
        if (template) templates.Add(name);
        Write();
    }

    /// <summary>False when there is no such set, or another one has the new name (a change of case only is fine).</summary>
    public bool Rename(string from, string to)
    {
        if (Find(from) is not string key || Find(to) is string other && other != key) return false;
        var settings = prints[key];
        prints.Remove(key);
        prints[to] = settings;
        if (templates.Remove(key)) templates.Add(to);
        Write();
        return true;
    }

    /// <summary>Pinned as a template, or back to a regular one; false when there is no such set.</summary>
    public bool SetTemplate(string name, bool template)
    {
        if (Find(name) is not string key) return false;
        if (template) templates.Add(key); else templates.Remove(key);
        Write();
        return true;
    }

    /// <summary>False when there is no such set.</summary>
    public bool Delete(string name)
    {
        if (Find(name) is not string key) return false;
        prints.Remove(key);
        templates.Remove(key);
        Write();
        return true;
    }

    public void SetLast(JsonNode settings)
    {
        last = settings.DeepClone();
        Write();
    }

    string? Find(string name) => prints.Select(p => p.Key).FirstOrDefault(k => string.Equals(k, name, StringComparison.CurrentCultureIgnoreCase));

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
            File.WriteAllText(path, new JsonObject { ["prints"] = prints.DeepClone(), ["templates"] = new JsonArray([.. templates.Order(StringComparer.CurrentCultureIgnoreCase).Select(t => (JsonNode)t)]), ["last"] = last?.DeepClone() }.ToJsonString());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
}
