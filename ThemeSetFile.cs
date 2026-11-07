using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// Theme sets (docs/plans/executed/PLAN-theme-sets.md): a named combination of the settings that decide the look (Names). A
/// window shows its project's set, else the default set of the virtual desktop it is on, else the app's default set
/// (Resolve). The look of settings.json is itself the set "Default", which cannot be renamed or deleted; the other sets
/// are in theme-sets.json in the data folder (yours to copy to another PC), with which set is the app's default and
/// which set each desktop has. A set holds every one of the names (a snapshot when it is made), so using it is
/// complete. Pure apart from the file, so the rules can be tested without windows.
/// </summary>
static class ThemeSetFile
{
    public const string FileName = "theme-sets.json";
    public const string Default = "Default";

    /// <summary>The settings of a set: the themes, and the colours and intensities. One list: a later colour setting is
    /// added here once (the settings window's marks follow from it: THEME_SET_NAMES in actions.js holds the same).</summary>
    public static readonly string[] Names = ["themeLight", "themeDark", "editorThemeLight", "editorThemeDark",
        "previewThemeLight", "previewThemeDark", "sneakTheme", "highlightColour", "highlightIntensity",
        "previewHighlightColour", "previewHighlightIntensity", "inlineCodeIntensity", "indentGuideColour",
        "indentGuideIntensity", "indentGuideCursorColour", "indentGuideCursorIntensity", "columnGuideColour",
        "columnGuideIntensity", "helperLineIntensity", "tabStopIntensity", "sortLineIntensity", "csvStripeColour", "csvStripeIntensity"];

    public sealed class Set
    {
        public string Name = "";
        public JsonObject Values = [];
    }

    /// <summary>theme-sets.json: the app's default set, a default set per desktop (by its id), the sets.</summary>
    public sealed class Data
    {
        public string App = Default;
        public Dictionary<string, string> Desktops = new(StringComparer.OrdinalIgnoreCase);
        public List<Set> Sets = [];

        public Set? Get(string? name) => Sets.FirstOrDefault(s => string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
        /// <summary>A name that is a set: "Default" or one of the sets (in its own spelling); else null.</summary>
        public string? Known(string? name) => name is null ? null
            : string.Equals(name, Default, StringComparison.OrdinalIgnoreCase) ? Default : Get(name)?.Name;
    }

    public static Data Load(string path)
    {
        var data = new Data();
        JsonObject? root = null;
        try { root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        if (root is null) return data;
        foreach (var node in root["sets"] as JsonArray ?? [])
            if (node?["name"]?.GetValue<string>() is { Length: > 0 } name && data.Known(name) is null)
                data.Sets.Add(new Set { Name = name, Values = Only(node["values"] as JsonObject) });
        data.App = data.Known(root["app"]?.GetValue<string>()) ?? Default;
        foreach (var (desktop, set) in root["desktops"] as JsonObject ?? [])
            if (set?.GetValueKind() == JsonValueKind.String && data.Known(set.GetValue<string>()) is string known) data.Desktops[desktop] = known;
        return data;
    }

    public static void Save(string path, Data data)
    {
        var root = new JsonObject
        {
            ["app"] = data.App,
            ["desktops"] = new JsonObject(data.Desktops.Select(d => KeyValuePair.Create(d.Key, (JsonNode?)d.Value))),
            ["sets"] = new JsonArray(data.Sets.Select(s => (JsonNode?)new JsonObject { ["name"] = s.Name, ["values"] = s.Values.DeepClone() }).ToArray()),
        };
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";
        File.WriteAllText(temp, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temp, path, overwrite: true);
    }

    /// <summary>Only the names of a set, from <paramref name="values"/>.</summary>
    public static JsonObject Only(JsonObject? values) =>
        new((values ?? []).Where(v => Names.Contains(v.Key) && v.Value is not null).Select(v => KeyValuePair.Create(v.Key, (JsonNode?)v.Value!.DeepClone())));

    /// <summary>Which set a window shows: its project's, else its desktop's default, else the app's (each only when it
    /// is a set; a name that is gone counts as none).</summary>
    public static string Resolve(Data data, string? project, string? desktop) =>
        data.Known(project) ?? (desktop is not null && data.Desktops.TryGetValue(desktop, out var d) ? data.Known(d) : null) ?? data.Known(data.App) ?? Default;

    /// <summary>Where a window's set comes from, for the bars: "project", "desktop" or "app".</summary>
    public static string Source(Data data, string? project, string? desktop) =>
        data.Known(project) is not null ? "project"
        : desktop is not null && data.Desktops.TryGetValue(desktop, out var d) && data.Known(d) is not null ? "desktop" : "app";

    /// <summary>The settings' values with a set's over them ("Default": as they are).</summary>
    public static JsonObject Apply(JsonObject values, Set? set)
    {
        var result = (JsonObject)values.DeepClone();
        foreach (var (name, value) in set?.Values ?? []) if (value is not null) result[name] = value.DeepClone();
        return result;
    }

    /// <summary>A new set: the names' values as a window shows them now.</summary>
    public static Set Make(string name, JsonObject shownValues) => new() { Name = name.Trim(), Values = Only(shownValues) };

    /// <summary>A name a new or renamed set may have: not empty, not "Default", not taken (but by itself).</summary>
    public static bool Free(Data data, string name, string? self = null)
    {
        var wanted = name.Trim();
        if (wanted.Length == 0 || string.Equals(wanted, Default, StringComparison.OrdinalIgnoreCase)) return false;
        var taken = data.Known(wanted);
        return taken is null || self is not null && string.Equals(taken, self, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Renames a set; the desktops and the app naming it follow (the projects: AppHost, ProjectStore).</summary>
    public static void Rename(Data data, string from, string to)
    {
        if (data.Get(from) is not Set set) return;
        set.Name = to.Trim();
        foreach (var key in data.Desktops.Keys.ToList()) if (string.Equals(data.Desktops[key], from, StringComparison.OrdinalIgnoreCase)) data.Desktops[key] = set.Name;
        if (string.Equals(data.App, from, StringComparison.OrdinalIgnoreCase)) data.App = set.Name;
    }

    /// <summary>Deletes a set; a desktop naming it has none, the app falls back to "Default".</summary>
    public static void Delete(Data data, string name)
    {
        if (data.Get(name) is not Set set) return;
        data.Sets.Remove(set);
        foreach (var key in data.Desktops.Where(d => string.Equals(d.Value, name, StringComparison.OrdinalIgnoreCase)).Select(d => d.Key).ToList())
            data.Desktops.Remove(key);
        if (string.Equals(data.App, name, StringComparison.OrdinalIgnoreCase)) data.App = Default;
    }
}
