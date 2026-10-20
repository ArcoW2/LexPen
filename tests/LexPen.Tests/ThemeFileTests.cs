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
        Assert.Equal(("Mine", "dark"), (t.Name, t.BaseId));
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
    public void OnlyAFileThatIsNotJsonIsNoTheme()
    {
        var problems = new List<string>();
        Assert.Null(ThemeFile.Parse("y", "{ broken", true, Names, problems, "y.json"));
        var t = ThemeFile.Parse("x", """{ "base": 12 }""", true, Names, problems, "x.json")!;
        Assert.Null(t.BaseId);
        Assert.Equal(2, problems.Count);
        Assert.Contains(problems, p => p.Contains("\"base\" must be the name of a theme file"));
    }

    // ---------- Bases: any theme, followed up to a root ----------

    List<ThemeFile.Theme> Mine(List<string> problems, params (string Id, string Json)[] files)
    {
        foreach (var (id, json) in files) File.WriteAllText(Path.Combine(dir, id + ".json"), json);
        return ThemeFile.Load(Path.Combine(Wwwroot, "themes"), dir, Names, problems);
    }

    [Fact]
    public void AChainOwnColourFirstThenTheBaseThenItsBase()
    {
        var problems = new List<string>();
        var themes = Mine(problems,
            ("lighter", """{ "name": "Lighter bluish", "base": "bluish", "colors": { "bg": "#1d2533" } }"""));
        Assert.Empty(problems);
        var t = themes.Single(t => t.Id == "lighter");
        Assert.Equal(["lighter", "bluish", "dark"], t.Chain);
        Assert.Equal("#1d2533", t.Vars["--bg"]);           // its own
        Assert.Equal("#6aa8ff", t.Vars["--accent"]);       // Bluish's
        Assert.Equal("#ff7b72", t.Vars["--hl-keyword"]);   // Dark's
    }

    [Fact]
    public void YourDarkRecoloursEveryThemeOnIt()
    {
        var themes = Mine([], ("dark", """{ "name": "My dark", "colors": { "keyword": "#123456" } }"""));
        Assert.Equal("#123456", themes.Single(t => t.Id == "bluish").Vars["--hl-keyword"]);
        Assert.False(themes.Single(t => t.Id == "bluish").Vars.ContainsKey("--hl-string"));   // My dark has no string: the fallback's
    }

    [Fact]
    public void AMissingBaseIsReportedAndTheThemeStillLoads()
    {
        var problems = new List<string>();
        var t = Mine(problems, ("x", """{ "base": "nope", "colors": { "bg": "#101010" } }""")).Single(t => t.Id == "x");
        Assert.Contains(problems, p => p.Contains("the base \"nope\" is not a theme"));
        Assert.Equal(["--bg"], t.Vars.Keys);
        Assert.Equal(["x"], t.Chain);
    }

    [Fact]
    public void ALoopIsReportedOnceAndItsThemesKeepTheirOwnColours()
    {
        var problems = new List<string>();
        var themes = Mine(problems,
            ("a", """{ "base": "b", "colors": { "bg": "#aaaaaa" } }"""),
            ("b", """{ "base": "a", "colors": { "fg": "#bbbbbb" } }"""),
            ("c", """{ "base": "a", "colors": { "accent": "#cccccc" } }"""),
            ("self", """{ "base": "self" }"""));
        Assert.Equal(2, problems.Count(p => p.Contains("go round in a loop")));
        Assert.Contains(problems, p => p.Contains("a -> b -> a") || p.Contains("b -> a -> b"));
        Assert.Contains(problems, p => p.Contains("self -> self"));
        Assert.Equal(["--bg"], themes.Single(t => t.Id == "a").Vars.Keys);
        Assert.Equal(["--fg"], themes.Single(t => t.Id == "b").Vars.Keys);
        var c = themes.Single(t => t.Id == "c");   // on a loop member: that one's own colours
        Assert.Equal(["--accent", "--bg"], c.Vars.Keys.Order());
        Assert.Contains(themes, t => t.Id == "self");
    }

    [Fact]
    public void WithoutABaseMissingNamesComeFromTheFallbackOfTheMode()
    {
        var t = Mine([], ("bare", """{ "colors": { "bg": "#101010" } }""")).Single(t => t.Id == "bare");
        Assert.Null(t.BaseId);
        var light = ThemeFile.Complete(t, ThemeFile.Fallback(Css, "light"));
        var dark = ThemeFile.Complete(t, ThemeFile.Fallback(Css, "dark"));
        Assert.Equal(("#101010", "#101010"), (light["--bg"], dark["--bg"]));
        Assert.Equal(("#1f2328", "#d7dae0"), (light["--fg"], dark["--fg"]));
        Assert.Equal(Names.Count, light.Count);
        Assert.Equal(Names.Count, dark.Count);
    }

    [Fact]
    public void LightAndDarkSetEveryName()
    {
        var themes = ThemeFile.Load(Path.Combine(Wwwroot, "themes"), Path.Combine(dir, "none"), Names, []);
        foreach (var id in new[] { "light", "dark" })
        {
            var t = themes.Single(t => t.Id == id);
            Assert.Null(t.BaseId);
            Assert.Equal(Names.Values.Order(), t.Vars.Keys.Order());
        }
    }

    [Fact]
    public void ColoursAsRgb()
    {
        Assert.Equal((0x16, 0x1c, 0x27), ThemeFile.Rgb("#161c27"));
        Assert.Equal((0xff, 0, 0), ThemeFile.Rgb("#f00"));
        Assert.Equal((10, 20, 30), ThemeFile.Rgb("rgba(10, 20, 30, .5)"));
        Assert.Null(ThemeFile.Rgb("red"));
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
        Assert.Equal([null, null, "dark", "dark", "dark", "dark", "light"], themes.Select(t => t.BaseId));
    }

    // ---------- Readable contrast (WCAG 2): text 7:1, dim text and code colours 4.5:1, comments and the accent 3:1 ----------

    public static TheoryData<string> ShippedThemes() => new(Directory.GetFiles(Path.Combine(Wwwroot, "themes"), "*.json")
        .Select(p => Path.GetFileNameWithoutExtension(p)));

    [Theory]
    [MemberData(nameof(ShippedThemes))]
    public void ShippedThemesAreReadable(string id)
    {
        var theme = ThemeFile.Load(Path.Combine(Wwwroot, "themes"), Path.Combine(dir, "none"), Names, []).Single(t => t.Id == id);
        // Resolved through its chain; the fallback never shows (Light and Dark set every name).
        var colours = ThemeFile.Complete(theme, ThemeFile.Fallback(Css, "light"));
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
