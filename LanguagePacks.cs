using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using YamlDotNet.Core;
using YamlDotNet.RepresentationModel;

namespace LexPen;

/// <summary>
/// Language packs: a folder per language, languages\&lt;id&gt;\ with language.yaml (extensions, how files open,
/// comments, quotes, words, colouring rules, outline, actions, colours), bar.yaml (the helper buttons) and
/// icons\*.svg. The shipped packs are in defaults\languages; yours in languages\ in the data folder, where a
/// folder with the same name replaces a shipped one. The page gets every pack as JSON (YAML is read here):
/// { packs: { id: { ...language, bar, icons } }, extensions: { ".cs": "csharp" }, problems: [...] }.
/// A pack that cannot be read is left out and reported; the others still load.
/// </summary>
static class LanguagePacks
{
    public const string FolderName = "languages";
    static readonly string[] OpenModes = ["edit", "split", "preview"];

    public static JsonObject Load(string shippedDir, string userDir)
    {
        var packs = new SortedDictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        var problems = new JsonArray();
        foreach (var (dir, mine) in new[] { (shippedDir, false), (userDir, true) })
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var folder in Directory.GetDirectories(dir))
            {
                var id = Path.GetFileName(folder).ToLowerInvariant();
                if (id.StartsWith('_')) continue;   // _template
                var source = mine ? Path.Combine(folder, "language.yaml") : $"the shipped language {id}";
                if (ReadPack(folder, id, source, problems) is JsonObject pack)
                {
                    pack["mine"] = mine;
                    packs[id] = pack;
                }
            }
        }
        // Extensions: a later pack does not take an extension an earlier one has, except yours over shipped ones.
        var extensions = new JsonObject();
        foreach (var (id, pack) in packs.OrderBy(p => p.Value["mine"]!.GetValue<bool>()))
            foreach (var ext in pack["extensions"]?.AsArray() ?? [])
                if (ext?.GetValue<string>() is string e) extensions[e.ToLowerInvariant()] = id;
        return new JsonObject
        {
            ["packs"] = new JsonObject(packs.Select(p => KeyValuePair.Create(p.Key, (JsonNode?)p.Value))),
            ["extensions"] = extensions,
            ["problems"] = problems,
        };
    }

    static JsonObject? ReadPack(string folder, string id, string source, JsonArray problems)
    {
        var languagePath = Path.Combine(folder, "language.yaml");
        if (!File.Exists(languagePath))
        {
            problems.Add($"{source}: language.yaml is missing.");
            return null;
        }
        JsonObject pack;
        try
        {
            if (Yaml(File.ReadAllText(languagePath)) is not JsonObject o)
            {
                problems.Add($"{source}: the file must hold the parts of a language (name, extensions, ...).");
                return null;
            }
            pack = o;
        }
        catch (Exception ex) when (ex is YamlException or IOException or UnauthorizedAccessException)
        {
            problems.Add($"{source}: {Message(ex)}");
            return null;
        }
        pack["id"] = id;
        if (pack["name"]?.GetValueKind() != System.Text.Json.JsonValueKind.String) pack["name"] = id;
        // Extensions as ".cs": with the dot, lower case.
        if (pack["extensions"] is JsonArray exts)
            pack["extensions"] = new JsonArray(exts.OfType<JsonValue>().Select(e => e.ToString().Trim())
                .Where(e => e.Length > 0).Select(e => (JsonNode?)(e.StartsWith('.') ? e : "." + e).ToLowerInvariant()).ToArray());
        else if (pack["extensions"] is not null)
        {
            problems.Add($"{source}: \"extensions\" must be a list, as [.cs, .csx].");
            pack.Remove("extensions");
        }
        if (pack["open"] is JsonNode open && !OpenModes.Contains(open.ToString()))
        {
            problems.Add($"{source}: \"open\" must be edit, split or preview.");
            pack.Remove("open");
        }
        // The order of the word lists is their priority (the first list with a word wins), but a message to the page
        // arrives with its keys sorted (WebView2): the order goes along as a list.
        if (pack["words"] is JsonObject words) pack["wordOrder"] = new JsonArray(words.Select(w => (JsonNode?)w.Key).ToArray());
        // The same for the looks: a token of two types (a JSON key: string and property) gets the look of the type that
        // comes later in the file.
        if (pack["tokens"] is JsonObject tokens) pack["tokenOrder"] = new JsonArray(tokens.Select(t => (JsonNode?)t.Key).ToArray());
        // Blocks of another language (embedded) and the names this language answers to (aliases): a wrong entry is
        // reported and left out, the rest of the pack stays.
        if (pack["embedded"] is JsonNode embedded)
        {
            var kept = new JsonArray();
            if (embedded is not JsonArray rules)
                problems.Add($"{source}: \"embedded\" must be a list of blocks, as [{{ open: '/*==[', close: ']==*/', language: json }}].");
            else
                foreach (var rule in rules)
                    if (EmbeddedProblem(rule) is string problem) problems.Add($"{source}: embedded: {problem}");
                    else kept.Add(rule!.DeepClone());
            pack["embedded"] = kept;
        }
        if (pack["aliases"] is JsonNode aliases)
        {
            if (aliases is JsonArray names && names.All(n => n?.GetValueKind() is System.Text.Json.JsonValueKind.String or System.Text.Json.JsonValueKind.Number))
                pack["aliases"] = new JsonArray(names.Select(n => (JsonNode?)n!.ToString().Trim().ToLowerInvariant()).Where(n => n!.GetValue<string>().Length > 0).ToArray());
            else
            {
                problems.Add($"{source}: \"aliases\" must be a list of names, as [cs, c#].");
                pack.Remove("aliases");
            }
        }
        foreach (var part in new[] { "firstLine" })
            if (pack[part] is JsonNode p && !ValidRegex(p.ToString(), out var error))
            {
                problems.Add($"{source}: \"{part}\" is not a valid pattern: {error}");
                pack.Remove(part);
            }

        // The bar and the icons (single colour SVG, shown with the theme's text colour).
        var barPath = Path.Combine(folder, "bar.yaml");
        if (File.Exists(barPath))
            try
            {
                if (Yaml(File.ReadAllText(barPath)) is JsonArray bar) pack["bar"] = bar;
                else problems.Add($"{Path.Combine(Path.GetDirectoryName(source) ?? "", "bar.yaml")}: the file must hold a list of buttons.");
            }
            catch (YamlException ex) { problems.Add($"{barPath}: {Message(ex)}"); }
        var icons = new JsonObject();
        var iconDir = Path.Combine(folder, "icons");
        if (Directory.Exists(iconDir))
            foreach (var svg in Directory.GetFiles(iconDir, "*.svg"))
                icons[Path.GetFileNameWithoutExtension(svg)] = File.ReadAllText(svg);
        pack["icons"] = icons;
        return pack;
    }

    static string Message(Exception ex) => ex is YamlException y ? $"line {y.Start.Line}, column {y.Start.Column}: {y.Message}" : ex.Message;

    // What is wrong with one embedded block rule, or null: an open and a close (text or pattern), and the language
    // (a name, or the open pattern's group that holds it).
    static string? EmbeddedProblem(JsonNode? rule)
    {
        if (rule is not JsonObject r) return "a block must be { open, close, language }.";
        string? Text(string key) => r[key]?.GetValueKind() == System.Text.Json.JsonValueKind.String ? r[key]!.GetValue<string>() : null;
        foreach (var (plain, regex) in new[] { ("open", "openRegex"), ("close", "closeRegex") })
        {
            if (Text(plain) is not { Length: > 0 } && Text(regex) is not { Length: > 0 }) return $"a block needs \"{plain}\" (text) or \"{regex}\" (a pattern).";
            if (Text(regex) is { } pattern && !ValidRegex(pattern, out var error)) return $"\"{regex}\" is not a valid pattern: {error}";
        }
        var group = r["languageGroup"]?.GetValueKind() == System.Text.Json.JsonValueKind.Number ? (int)r["languageGroup"]!.GetValue<long>() : (int?)null;   // YAML numbers arrive as long
        if (Text("language") is not { Length: > 0 } && group is null) return "a block needs \"language\" (a name) or \"languageGroup\" (a group of openRegex).";
        if (group is int g && (Text("openRegex") is not { } open || g < 1 || g > new Regex(open).GetGroupNumbers().Max()))
            return "\"languageGroup\" must be a group of \"openRegex\".";
        return null;
    }

    static bool ValidRegex(string pattern, out string? error)
    {
        try
        {
            _ = new Regex(pattern);
            error = null;
            return true;
        }
        catch (ArgumentException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    // ---------- YAML -> JSON ----------

    /// <summary>One YAML document as JSON. Plain scalars become what they look like (true / false, numbers,
    /// null or ~); quoted ones stay text. Throws YamlException on a mistake.</summary>
    public static JsonNode? Yaml(string text)
    {
        var stream = new YamlStream();
        stream.Load(new StringReader(text));
        return stream.Documents.Count == 0 ? null : Convert(stream.Documents[0].RootNode);
    }

    static JsonNode? Convert(YamlNode node) => node switch
    {
        YamlMappingNode map => new JsonObject(map.Children.Select(c =>
            KeyValuePair.Create(((YamlScalarNode)c.Key).Value ?? "", Convert(c.Value)))),
        YamlSequenceNode list => new JsonArray(list.Children.Select(Convert).ToArray()),
        YamlScalarNode scalar => Scalar(scalar),
        _ => null,
    };

    static JsonNode? Scalar(YamlScalarNode s)
    {
        var v = s.Value ?? "";
        if (s.Style is not ScalarStyle.Plain) return JsonValue.Create(v);
        if (v is "" or "~" or "null") return null;
        if (v is "true" or "false") return JsonValue.Create(v == "true");
        if (Regex.IsMatch(v, @"^-?\d+$") && long.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var i)) return JsonValue.Create(i);
        if (Regex.IsMatch(v, @"^-?\d+\.\d+$") && double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)) return JsonValue.Create(d);
        return JsonValue.Create(v);
    }
}
