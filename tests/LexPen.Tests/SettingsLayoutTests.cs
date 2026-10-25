using System.Text.Json.Nodes;

namespace LexPen.Tests;

// A window's layout in settings.json (docs/plans/executed/PLAN-settings-layers.md): only defaultLayout, the layout a new
// project starts with; the settings that became part of it move there.
public class SettingsLayoutTests
{
    const string Defaults = """
        {
          "theme": "light",
          "defaultLayout": {
            "sidebar": true,     // shown
            "outline": false,
            "ratio": 50,
            "wrap": true,
            "tabBar": "scroll",
          },
        }
        """;

    static JsonObject Parse(string text) => JsonNode.Parse(text)!.AsObject();

    [Fact]
    public void AMovedSettingGoesIntoDefaultLayoutOnce()
    {
        var upgraded = Parse(SettingsFile.Upgrade("""{ "theme": "dark", "wrap": false, "tabBar": "rows" }""")!);
        Assert.False(upgraded.ContainsKey("wrap"));
        Assert.False(upgraded.ContainsKey("tabBar"));
        Assert.Equal("dark", upgraded["theme"]!.GetValue<string>());
        Assert.False(upgraded["defaultLayout"]!["wrap"]!.GetValue<bool>());
        Assert.Equal("rows", upgraded["defaultLayout"]!["tabBar"]!.GetValue<string>());
        Assert.Null(SettingsFile.Upgrade(upgraded.ToJsonString()));   // nothing left to move
    }

    [Fact]
    public void AValueAlreadyInDefaultLayoutWins()
    {
        var upgraded = Parse(SettingsFile.Upgrade("""{ "wrap": false, "defaultLayout": { "wrap": true } }""")!);
        Assert.True(upgraded["defaultLayout"]!["wrap"]!.GetValue<bool>());
        Assert.False(upgraded.ContainsKey("wrap"));
    }

    [Fact]
    public void SettingAMovedSettingSetsItInDefaultLayout()
    {
        var text = Parse(SettingsFile.Set(Defaults, null, "wrap", JsonValue.Create(false)));
        Assert.False(text.ContainsKey("wrap"));
        Assert.False(text["defaultLayout"]!["wrap"]!.GetValue<bool>());
        // Back to the shipped value: gone, and an empty defaultLayout with it.
        Assert.False(Parse(SettingsFile.Set(Defaults, text.ToJsonString(), "wrap", JsonValue.Create(true))).ContainsKey("defaultLayout"));
        Assert.Throws<ArgumentException>(() => SettingsFile.Set(Defaults, null, "wrap", JsonValue.Create("no")));
    }

    [Fact]
    public void TheDefaultLayoutIsOneSetting()
    {
        var merged = SettingsFile.Merge(Defaults, """{ "defaultLayout": { "outline": true } }""");
        Assert.True(merged["values"]!["defaultLayout"]!["outline"]!.GetValue<bool>());
        Assert.Contains("defaultLayout", merged["user"]!.AsArray().Select(n => n!.GetValue<string>()));
        Assert.Empty(merged["problems"]!.AsArray());
    }

    [Fact]
    public void ThePageStorageIsImportedWhereItFitsAndIsNotSetYet()
    {
        var values = new JsonObject
        {
            ["outline"] = true,      // taken
            ["ratio"] = 50,          // the shipped value: not written
            ["sidebar"] = "off",     // the wrong kind: skipped
            ["nope"] = 1,            // not a layout name: skipped
            ["wrap"] = true,         // already yours: yours stays
        };
        var text = Parse(SettingsFile.ImportLayout(Defaults, """{ "theme": "dark", "defaultLayout": { "wrap": false } }""", values));
        var layout = text["defaultLayout"]!.AsObject();
        Assert.True(layout["outline"]!.GetValue<bool>());
        Assert.False(layout["wrap"]!.GetValue<bool>());
        Assert.False(layout.ContainsKey("ratio"));
        Assert.False(layout.ContainsKey("sidebar"));
        Assert.False(layout.ContainsKey("nope"));
        Assert.Equal("dark", text["theme"]!.GetValue<string>());
    }

    [Fact]
    public void TheShippedDefaultsHoldEveryMovedSettingInDefaultLayout()
    {
        var shipped = SettingsFile.Merge(File.ReadAllText(SettingsFile.DefaultsPath), null);
        var layout = shipped["defaults"]!["defaultLayout"]!.AsObject();
        foreach (var name in SettingsFile.MovedToLayout)
        {
            Assert.True(layout.ContainsKey(name), name);
            Assert.False(shipped["defaults"]!.AsObject().ContainsKey(name), name);
        }
    }
}
