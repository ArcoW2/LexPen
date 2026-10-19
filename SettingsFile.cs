using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// settings.json: your settings. The one in wwwroot holds every setting with its default (and a comment per
/// setting); the one in the data folder holds only what differs, so it is short and can be edited by hand or
/// copied to another PC. Comments (//) and trailing commas are allowed in both. A name that is not a setting,
/// or a value of another kind than the default (text, number, true / false), is reported and skipped.
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
                if (!JsonNode.DeepEquals(value, defaultValues[name])) mine.Add(name);
            }
        return new JsonObject { ["values"] = values, ["user"] = mine, ["defaults"] = defaultValues, ["problems"] = problems };
    }

    /// <summary>The user file's text after setting one value: a value equal to the default leaves the file.
    /// Throws when the name or the kind of value is wrong.</summary>
    public static string Set(string defaults, string? user, string name, JsonNode? value)
    {
        var defaultValues = Parse(defaults, Name, new JsonArray()) ?? new JsonObject();
        if (Problem(defaultValues, name, value) is string problem) throw new ArgumentException(problem);
        var own = (user is null ? null : Parse(user, Name, new JsonArray())) ?? new JsonObject();
        if (JsonNode.DeepEquals(value, defaultValues[name])) own.Remove(name);
        else own[name] = value!.DeepClone();
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
        if (!defaults.TryGetPropertyValue(name, out var standard)) return $"\"{name}\" is not a setting.";
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

    public static string DefaultsPath => Path.Combine(AppContext.BaseDirectory, "wwwroot", Name);

    /// <summary>The merged settings for this installation: wwwroot\settings.json and yours in the data folder.</summary>
    public static JsonObject Load(string dataDir)
    {
        var userPath = Path.Combine(dataDir, Name);
        string? user = null;
        try { if (File.Exists(userPath)) user = File.ReadAllText(userPath); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        var merged = Merge(File.ReadAllText(DefaultsPath), user, userPath);
        merged["userFile"] = userPath;
        return merged;
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
