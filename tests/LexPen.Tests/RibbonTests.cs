using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The ribbon (docs/plans/executed/PLAN-ribbon.md): ribbon.json read and written (RibbonFile), and the page's rules for a
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

    // ---------- Drop-down (docs/plans/executed/PLAN-ribbon-drop-down-lists.md) ----------

    [Fact]
    public void ADropDownOnAButtonAndOnACornerIsWrittenAndReadBack()
    {
        var mine = JsonNode.Parse("""{ "tabs": [ { "name": "T", "groups": [ { "name": "G", "corners": { "left": ["paste", 3], "right": { "action": "bookmarks.pane", "open": "dropDown" } }, "items": [ { "action": "clipboards.pane", "open": "dropDown" } ] } ] } ] }""")!;
        RibbonFile.Save(dir, mine);
        var g = RibbonFile.Load(dir, Shipped)["ribbon"]!["tabs"]![0]!["groups"]![0]!;
        Assert.Equal("dropDown", g["items"]![0]!["open"]!.GetValue<string>());
        Assert.Equal("bookmarks.pane", g["corners"]!["right"]!["action"]!.GetValue<string>());
        Assert.Equal("dropDown", g["corners"]!["right"]!["open"]!.GetValue<string>());
        Assert.Equal(3, g["corners"]!["left"]![1]!.GetValue<int>());   // the plain forms still read
    }

    [Fact]
    public void TheShippedClipboardBookmarksAndHighlightsCornersAreDropDowns()
    {
        var tabs = RibbonFile.Load(dir, Shipped)["ribbon"]!["tabs"]!.AsArray();
        JsonNode Corner(string tab, string group) => tabs.First(t => t!["name"]!.GetValue<string>() == tab)!["groups"]!.AsArray()
            .First(g => g!["name"]!.GetValue<string>() == group)!["corners"]!["right"]!;
        foreach (var (tab, group, action) in new[] { ("Home", "Clipboard", "clipboards.pane"), ("Home", "Bookmarks", "bookmarks.pane"), ("Review", "Highlights", "highlight.list") })
        {
            Assert.Equal(action, Corner(tab, group)["action"]!.GetValue<string>());
            Assert.Equal("dropDown", Corner(tab, group)["open"]!.GetValue<string>());
            // The left corner: the same action as its window.
            Assert.Equal(action, tabs.First(t => t!["name"]!.GetValue<string>() == tab)!["groups"]!.AsArray()
                .First(g => g!["name"]!.GetValue<string>() == group)!["corners"]!["left"]!.GetValue<string>());
        }
        Assert.Equal("macro.manage", Corner("Tools", "Macros").GetValue<string>());   // its window, as before
    }

    // ---------- The height (docs/plans/executed/PLAN-ribbon-height-and-collapse.md) ----------

    [Fact]
    public void LowerTheSpacingGoesFirstThenTheTextDownToThreeQuarters()
    {
        JsonElement S(double row) => Js($"ribbonSizes({row.ToString(System.Globalization.CultureInfo.InvariantCulture)})");
        var full = S(30);
        Assert.Equal(1, full.GetProperty("sp").GetDouble());
        Assert.Equal(1, full.GetProperty("f").GetDouble());
        Assert.Equal(32, full.GetProperty("largeIcon").GetInt32());
        Assert.Equal(16, full.GetProperty("arrowRow").GetInt32());
        Assert.Equal(6, S(50.0 / 3).GetProperty("arrowRow").GetInt32());
        var spaced = S(22);   // the spacing at its minimum, the text still its size
        Assert.Equal(0, spaced.GetProperty("sp").GetDouble());
        Assert.Equal(1, spaced.GetProperty("f").GetDouble());
        var lowest = S(50.0 / 3);   // 50 px for the three rows: the text at 3/4
        Assert.Equal(0.75, lowest.GetProperty("f").GetDouble());
        Assert.Equal(16.667, lowest.GetProperty("row").GetDouble());
        // Out of range: the full height and the lowest, never more or less.
        Assert.Equal(30, S(45).GetProperty("row").GetDouble());
        Assert.Equal(0.75, S(5).GetProperty("f").GetDouble());
        Assert.Equal(30, Js("ribbonSizes(undefined)").GetProperty("row").GetDouble());
        // A large button's icon, two label lines and a split's arrow row fit in three rows at every height.
        foreach (var row in new[] { 30.0, 26, 22, 19, 50.0 / 3 })
        {
            var s = S(row);
            var used = s.GetProperty("largeIcon").GetInt32() + 2 * 13 * s.GetProperty("f").GetDouble() * s.GetProperty("lineHeight").GetDouble()
                + 6 * s.GetProperty("sp").GetDouble() + 5 - 3 * s.GetProperty("sp").GetDouble() + s.GetProperty("arrowRow").GetInt32();
            Assert.True(used <= 3 * s.GetProperty("row").GetDouble() + 0.01, $"row {row}: {used}");
            var shared = s.GetProperty("sharedIcon").GetInt32() + 13 * s.GetProperty("f").GetDouble() * s.GetProperty("lineHeight").GetDouble()
                + 6 * s.GetProperty("sp").GetDouble() + 5 - 3 * s.GetProperty("sp").GetDouble() + s.GetProperty("arrowRow").GetInt32();   // sharing its column: two rows, one line
            Assert.True(shared <= 2 * s.GetProperty("row").GetDouble() + 0.01, $"row {row}, shared: {shared}");
        }
    }

    [Fact]
    public void ACornerInEachFormAndBackToAButton()
    {
        Assert.Equal("""{"call":["find"]}""", Js("ribbonCorner('find')").GetRawText());
        Assert.Equal("""{"call":["paste",3]}""", Js("ribbonCorner(['paste', 3])").GetRawText());
        Assert.Equal("""{"call":["clipboards.pane"],"open":"dropDown"}""", Js("ribbonCorner({ action: 'clipboards.pane', open: 'dropDown' })").GetRawText());
        Assert.Equal(JsonValueKind.Null, Js("ribbonCorner(undefined)").ValueKind);
        // A button into a corner: the plainest form that keeps it; and back.
        Assert.Equal("\"find\"", Js("ribbonCornerOf({ action: 'find' })").GetRawText());
        Assert.Equal("""["paste",3]""", Js("ribbonCornerOf({ action: 'paste', params: [3] })").GetRawText());
        Assert.Equal("""{"action":"bookmarks.pane","open":"dropDown"}""", Js("ribbonCornerOf({ action: 'bookmarks.pane', open: 'dropDown' })").GetRawText());
        Assert.Equal("""{"action":"paste","params":[3]}""", Js("ribbonItemOf(['paste', 3])").GetRawText());
        Assert.Equal("""{"action":"bookmarks.pane","open":"dropDown"}""", Js("ribbonItemOf({ action: 'bookmarks.pane', open: 'dropDown' })").GetRawText());
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

    [Fact]
    public void ArrangeHasAModeGroupAfterSelectWithTextColumnAndHexStacked()
    {
        var groups = RibbonFile.Load(dir, Shipped)["ribbon"]!["tabs"]!.AsArray().First(t => t!["name"]!.GetValue<string>() == "Arrange")!
            ["groups"]!.AsArray().ToList();
        var names = groups.Select(g => g!["name"]!.GetValue<string>()).ToList();
        Assert.Equal(names.IndexOf("Select") + 1, names.IndexOf("Mode"));
        var select = groups[names.IndexOf("Select")]!["items"]!.AsArray();
        var modes = groups[names.IndexOf("Mode")]!["items"]!.AsArray();
        Assert.Equal(["text", "column", "hex"], modes.Select(i => i!["params"]![0]!.GetValue<string>()));
        Assert.Equal([false, true, true], modes.Select(i => i!["stack"]?.GetValue<bool>() == true));
        Assert.DoesNotContain(select, i => i is JsonObject o && o["action"]!.GetValue<string>() is "columnMode.toggle" or "editMode.set");
        Assert.DoesNotContain(select, i => i is JsonValue);   // no divider left at its end
    }

    [Fact]
    public void HomeClipboardHasPasteWithImageThenCutCopyAndExchange()
    {
        var clipboard = RibbonFile.Load(dir, Shipped)["ribbon"]!["tabs"]!.AsArray().First(t => t!["name"]!.GetValue<string>() == "Home")!
            ["groups"]!.AsArray().First(g => g!["name"]!.GetValue<string>() == "Clipboard")!["items"]!;
        var cols = Js($"ribbonColumns({clipboard.ToJsonString()}).map(c => c.items.map(x => x.item.action).join(' '))");
        Assert.Equal(["paste pasteImage", "cut copy clipboard.exchange"], cols.EnumerateArray().Select(e => e.GetString()));
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
    public void ASmallOneSharesALargeOnesColumnAboveOrUnder()
    {
        string Order(string items) => string.Join(" ", Js($"ribbonColumns({items}).map(c => c.items.map(x => x.item.action).join(''))").EnumerateArray().Select(e => e.GetString()));
        // Under a large one: one column; a second stacked one starts its own.
        Assert.Equal("ab c", Order("""[{ action: 'a', size: 'large' }, { action: 'b', stack: true }, { action: 'c', stack: true }]"""));
        // A large one stacked under a small one alone: one column, the small one on top; under two small ones: its own.
        Assert.Equal("ab", Order("""[{ action: 'a' }, { action: 'b', size: 'large', stack: true }]"""));
        Assert.Equal("ab c", Order("""[{ action: 'a' }, { action: 'b', stack: true }, { action: 'c', size: 'large', stack: true }]"""));
        Assert.Equal("L", Shape("""[{ action: 'a' }, { action: 'b', size: 'large', stack: true }]"""));
    }

    [Fact]
    public void AFourthStackedOneStartsANewColumnAndAStackWithoutAColumnBeforeItToo()
    {
        Assert.Equal("S3 S1", Shape("""[{ action: 'a' }, { action: 'b', stack: true }, { action: 'c', stack: true }, { action: 'd', stack: true }]"""));
        Assert.Equal("L | S1", Shape("""[{ action: 'a', size: 'large' }, { action: 'b', stack: true }, 'divider', { action: 'c', stack: true }]"""));   // b under a, c alone
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

    static bool PrefixFree(string[] tips) => !tips.Any(a => tips.Any(b => !ReferenceEquals(a, b) && b.StartsWith(a)));

    [Fact]
    public void NoKeyTipStartsAnotherSoNoLetterWaits()
    {
        var tips = Tips("['Print', 'Copy name: Path and filename.ext']", "[null, 'PF']");   // Alt, F, P would run Print before the F
        Assert.Equal("PF", tips[1]);
        Assert.False(tips[0].StartsWith('P'));
        var own = Tips("['Copy path', 'Paste']", "['PF', 'P']");   // two own tips that clash: the second gives way
        Assert.Equal("PF", own[0]);
        Assert.True(PrefixFree(own));
        var full = Tips("['Aa', 'Ab', 'Ac', 'Ad', 'Ba', 'Bb', 'Ca', 'Cb', 'Da', 'Db']");   // two-letter ones needed
        Assert.True(PrefixFree(full));
        Assert.Equal(full.Length, full.Distinct().Count());
    }
}
