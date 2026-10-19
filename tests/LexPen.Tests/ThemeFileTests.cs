using System.Globalization;
using System.Text.RegularExpressions;

namespace LexPen.Tests;

public class ThemeFileTests : IDisposable
{
    static readonly string Wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
    static readonly string Css = File.ReadAllText(Path.Combine(Wwwroot, "app.css"));
    static readonly Dictionary<string, string> Names = ThemeFile.Names(Css);
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-themes-" + Guid.NewGuid().ToString("N"));

    public ThemeFileTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void TheColourNamesComeFromAppCss()
    {
        Assert.Equal("--bg", Names["bg"]);
        Assert.Equal("--bg-side", Names["bgSide"]);
        Assert.Equal("--hl-keyword", Names["keyword"]);
        Assert.Equal("--find-current-fg", Names["findCurrentFg"]);
        Assert.Equal("--find-box", Names["findBox"]);
        Assert.DoesNotContain("editorFont", Names.Keys);   // the fonts block is not a theme block
    }

    [Fact]
    public void ATheme()
    {
        var problems = new List<string>();
        var t = ThemeFile.Parse("mine", """
            // comment
            { "name": "Mine", "base": "dark", "colors": { "bg": "#101010", "findBox": "rgba(255, 255, 0, .5)", }, }
            """, true, Names, problems, "mine.json")!;
        Assert.Empty(problems);
        Assert.Equal(("Mine", "dark"), (t.Name, t.Base));
        Assert.Equal("#101010", t.Vars["--bg"]);
        Assert.Equal("rgba(255, 255, 0, .5)", t.Vars["--find-box"]);
    }

    [Fact]
    public void WrongNamesAndValuesAreReportedAndSkipped()
    {
        var problems = new List<string>();
        var t = ThemeFile.Parse("x", """{ "base": "light", "colors": { "nope": "#fff", "bg": "red", "fg": "#123456" } }""",
            true, Names, problems, "x.json")!;
        Assert.Equal(2, problems.Count);
        Assert.Contains(problems, p => p.Contains("\"nope\" is not a colour name"));
        Assert.Contains(problems, p => p.Contains("\"bg\" needs a colour"));
        Assert.Equal(["--fg"], t.Vars.Keys);
    }

    [Fact]
    public void WithoutAValidBaseThereIsNoTheme()
    {
        var problems = new List<string>();
        Assert.Null(ThemeFile.Parse("x", """{ "base": "grey" }""", true, Names, problems, "x.json"));
        Assert.Null(ThemeFile.Parse("y", "{ broken", true, Names, problems, "y.json"));
        Assert.Equal(2, problems.Count);
    }

    [Fact]
    public void YourThemeReplacesAShippedOneOfTheSameName()
    {
        File.WriteAllText(Path.Combine(dir, "dark.json"), """{ "name": "My dark", "base": "dark", "colors": { "bg": "#000000" } }""");
        File.WriteAllText(Path.Combine(dir, "zebra.json"), """{ "name": "Zebra", "base": "light" }""");
        var themes = ThemeFile.Load(Path.Combine(Wwwroot, "themes"), dir, Names, []);
        Assert.Equal(["light", "dark"], themes.Take(2).Select(t => t.Id));
        var dark = themes.Single(t => t.Id == "dark");
        Assert.True(dark.Mine);
        Assert.Equal("My dark", dark.Name);
        Assert.Contains(themes, t => t.Id == "zebra" && t.Mine);
    }

    [Fact]
    public void TheShippedThemesLoadWithoutProblems()
    {
        var problems = new List<string>();
        var themes = ThemeFile.Load(Path.Combine(Wwwroot, "themes"), Path.Combine(dir, "none"), Names, problems);
        Assert.Empty(problems);
        Assert.Equal(["light", "dark", "black", "bluish", "greenish", "reddish", "yellowish"], themes.Select(t => t.Id));
        Assert.Equal(["light", "dark", "dark", "dark", "dark", "dark", "light"], themes.Select(t => t.Base));
    }

    // ---------- Readable contrast (WCAG 2): text 7:1, dim text and code colours 4.5:1, comments and the accent 3:1 ----------

    public static TheoryData<string> ShippedThemes() => new(Directory.GetFiles(Path.Combine(Wwwroot, "themes"), "*.json")
        .Select(p => Path.GetFileNameWithoutExtension(p)));

    [Theory]
    [MemberData(nameof(ShippedThemes))]
    public void ShippedThemesAreReadable(string id)
    {
        var theme = ThemeFile.Load(Path.Combine(Wwwroot, "themes"), Path.Combine(dir, "none"), Names, []).Single(t => t.Id == id);
        var colours = BaseColours(theme.Base);
        foreach (var (name, value) in theme.Vars) colours[name] = value;
        var bg = colours["--bg"];
        var low = new List<string>();
        void Need(string var, double ratio, string on)
        {
            var c = Contrast(colours[var], colours[on]);
            if (c < ratio) low.Add($"{var} on {on}: {c:0.00} (needs {ratio})");
        }
        Need("--fg", 7, "--bg");
        Need("--fg", 7, "--bg-side");
        Need("--fg-dim", 4.5, "--bg");
        foreach (var code in new[] { "--hl-keyword", "--hl-string", "--hl-number", "--hl-title", "--hl-attr" })
        {
            Need(code, 4.5, "--bg");
            Need(code, 4.5, "--bg-code");
        }
        // Comments are dimmed on purpose (as in today's Light, GitHub's colours): 3:1.
        Need("--hl-comment", 3, "--bg");
        Need("--hl-comment", 3, "--bg-code");
        Need("--accent", 3, "--bg");
        Need("--find-box", 3, "--bg");
        Assert.True(low.Count == 0, $"{id}: " + string.Join("; ", low));
        Assert.True(bg.StartsWith('#'));
    }

    // The base colours: the light block or the dark block (":root[data-theme=dark]") of app.css.
    static Dictionary<string, string> BaseColours(string themeBase)
    {
        var marker = themeBase == "dark" ? ":root[data-theme=dark]" : ":root, .mm-themed[data-theme=light] {";
        var start = Css.IndexOf(marker, StringComparison.Ordinal);
        var block = Css[start..Css.IndexOf('}', start)];
        return Regex.Matches(block, @"(--[a-z0-9-]+)\s*:\s*([^;]+);").ToDictionary(m => m.Groups[1].Value, m => m.Groups[2].Value.Trim());
    }

    static double Contrast(string a, string b)
    {
        double l1 = Luminance(a), l2 = Luminance(b);
        return (Math.Max(l1, l2) + 0.05) / (Math.Min(l1, l2) + 0.05);
    }

    static double Luminance(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length is 3 or 4) hex = string.Concat(hex[..3].Select(c => $"{c}{c}"));
        double Channel(int i)
        {
            var c = int.Parse(hex.Substring(i, 2), NumberStyles.HexNumber) / 255.0;
            return c <= 0.03928 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * Channel(0) + 0.7152 * Channel(2) + 0.0722 * Channel(4);
    }
}
