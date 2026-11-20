using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class SettingsFileTests
{
    const string Defaults = """
        // comment
        {
          "theme": "light",   // light or dark
          "wrap": true,
          "editorSize": 0,
        }
        """;

    static JsonObject Values(JsonObject merged) => merged["values"]!.AsObject();

    [Fact]
    public void YourFileGoesOnTopOfTheDefaults()
    {
        var merged = SettingsFile.Merge(Defaults, """{ "theme": "dark", "editorSize": 12 }""");
        Assert.Equal("dark", Values(merged)["theme"]!.GetValue<string>());
        Assert.Equal(12, Values(merged)["editorSize"]!.GetValue<int>());
        Assert.True(Values(merged)["wrap"]!.GetValue<bool>());
        Assert.Equal(["theme", "editorSize"], merged["user"]!.AsArray().Select(n => n!.GetValue<string>()));
        Assert.Empty(merged["problems"]!.AsArray());
    }

    [Fact]
    public void AValueEqualToTheDefaultIsNotYours()
    {
        var merged = SettingsFile.Merge(Defaults, """{ "wrap": true }""");
        Assert.Empty(merged["user"]!.AsArray());
    }

    [Fact]
    public void UnknownNamesAndWrongKindsAreReportedAndSkipped()
    {
        var merged = SettingsFile.Merge(Defaults, """{ "nope": 1, "wrap": "yes", "theme": "dark" }""", "mine");
        var problems = merged["problems"]!.AsArray().Select(p => p!.GetValue<string>()).ToList();
        Assert.Equal(2, problems.Count);
        Assert.Contains(problems, p => p.Contains("\"nope\" is not a setting"));
        Assert.Contains(problems, p => p.Contains("\"wrap\" needs true or false"));
        Assert.True(Values(merged)["wrap"]!.GetValue<bool>());
        Assert.Equal("dark", Values(merged)["theme"]!.GetValue<string>());
    }

    [Fact]
    public void AFileThatCannotBeReadLeavesTheDefaults()
    {
        var merged = SettingsFile.Merge(Defaults, "{ broken", "mine");
        Assert.Single(merged["problems"]!.AsArray());
        Assert.Equal("light", Values(merged)["theme"]!.GetValue<string>());
    }

    [Fact]
    public void SetKeepsOnlyWhatDiffers()
    {
        var text = SettingsFile.Set(Defaults, null, "theme", JsonValue.Create("dark"));
        text = SettingsFile.Set(Defaults, text, "editorSize", JsonValue.Create(12));
        Assert.Equal(["theme", "editorSize"], JsonNode.Parse(text)!.AsObject().Select(p => p.Key));
        text = SettingsFile.Set(Defaults, text, "theme", JsonValue.Create("light"));   // the default again
        Assert.Equal(["editorSize"], JsonNode.Parse(text)!.AsObject().Select(p => p.Key));
    }

    [Fact]
    public void SetRefusesWrongNamesAndKinds()
    {
        Assert.Throws<ArgumentException>(() => SettingsFile.Set(Defaults, null, "nope", JsonValue.Create(1)));
        Assert.Throws<ArgumentException>(() => SettingsFile.Set(Defaults, null, "wrap", JsonValue.Create("no")));
    }

    const string Family = """{ "openIn.*": "", "wrap": true }""";

    [Fact]
    public void AFamilyOfSettings()
    {
        var merged = SettingsFile.Merge(Family, """{ "openIn.sql": "preview", "openIn.json": 1, "openInsql": "x" }""", "mine");
        Assert.Equal("preview", Values(merged)["openIn.sql"]!.GetValue<string>());
        Assert.Equal(["openIn.sql"], merged["user"]!.AsArray().Select(n => n!.GetValue<string>()));
        Assert.Equal(2, merged["problems"]!.AsArray().Count);   // a number for a text, and no family without the dot
        var text = SettingsFile.Set(Family, null, "openIn.markdown", JsonValue.Create("split"));
        Assert.Contains("openIn.markdown", text);
        Assert.DoesNotContain("openIn", SettingsFile.Set(Family, text, "openIn.markdown", JsonValue.Create("")));   // the default again
    }

    [Fact]
    public void ARenamedSettingMovesOver()
    {
        var own = JsonNode.Parse(SettingsFile.Upgrade("""{ "openMarkdownIn": "preview", "theme": "dark" }""")!)!.AsObject();
        Assert.Equal(["theme", "openIn.markdown"], own.Select(p => p.Key));
        Assert.Equal("preview", own["openIn.markdown"]!.GetValue<string>());
        // A newer choice wins.
        own = JsonNode.Parse(SettingsFile.Upgrade("""{ "openMarkdownIn": "preview", "openIn.markdown": "edit" }""")!)!.AsObject();
        Assert.Equal("edit", own["openIn.markdown"]!.GetValue<string>());
        Assert.Null(SettingsFile.Upgrade("""{ "theme": "dark" }"""));
    }

    // A setting that went (explorerShell, plan 40): removed from your file, the others as they were.
    [Fact]
    public void ARetiredSettingGoes()
    {
        var own = JsonNode.Parse(SettingsFile.Upgrade("""{ "explorerShell": true, "explorerCompare": true }""")!)!.AsObject();
        Assert.Equal(["explorerCompare"], own.Select(p => p.Key));
    }

    // occurrences.bar (on / off) became a choice: on is always, off never; a choice already there stays.
    [Theory]
    [InlineData("true", "always")]
    [InlineData("false", "never")]
    public void TheOccurrencesBarSettingBecomesAChoice(string old, string now)
    {
        var own = JsonNode.Parse(SettingsFile.Upgrade("{ \"occurrences.bar\": " + old + " }")!)!.AsObject();
        Assert.Equal(now, own["occurrences.bar"]!.GetValue<string>());
        Assert.Null(SettingsFile.Upgrade("{ \"occurrences.bar\": \"active\" }"));
    }

    // occurrences.markFirst (on / off) became occurrences.first (a choice): on is underline, off as the others.
    [Theory]
    [InlineData("true", "underline")]
    [InlineData("false", "same")]
    public void TheFirstOccurrenceSettingMovesOver(string old, string now)
    {
        var own = JsonNode.Parse(SettingsFile.Upgrade("{ \"occurrences.markFirst\": " + old + " }")!)!.AsObject();
        Assert.Equal(["occurrences.first"], own.Select(p => p.Key));
        Assert.Equal(now, own["occurrences.first"]!.GetValue<string>());
    }

    // askSaveDrafts (on / off) became changedDrafts (a choice): on asks, off keeps them as drafts.
    [Theory]
    [InlineData("true", "ask")]
    [InlineData("false", "keep")]
    public void TheAskSaveDraftsSettingMovesOver(string old, string now)
    {
        var own = JsonNode.Parse(SettingsFile.Upgrade("{ \"askSaveDrafts\": " + old + " }")!)!.AsObject();
        Assert.Equal(["changedDrafts"], own.Select(p => p.Key));
        Assert.Equal(now, own["changedDrafts"]!.GetValue<string>());
    }

    [Fact]
    public void TheShippedDefaultsAreReadable()
    {
        var merged = SettingsFile.Merge(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder, SettingsFile.Name)), null);
        Assert.Empty(merged["problems"]!.AsArray());
        Assert.Equal("light", Values(merged)["theme"]!.GetValue<string>());
    }
}
