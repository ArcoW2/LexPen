using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace LexPen;

/// <summary>
/// Themes: wwwroot\themes\*.json ships with LexPen, your own go in themes\ in the data folder (a file with the same
/// name replaces a shipped one). A theme has a name, a base (light or dark: the starting colours, and what the
/// window title bar, diagrams and math follow) and only the colours that differ from its base. The colour names
/// are the CSS variables of the light theme block in app.css without the dashes (--bg-side is bgSide; the code
/// colours --hl-keyword ... are keyword ...). A wrong name or value is reported and skipped.
/// </summary>
static partial class ThemeFile
{
    public const string FolderName = "themes";

    public sealed record Theme(string Id, string Name, string Base, IReadOnlyDictionary<string, string> Vars, bool Mine);

    static readonly JsonDocumentOptions Options = new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };

    /// <summary>The colour names a theme may set, each with its CSS variable: from the first block after the
    /// "Themes" header of app.css (the light colours).</summary>
    public static Dictionary<string, string> Names(string css)
    {
        var header = css.IndexOf("/* ---------- Themes ---------- */", StringComparison.Ordinal);
        var start = header < 0 ? -1 : css.IndexOf('{', css.IndexOf("*/", css.IndexOf("*/", header) + 2) + 2);
        var end = start < 0 ? -1 : css.IndexOf('}', start);
        var names = new Dictionary<string, string>(StringComparer.Ordinal);
        if (end < 0) return names;
        foreach (Match m in CssVar().Matches(css[start..end]))
            names[KeyOf(m.Groups[1].Value)] = "--" + m.Groups[1].Value;
        return names;
    }

    // "hl-keyword" -> "keyword", "bg-side" -> "bgSide", "find-current-fg" -> "findCurrentFg".
    static string KeyOf(string var)
    {
        var parts = (var.StartsWith("hl-") ? var[3..] : var).Split('-');
        return parts[0] + string.Concat(parts.Skip(1).Select(p => char.ToUpperInvariant(p[0]) + p[1..]));
    }

    public static bool IsColour(string value) => ColourValue().IsMatch(value.Trim());

    /// <summary>Reads one theme file. Null when it cannot be used at all (not JSON, no valid base).</summary>
    public static Theme? Parse(string id, string text, bool mine, IReadOnlyDictionary<string, string> names, List<string> problems, string source)
    {
        JsonObject root;
        try
        {
            if (JsonNode.Parse(text, documentOptions: Options) is not JsonObject o)
            {
                problems.Add($"{source}: the file must hold one {{ ... }}.");
                return null;
            }
            root = o;
        }
        catch (JsonException ex)
        {
            problems.Add($"{source}: {ex.Message}");
            return null;
        }
        var themeBase = root["base"]?.GetValueKind() == JsonValueKind.String ? root["base"]!.GetValue<string>() : null;
        if (themeBase is not ("light" or "dark"))
        {
            problems.Add($"{source}: \"base\" must be \"light\" or \"dark\".");
            return null;
        }
        var name = root["name"]?.GetValueKind() == JsonValueKind.String ? root["name"]!.GetValue<string>() : id;
        var vars = new Dictionary<string, string>(StringComparer.Ordinal);
        if (root["colors"] is JsonObject colours)
            foreach (var (key, value) in colours)
            {
                if (!names.TryGetValue(key, out var cssVar)) problems.Add($"{source}: \"{key}\" is not a colour name.");
                else if (value?.GetValueKind() != JsonValueKind.String || !IsColour(value.GetValue<string>()))
                    problems.Add($"{source}: \"{key}\" needs a colour: \"#rrggbb\", \"#rgb\" or \"rgba(r, g, b, a)\".");
                else vars[cssVar] = value.GetValue<string>().Trim();
            }
        else if (root["colors"] is not null) problems.Add($"{source}: \"colors\" must be {{ name: colour, ... }}.");
        return new Theme(id, name, themeBase, vars, mine);
    }

    /// <summary>The shipped themes, with yours on top (same file name: yours wins). Light and Dark first, then by name.</summary>
    public static List<Theme> Load(string shippedDir, string userDir, IReadOnlyDictionary<string, string> names, List<string> problems)
    {
        var themes = new Dictionary<string, Theme>(StringComparer.OrdinalIgnoreCase);
        foreach (var (dir, mine) in new[] { (shippedDir, false), (userDir, true) })
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var path in Directory.GetFiles(dir, "*.json").OrderBy(p => p, StringComparer.OrdinalIgnoreCase))
            {
                var id = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                string text;
                try { text = File.ReadAllText(path); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { continue; }
                if (Parse(id, text, mine, names, problems, mine ? path : $"the shipped theme {id}") is Theme t) themes[id] = t;
            }
        }
        return themes.Values
            .OrderBy(t => t.Id switch { "light" => 0, "dark" => 1, _ => 2 })
            .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    [GeneratedRegex(@"--([a-z][a-z0-9-]*)\s*:")]
    private static partial Regex CssVar();

    [GeneratedRegex(@"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$")]
    private static partial Regex ColourValue();
}
