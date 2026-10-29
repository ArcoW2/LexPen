using System.Globalization;
using System.Text.RegularExpressions;

namespace LexPen.Tests;

public class ThemeFileTests : IDisposable
{
    static readonly string Defaults = Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder);
    static readonly string Css = new StreamReader(WebFiles.Resource("app.css")!).ReadToEnd();
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
        Assert.Equal("--occurrence-hit", Names["occurrenceHit"]);
        Assert.Equal("--occurrence-box", Names["occurrenceBox"]);
        Assert.Equal("--bracket-match", Names["bracketMatch"]);
        Assert.Equal("--bracket-no-match", Names["bracketNoMatch"]);
        Assert.Equal("--guide6", Names["guide6"]);
        Assert.Equal("--highlight", Names["highlight"]);
        Assert.Equal("--inline-code", Names["inlineCode"]);
        Assert.Equal("--inline-code-fg", Names["inlineCodeFg"]);
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
        return ThemeFile.Load(Path.Combine(Defaults, "themes"), dir, Names, problems);
    }

    [Fact]
    public void AChainOwnColourFirstThenTheBaseThenItsBase()
    {
        var problems = new List<string>();
        var themes = Mine(problems,
            ("lighter", """{ "name": "Lighter ocean", "base": "dark-ocean", "colors": { "bg": "#1d2533" } }"""));
        Assert.Empty(problems);
        var t = themes.Single(t => t.Id == "lighter");
        Assert.Equal(["lighter", "dark-ocean", "dark"], t.Chain);
        Assert.Equal("#1d2533", t.Vars["--bg"]);           // its own
        Assert.Equal("#6aa8ff", t.Vars["--accent"]);       // Dark ocean's
        Assert.Equal("#ff7b72", t.Vars["--hl-keyword"]);   // Dark's
    }

    [Fact]
    public void YourDarkRecoloursEveryThemeOnIt()
    {
        var themes = Mine([], ("dark", """{ "name": "My dark", "colors": { "keyword": "#123456" } }"""));
        Assert.Equal("#123456", themes.Single(t => t.Id == "dark-ocean").Vars["--hl-keyword"]);
        Assert.False(themes.Single(t => t.Id == "dark-ocean").Vars.ContainsKey("--hl-string"));   // My dark has no string: the fallback's
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
        var themes = ThemeFile.Load(Path.Combine(Defaults, "themes"), Path.Combine(dir, "none"), Names, []);
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
        var themes = ThemeFile.Load(Path.Combine(Defaults, "themes"), dir, Names, []);
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
        var themes = ThemeFile.Load(Path.Combine(Defaults, "themes"), Path.Combine(dir, "none"), Names, problems);
        Assert.Empty(problems);
        Assert.Equal(["light", "dark", "black", "dark-forest", "dark-ink-paper", "dark-moonlight", "dark-ocean", "dark-parchment", "dark-pistachio",
            "dark-sand", "dark-wine", "light-blossom", "light-lichen", "light-parchment", "light-pistachio", "light-sand", "light-seafoam",
            "light-sky"], themes.Select(t => t.Id));
        // Every shipped theme builds on Light or Dark, as its file name says (Black on Dark), and has a description.
        Assert.All(themes.Skip(2), t => Assert.Equal(t.Id.StartsWith("light-") ? "light" : "dark", t.BaseId));
        Assert.All(themes, t => Assert.False(string.IsNullOrEmpty(t.Description), t.Id));
        // The Occurrences bar's colours (plan 34) in every shipped theme file itself, not only from its base.
        foreach (var file in Directory.GetFiles(Path.Combine(Defaults, "themes"), "*.json"))
        {
            var text = File.ReadAllText(file);
            Assert.True(text.Contains("\"occurrenceHit\"") && text.Contains("\"occurrenceBox\""), Path.GetFileName(file));
        }
    }

    [Fact]
    public void ADescriptionIsReadAndOneThatIsNoTextIsReported()
    {
        var problems = new List<string>();
        Assert.Equal("a softer blue", ThemeFile.Parse("x", """{ "description": " a softer blue " }""", true, Names, problems, "x.json")!.Description);
        Assert.Null(ThemeFile.Parse("y", """{ "description": 12 }""", true, Names, problems, "y.json")!.Description);
        Assert.Null(ThemeFile.Parse("z", """{ }""", true, Names, problems, "z.json")!.Description);
        Assert.Single(problems, p => p.Contains("\"description\" must be a text"));
    }

    [Fact]
    public void AnOldIdOfARenamedThemeFindsTheNewOne()
    {
        var problems = new List<string>();
        var themes = Mine(problems, ("old", """{ "base": "bluish", "colors": { "bg": "#1d2533" } }"""));
        Assert.Empty(problems);
        Assert.Equal(["old", "dark-ocean", "dark"], themes.Single(t => t.Id == "old").Chain);
        Assert.Equal("dark-ocean", ThemeFile.Current("bluish", id => themes.Any(t => t.Id == id)));
        Assert.Equal("light-parchment", ThemeFile.Current("yellowish", _ => false));
        Assert.Equal("nope", ThemeFile.Current("nope", _ => false));
    }

    [Fact]
    public void YourThemeWithAnOldNameStaysYours()
    {
        var themes = Mine([], ("bluish", """{ "name": "My bluish", "base": "dark" }"""), ("on", """{ "base": "bluish" }"""));
        Assert.Contains(themes, t => t.Id == "bluish" && t.Mine);
        Assert.Equal(["on", "bluish", "dark"], themes.Single(t => t.Id == "on").Chain);
        Assert.Equal("bluish", ThemeFile.Current("bluish", id => themes.Any(t => t.Id == id)));
    }

    // ---------- Readable contrast (WCAG 2): text 7:1, dim text and code colours 4.5:1, comments and the accent 3:1 ----------

    public static TheoryData<string> ShippedThemes() => new(Directory.GetFiles(Path.Combine(Defaults, "themes"), "*.json")
        .Select(p => Path.GetFileNameWithoutExtension(p)));

    [Theory]
    [MemberData(nameof(ShippedThemes))]
    public void ShippedThemesAreReadable(string id)
    {
        var theme = ThemeFile.Load(Path.Combine(Defaults, "themes"), Path.Combine(dir, "none"), Names, []).Single(t => t.Id == id);
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
