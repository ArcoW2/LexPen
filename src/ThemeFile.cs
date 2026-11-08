using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace LexPen;

/// <summary>
/// Themes: defaults\themes\*.json ships with LexPen, your own go in themes\ in the data folder (a file with the same
/// name replaces a shipped one). A theme has a name, a description (its character, shown with the name in the
/// settings), optionally a base (any other theme: its colours, through its
/// own base and so on) and only the colours that differ from its base. Light and Dark set every colour: the roots.
/// A theme is not light or dark: the mode that chose it is (AppHost.Mode). A colour nothing in the chain sets comes
/// from the mode's fallback block in app.css. The colour names are the CSS variables of the light block in app.css
/// without the dashes (--bg-side is bgSide; the code colours --hl-keyword ... are keyword ...). A wrong name or
/// value is reported and skipped.
/// </summary>
static partial class ThemeFile
{
    public const string FolderName = "themes";

    /// <summary>One theme. Vars: its colours through its chain (its own win, then its base's, ...), without the
    /// fallback (Complete adds it). Chain: its id, then the ids of its bases, nearest first. From: per colour in Vars,
    /// the id of the theme in the chain that set it (the Theme colours window, docs/plans/executed/PLAN-theme-colours.md).</summary>
    public sealed record Theme(string Id, string Name, string? BaseId, IReadOnlyDictionary<string, string> Vars, bool Mine,
        IReadOnlyList<string> Chain, string? Description = null, IReadOnlyDictionary<string, string>? From = null);

    /// <summary>Shipped themes that were renamed: old id -> new id. An old id in settings.json, in a theme's base or
    /// in a language pack's byTheme finds the new theme, unless a theme with the old id is there (yours).</summary>
    public static readonly IReadOnlyDictionary<string, string> Renamed = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["bluish"] = "dark-ocean", ["greenish"] = "dark-forest", ["reddish"] = "dark-wine", ["dark-yellowish"] = "dark-parchment",
        ["light-bluish"] = "light-sky", ["light-greenish"] = "light-seafoam", ["light-reddish"] = "light-blossom",
        ["yellowish"] = "light-parchment",
    };

    /// <summary>The id to look up: the id itself when a theme has it, else its new id when it was renamed.</summary>
    public static string? Current(string? id, Func<string, bool> exists) =>
        id is null || exists(id) || !Renamed.TryGetValue(id, out var now) ? id : now;

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

    /// <summary>The fallback colours of a mode: the light or the dark block after the "Themes" header of app.css.</summary>
    public static Dictionary<string, string> Fallback(string css, string mode)
    {
        var colours = new Dictionary<string, string>(StringComparer.Ordinal);
        var header = css.IndexOf("/* ---------- Themes ---------- */", StringComparison.Ordinal);
        var marker = mode == "dark" ? ":root[data-theme=dark]" : ":root, .mm-themed[data-theme=light]";
        var start = header < 0 ? -1 : css.IndexOf(marker, header, StringComparison.Ordinal);
        if (start < 0) return colours;
        foreach (Match m in CssValue().Matches(css[start..css.IndexOf('}', start)]))
            colours["--" + m.Groups[1].Value] = m.Groups[2].Value.Trim();
        return colours;
    }

    /// <summary>Every colour of a theme: its own through its chain, the rest from the fallback.</summary>
    public static Dictionary<string, string> Complete(Theme theme, IReadOnlyDictionary<string, string> fallback)
    {
        var colours = new Dictionary<string, string>(fallback, StringComparer.Ordinal);
        foreach (var (name, value) in theme.Vars) colours[name] = value;
        return colours;
    }

    /// <summary>A colour as red, green and blue (an alpha is left out); null when it is not a colour.</summary>
    public static (int R, int G, int B)? Rgb(string colour)
    {
        var c = colour.Trim();
        if (!IsColour(c)) return null;
        if (c.StartsWith('#'))
        {
            var h = c.Length is 4 or 5 ? string.Concat(c[1..4].Select(x => $"{x}{x}")) : c[1..];
            return (Convert.ToInt32(h[0..2], 16), Convert.ToInt32(h[2..4], 16), Convert.ToInt32(h[4..6], 16));
        }
        var parts = c[(c.IndexOf('(') + 1)..c.IndexOf(')')].Split(',');
        return (int.Parse(parts[0]), int.Parse(parts[1]), int.Parse(parts[2]));
    }

    public static bool IsColour(string value) => ColourValue().IsMatch(value.Trim());

    /// <summary>Reads one theme file, its own colours only (Load follows the bases). Null when it is not JSON.</summary>
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
        string? themeBase = null;
        if (root["base"]?.GetValueKind() == JsonValueKind.String) themeBase = root["base"]!.GetValue<string>().Trim().ToLowerInvariant();
        else if (root["base"] is not null) problems.Add($"{source}: \"base\" must be the name of a theme file, as \"dark\".");
        if (themeBase == "") themeBase = null;
        var name = root["name"]?.GetValueKind() == JsonValueKind.String ? root["name"]!.GetValue<string>() : id;
        string? description = null;
        if (root["description"]?.GetValueKind() == JsonValueKind.String) description = root["description"]!.GetValue<string>().Trim();
        else if (root["description"] is not null) problems.Add($"{source}: \"description\" must be a text, as \"blue tint\".");
        if (description == "") description = null;
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
        return new Theme(id, name, themeBase, vars, mine, [id], description, vars.Keys.ToDictionary(k => k, _ => id, StringComparer.Ordinal));
    }

    /// <summary>The shipped themes, with yours on top (same file name: yours wins), each with the colours of its
    /// chain. Light and Dark first, then by name. A base that is not there, or bases going round in a loop:
    /// reported, and the theme builds on the fallback from there.</summary>
    public static List<Theme> Load(string shippedDir, string userDir, IReadOnlyDictionary<string, string> names, List<string> problems)
    {
        var themes = new Dictionary<string, Theme>(StringComparer.OrdinalIgnoreCase);
        var sources = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (dir, mine) in new[] { (shippedDir, false), (userDir, true) })
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var path in Directory.GetFiles(dir, "*.json").OrderBy(p => p, StringComparer.OrdinalIgnoreCase))
            {
                var id = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                string text;
                try { text = File.ReadAllText(path); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { continue; }
                var source = mine ? path : $"the shipped theme {id}";
                if (Parse(id, text, mine, names, problems, source) is Theme t) (themes[id], sources[id]) = (t, source);
            }
        }
        var resolved = new Dictionary<string, Theme>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in themes.Keys) Resolve(id, themes, sources, resolved, [], problems);
        return resolved.Values
            .OrderBy(t => t.Id switch { "light" => 0, "dark" => 1, _ => 2 })
            .ThenBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    // A theme with the colours of its chain: its base resolved first, its own colours on top. Walking: the themes
    // whose base is being resolved, to see a loop; every theme of a loop keeps only its own colours.
    static Theme Resolve(string id, Dictionary<string, Theme> themes, Dictionary<string, string> sources,
        Dictionary<string, Theme> resolved, List<string> walking, List<string> problems)
    {
        if (resolved.TryGetValue(id, out var done)) return done;
        var theme = themes[id];
        Theme? from = null;
        if (Current(theme.BaseId, themes.ContainsKey) is string baseId)
        {
            walking.Add(id);
            if (!themes.ContainsKey(baseId)) problems.Add($"{sources[id]}: the base \"{baseId}\" is not a theme.");
            else if (walking.IndexOf(baseId) is var at and >= 0)
            {
                var loop = walking[at..];
                problems.Add($"{sources[id]}: the bases go round in a loop: {string.Join(" -> ", loop.Append(baseId))}.");
                foreach (var member in loop) resolved[member] = themes[member];
            }
            else from = Resolve(baseId, themes, sources, resolved, walking, problems);
            walking.RemoveAt(walking.Count - 1);
            if (resolved.TryGetValue(id, out done)) return done;   // part of a loop
        }
        var vars = new Dictionary<string, string>(from?.Vars ?? new Dictionary<string, string>(), StringComparer.Ordinal);
        var setters = new Dictionary<string, string>(from?.From ?? new Dictionary<string, string>(), StringComparer.Ordinal);
        foreach (var (name, value) in theme.Vars) (vars[name], setters[name]) = (value, id);
        return resolved[id] = theme with { Vars = vars, Chain = [id, .. from?.Chain ?? []], From = setters };
    }

    [GeneratedRegex(@"--([a-z0-9-]+)\s*:\s*([^;]+);")]
    private static partial Regex CssValue();

    [GeneratedRegex(@"--([a-z][a-z0-9-]*)\s*:")]
    private static partial Regex CssVar();

    [GeneratedRegex(@"^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$")]
    private static partial Regex ColourValue();
}
