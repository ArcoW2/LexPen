using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The ribbon (docs/plans/39-PLAN-ribbon.md): ribbon.json read and written (RibbonFile), and the page's rules for a
// group's columns and the key tips (web/ribbonmodel.js under Jint).
public class RibbonTests : IDisposable
{
    static readonly string Model = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "ribbonmodel.js"));
    static readonly string Shipped = Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder, RibbonFile.Name);
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-ribbon-" + Guid.NewGuid().ToString("N"));

    public RibbonTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonElement Js(string expr)
    {
        var engine = new Jint.Engine();
        engine.Execute(Model);
        return JsonDocument.Parse(engine.Evaluate($"JSON.stringify({expr})").ToString()).RootElement;
    }

    // ---------- ribbon.json ----------

    [Fact]
    public void WithoutAFileOfYourOwnTheShippedRibbon()
    {
        var r = RibbonFile.Load(dir, Shipped);
        Assert.False(r["user"]!.GetValue<bool>());
        Assert.Empty(r["problems"]!.AsArray());
        var tabs = r["ribbon"]!["tabs"]!.AsArray().Select(t => t!["name"]!.GetValue<string>());
        Assert.Equal(["File", "Home", "Arrange", "Review", "View", "Tools"], tabs);
    }

    [Fact]
    public void YourRibbonWrittenAndReadBackAndResetGivesTheShippedOne()
    {
        var mine = JsonNode.Parse("""{ "tabs": [ { "name": "Mine", "groups": [ { "name": "G", "corners": { "right": "find" }, "items": [ { "action": "save", "size": "large" }, "divider", { "action": "paste", "params": [3] } ] } ] } ] }""")!;
        RibbonFile.Save(dir, mine);
        var r = RibbonFile.Load(dir, Shipped);
        Assert.True(r["user"]!.GetValue<bool>());
        var g = r["ribbon"]!["tabs"]![0]!["groups"]![0]!;
        Assert.Equal("find", g["corners"]!["right"]!.GetValue<string>());
        Assert.Equal(3, g["items"]![2]!["params"]![0]!.GetValue<int>());
        Assert.Equal("divider", g["items"]![1]!.GetValue<string>());
        RibbonFile.Reset(dir);
        Assert.False(RibbonFile.Load(dir, Shipped)["user"]!.GetValue<bool>());
    }

    [Fact]
    public void WhatMakesNoSenseIsLeftOutAndReported()
    {
        var problems = new JsonArray();
        var r = RibbonFile.Parse("""
            // comments allowed
            { "tabs": [ { "name": "", "groups": [] }, { "name": "T", "groups": [ { "name": "G", "items": [ 12, "divider", { "action": "save" }, { "no": 1 } ] }, { "items": [] } ] } ], }
            """, problems, "test")!;
        Assert.Single(r["tabs"]!.AsArray());
        Assert.Single(r["tabs"]![0]!["groups"]!.AsArray());
        Assert.Equal(2, r["tabs"]![0]!["groups"]![0]!["items"]!.AsArray().Count);   // "divider" and save
        Assert.Equal(4, problems.Count);   // the nameless tab, two items, the nameless group
    }

    [Fact]
    public void AFileThatIsNoRibbonGivesTheShippedOneAndSaysSo()
    {
        File.WriteAllText(Path.Combine(dir, RibbonFile.Name), "{ broken");
        var r = RibbonFile.Load(dir, Shipped);
        Assert.False(r["user"]!.GetValue<bool>());
        Assert.NotEmpty(r["problems"]!.AsArray());
        Assert.NotEmpty(r["ribbon"]!["tabs"]!.AsArray());
    }

    // ---------- The columns of a group ----------

    static string Shape(string items) =>
        string.Join(" ", Js($"ribbonColumns({items}).map(c => c.kind === 'divider' ? '|' : c.kind === 'large' ? 'L' : 'S' + c.items.length)").EnumerateArray().Select(e => e.GetString()));

    [Fact]
    public void LargeSmallTwoAndThreeStackedAndDividers()
    {
        Assert.Equal("L S1 | S3 S2", Shape("""[{ action: 'a', size: 'large' }, { action: 'b' }, 'divider', { action: 'c' }, { action: 'd', stack: true }, { action: 'e', stack: true }, { action: 'f' }, { action: 'g', stack: true }]"""));
    }

    [Fact]
    public void AFourthStackedOneStartsANewColumnAndAStackWithoutASmallOneBeforeItToo()
    {
        Assert.Equal("S3 S1", Shape("""[{ action: 'a' }, { action: 'b', stack: true }, { action: 'c', stack: true }, { action: 'd', stack: true }]"""));
        Assert.Equal("L S1 | S1", Shape("""[{ action: 'a', size: 'large' }, { action: 'b', stack: true }, 'divider', { action: 'c', stack: true }]"""));
    }

    // ---------- Key tips ----------

    static string[] Tips(string names, string own = "[]") => Js($"ribbonTips({names}, {own})").EnumerateArray().Select(e => e.GetString()!).ToArray();

    [Fact]
    public void KeyTipsUniquePerLevelFromTheNamesAButtonsOwnFirst()
    {
        Assert.Equal(["F", "H", "A", "R", "V", "T"], Tips("['File', 'Home', 'Arrange', 'Review', 'View', 'Tools']"));
        var tips = Tips("['Find', 'Find next', 'Find previous', 'Replace']");
        Assert.Equal(tips.Length, tips.Distinct().Count());
        Assert.Equal("F", tips[0]);
        Assert.Equal(["X", "F"], Tips("['Find', 'Find next']", "['X']"));   // its own tip wins
        var many = Tips("['Aa', 'Ab', 'Ac', 'Ad']");
        Assert.Equal(many.Length, many.Distinct().Count());
    }
}
