using System.Text.Json;
using System.Text.RegularExpressions;

namespace LexPen.Tests;

// The Theme colours window (docs/plans/executed/PLAN-theme-colours.md): web/themecolourlist.js under Jint, against the colour
// names of the themes; and where each colour of a theme comes from (ThemeFile.Theme.From).
public class ThemeColoursTests : IDisposable
{
    static readonly string Source = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "themecolourlist.js"));
    static readonly string Defaults = Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder);
    static readonly Dictionary<string, string> Names = ThemeFile.Names(new StreamReader(WebFiles.Resource("app.css")!).ReadToEnd());
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-themecolours-" + Guid.NewGuid().ToString("N"));

    public ThemeColoursTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static string Js(string expr)
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        return engine.Evaluate(expr).ToString();
    }

    // The colour names Light and Dark set (they set every colour).
    static HashSet<string> ThemeNames()
    {
        var options = new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };
        var names = new HashSet<string>();
        foreach (var id in new[] { "light", "dark" })
            using (var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(Defaults, "themes", id + ".json")), options))
                foreach (var p in doc.RootElement.GetProperty("colors").EnumerateObject()) names.Add(p.Name);
        return names;
    }

    [Fact]
    public void EveryColourNameIsDescribedOnceAndNothingElse()
    {
        var listed = Js("JSON.stringify(THEME_COLOUR_GROUPS.flatMap(([, list]) => list.map(([key]) => key)))");
        var keys = JsonSerializer.Deserialize<string[]>(listed)!;
        Assert.Equal(keys.Length, keys.Distinct().Count());
        Assert.Equal(ThemeNames().Order(), keys.Order());
        Assert.All(keys, k => Assert.Contains(k, Names.Keys));   // only colour names
        Assert.DoesNotContain("", Js("THEME_COLOUR_GROUPS.flatMap(([, list]) => list.map(([, what]) => what.trim())).join('|')").Split('|'));
    }

    [Fact]
    public void EveryColourNameIsUsedInTheExample()
    {
        var html = Js("themeExampleHtml()");
        var used = Regex.Matches(html, "data-colour=\"([^\"]*)\"").SelectMany(m => m.Groups[1].Value.Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToHashSet();
        Assert.Empty(ThemeNames().Except(used));
        Assert.Empty(used.Except(Names.Keys));   // no name that is not a colour
    }

    [Fact]
    public void EachColourSaysWhichThemeOfItsChainSetIt()
    {
        File.WriteAllText(Path.Combine(dir, "middle.json"), """{ "name": "Middle", "base": "dark", "colors": { "accent": "#123456", "bg": "#111111" } }""");
        File.WriteAllText(Path.Combine(dir, "top.json"), """{ "name": "Top", "base": "middle", "colors": { "bg": "#222222" } }""");
        var problems = new List<string>();
        var top = ThemeFile.Load(Path.Combine(Defaults, "themes"), dir, Names, problems).Single(t => t.Id == "top");
        Assert.Empty(problems);
        Assert.Equal("top", top.From!["--bg"]);          // its own (over Middle's)
        Assert.Equal("middle", top.From["--accent"]);    // its base's
        Assert.Equal("dark", top.From["--hl-keyword"]);  // its base's base
        Assert.Equal(top.Vars.Keys.Order(), top.From.Keys.Order());
    }
}
