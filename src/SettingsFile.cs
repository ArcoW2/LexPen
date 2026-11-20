using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// settings.json: your settings. The one in defaults holds every setting with its default (and a comment per
/// setting); the one in the data folder holds only what differs, so it is short and can be edited by hand or
/// copied to another PC. Comments (//) and trailing commas are allowed in both. A name that is not a setting,
/// or a value of another kind than the default (text, number, true / false), is reported and skipped. A default
/// whose name ends in ".*" stands for a family ("openIn.*": "openIn.markdown", "openIn.sql", ...).
/// </summary>
static class SettingsFile
{
    public const string Name = "settings.json";

    static readonly JsonDocumentOptions Options = new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };
    static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    /// <summary>{ values: every setting with its value, user: the names you set, defaults: { ... }, problems: [...] }.
    /// A user file that cannot be read leaves the defaults in place and says so.</summary>
    public static JsonObject Merge(string defaults, string? user, string userName = Name)
    {
        var problems = new JsonArray();
        var defaultValues = Parse(defaults, "the default " + Name, problems) ?? new JsonObject();
        var values = (JsonObject)defaultValues.DeepClone();
        var mine = new JsonArray();
        if (user is not null && Parse(user, userName, problems) is JsonObject own)
            foreach (var (name, value) in own)
            {
                if (Problem(defaultValues, name, value) is string problem)
                {
                    problems.Add($"{userName}: {problem}");
                    continue;
                }
                values[name] = value!.DeepClone();
                if (!JsonNode.DeepEquals(value, Standard(defaultValues, name))) mine.Add(name);
            }
        return new JsonObject { ["values"] = values, ["user"] = mine, ["defaults"] = defaultValues, ["problems"] = problems };
    }

    /// <summary>The user file's text after setting one value: a value equal to the default leaves the file.
    /// Throws when the name or the kind of value is wrong.</summary>
    public static string Set(string defaults, string? user, string name, JsonNode? value)
    {
        var defaultValues = Parse(defaults, Name, new JsonArray()) ?? new JsonObject();
        var own = (user is null ? null : Parse(user, Name, new JsonArray())) ?? new JsonObject();
        if (MovedToLayout.Contains(name))   // a window's layout now: its value in defaultLayout
        {
            var shipped = defaultValues[LayoutName] as JsonObject ?? new JsonObject();
            if (Problem(shipped, name, value) is string wrong) throw new ArgumentException(wrong);
            var layout = own[LayoutName] as JsonObject ?? new JsonObject();
            if (JsonNode.DeepEquals(value, shipped[name])) layout.Remove(name);
            else layout[name] = value!.DeepClone();
            if (layout.Count > 0) own[LayoutName] = layout; else own.Remove(LayoutName);
            return own.ToJsonString(Indented);
        }
        if (Problem(defaultValues, name, value) is string problem) throw new ArgumentException(problem);
        if (JsonNode.DeepEquals(value, Standard(defaultValues, name))) own.Remove(name);
        else own[name] = value!.DeepClone();
        return own.ToJsonString(Indented);
    }

    // The default of a setting, also of one of a family ("openIn.sql": the default of "openIn.*").
    static JsonNode? Standard(JsonObject defaults, string name) =>
        defaults.TryGetPropertyValue(name, out var v) ? v
        : name.Contains('.') && defaults.TryGetPropertyValue(name[..name.LastIndexOf('.')] + ".*", out var family) ? family : null;

    // Settings that were renamed: an old name in your file gives its value to the new one (unless that is set
    // already: a newer choice wins), and goes. Done once when your file is read. `Value`: the old value as the new
    // setting takes it, when its kind changed (null: as it is).
    static readonly (string Old, string New, Func<JsonNode?, JsonNode?>? Value)[] Renamed =
    [
        ("openMarkdownIn", "openIn.markdown", null),
        // The first occurrence underlined (on / off) became a choice of how it is marked (plan 34).
        ("occurrences.markFirst", "occurrences.first", v => v?.GetValueKind() == JsonValueKind.False ? "same" : "underline"),
        // Ask to save changed drafts (on / off) became a choice that can also delete them.
        ("askSaveDrafts", "changedDrafts", v => v?.GetValueKind() == JsonValueKind.False ? "keep" : "ask"),
    ];

    // Settings that went (their part is done by another): removed from your file, once, when it is read.
    static readonly string[] Retired =
    [
        "explorerShell",   // plan 40: the Explorer extension is what explorerCompare does when LexPenShell.dll is there
    ];

    // Settings that kept their name but became a choice: an on / off value in your file becomes the choice it meant.
    // Done once when your file is read.
    static readonly (string Name, Func<bool, string> Value)[] Retyped =
    [
        ("occurrences.bar", on => on ? "always" : "never"),   // plan 34: Never, When an occurrence is active, Always
    ];

    /// <summary>The layout a new project starts with (docs/plans/executed/PLAN-settings-layers.md): one object of the names a
    /// window keeps with its session (what is open and shown in it). A name missing in yours is the shipped one.</summary>
    public const string LayoutName = "defaultLayout";

    /// <summary>Settings that became part of a window's layout. In settings.json they are only part of defaultLayout:
    /// one of them at the top of your file moves into it (a value already there wins), once, when your file is read;
    /// setting one (Set) sets it there.</summary>
    public static readonly string[] MovedToLayout = ["wrap", "previewWrap", "tabBar", "formatBar", "ruler", "lineNumbers",
        "lineNumberCount", "gutter.bookmarks", "gutter.changes", "gutter.git", "gutter.folds", "overview.find",
        "overview.changes", "overview.git", "overview.bookmarks", "overview.highlights", "overview.compare"];

    /// <summary>Your file with renamed settings moved over, and the settings that are a window's layout now moved into
    /// defaultLayout; null when nothing had to change (or it cannot be read).</summary>
    public static string? Upgrade(string? user)
    {
        if (user is null || Parse(user, Name, new JsonArray()) is not JsonObject own) return null;
        var changed = false;
        foreach (var (old, renamed, convert) in Renamed)
        {
            if (!own.TryGetPropertyValue(old, out var value)) continue;
            own.Remove(old);
            if (!own.ContainsKey(renamed)) own[renamed] = convert is null ? value?.DeepClone() : convert(value);
            changed = true;
        }
        foreach (var name in Retired) changed |= own.Remove(name);
        foreach (var (name, retype) in Retyped)
        {
            if (own[name]?.GetValueKind() is not (JsonValueKind.True or JsonValueKind.False) || own[name] is not JsonNode value) continue;
            own[name] = retype(value.GetValue<bool>());
            changed = true;
        }
        foreach (var name in MovedToLayout)
        {
            if (!own.TryGetPropertyValue(name, out var value)) continue;
            own.Remove(name);
            if (own[LayoutName] is not JsonObject layout) own[LayoutName] = layout = new JsonObject();
            if (!layout.ContainsKey(name)) layout[name] = value?.DeepClone();
            changed = true;
        }
        return changed ? own.ToJsonString(Indented) : null;
    }

    /// <summary>Your file with the layout values the page kept in its own storage before (the sidebar, the outline, the
    /// panes, ...): each one that is a name of the shipped defaultLayout, of its kind, not the shipped value, and not
    /// in yours yet. Done once (AppHost.ImportLayout).</summary>
    public static string ImportLayout(string defaults, string? user, JsonObject values)
    {
        var shipped = Parse(defaults, Name, new JsonArray())?[LayoutName] as JsonObject ?? new JsonObject();
        var own = (user is null ? null : Parse(user, Name, new JsonArray())) ?? new JsonObject();
        var layout = own[LayoutName] as JsonObject ?? new JsonObject();
        foreach (var (name, value) in values)
            if (shipped.TryGetPropertyValue(name, out var standard) && Kind(value) == Kind(standard) && !layout.ContainsKey(name)
                && !JsonNode.DeepEquals(value, standard))
                layout[name] = value!.DeepClone();
        if (layout.Count > 0) own[LayoutName] = layout;
        return own.ToJsonString(Indented);
    }

    static JsonObject? Parse(string text, string source, JsonArray problems)
    {
        try
        {
            if (JsonNode.Parse(text, documentOptions: Options) is JsonObject o) return o;
            problems.Add($"{source}: the file must hold one {{ ... }} of settings.");
        }
        catch (JsonException ex) { problems.Add($"{source}: {ex.Message}"); }
        return null;
    }

    static string? Problem(JsonObject defaults, string name, JsonNode? value)
    {
        if (!defaults.TryGetPropertyValue(name, out var standard)
            && !(name.Contains('.') && defaults.TryGetPropertyValue(name[..name.LastIndexOf('.')] + ".*", out standard)))
            return $"\"{name}\" is not a setting.";
        if (value is null || Kind(value) != Kind(standard)) return $"\"{name}\" needs {Describe(standard)}.";
        return null;
    }

    static string Kind(JsonNode? node) => node?.GetValueKind() switch
    {
        JsonValueKind.True or JsonValueKind.False => "bool",
        JsonValueKind.Number => "number",
        JsonValueKind.String => "text",
        var k => k.ToString() ?? "null",
    };

    static string Describe(JsonNode? node) => Kind(node) switch
    {
        "bool" => "true or false",
        "number" => "a number",
        "text" => "a text in quotes",
        var k => k,
    };

    public static string DefaultsPath => Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder, Name);

    /// <summary>The merged settings for this installation: defaults\settings.json and yours in the data folder.</summary>
    public static JsonObject Load(string dataDir)
    {
        var userPath = Path.Combine(dataDir, Name);
        string? user = null;
        try
        {
            if (File.Exists(userPath)) user = File.ReadAllText(userPath);
            if (Upgrade(user) is string upgraded) File.WriteAllText(userPath, user = upgraded);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        var merged = Merge(File.ReadAllText(DefaultsPath), user, userPath);
        merged["userFile"] = userPath;
        return merged;
    }

    /// <summary>The layout values of the page's storage into your defaultLayout (ImportLayout), written.</summary>
    public static void WriteImportedLayout(string dataDir, JsonObject values)
    {
        var userPath = Path.Combine(dataDir, Name);
        var user = File.Exists(userPath) ? File.ReadAllText(userPath) : null;
        var text = ImportLayout(File.ReadAllText(DefaultsPath), user, values);
        Directory.CreateDirectory(dataDir);
        File.WriteAllText(userPath, text);
    }

    /// <summary>Sets one value in your file (written whole, as plain JSON: comments in it do not survive).</summary>
    public static void Write(string dataDir, string name, JsonNode? value)
    {
        var userPath = Path.Combine(dataDir, Name);
        var user = File.Exists(userPath) ? File.ReadAllText(userPath) : null;
        var text = Set(File.ReadAllText(DefaultsPath), user, name, value);
        Directory.CreateDirectory(dataDir);
        File.WriteAllText(userPath, text);
    }
}
