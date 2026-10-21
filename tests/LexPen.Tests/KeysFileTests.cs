using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class KeysFileTests
{
    const string Defaults = """
        // The default set
        {
          "Ctrl+S": "save",
          "Ctrl+1, S": ["bookmarkStore", 1],
          "Ctrl+T": "theme",   // trailing comma below is fine
        }
        """;

    static JsonObject Keys(JsonObject merged) => merged["keys"]!.AsObject();

    [Theory]
    [InlineData("ctrl+s", "Ctrl+S")]
    [InlineData("Shift+Ctrl+s", "Ctrl+Shift+S")]
    [InlineData("ctrl+k,k", "Ctrl+K, K")]
    [InlineData("Ctrl+1 , Ctrl+1", "Ctrl+1, Ctrl+1")]
    [InlineData("ctrl+shift+pageup", "Ctrl+Shift+PgUp")]
    [InlineData("Alt+ArrowLeft", "Alt+Left")]
    [InlineData("Ctrl+/", "Ctrl+/")]
    [InlineData("Ctrl+Shift+`", "Ctrl+Shift+`")]
    [InlineData("insert", "Ins")]
    [InlineData("ctrl+shift+comma", "Ctrl+Shift+Comma")]
    public void NormalizesKeyNames(string written, string expected) => Assert.Equal(expected, KeysFile.Normalize(written));

    [Theory]
    [InlineData("Ctrl+")]
    [InlineData("Ctrl+Ctrl+S")]
    [InlineData("Win+S")]
    [InlineData("Ctrl+Bogus")]
    [InlineData("Ctrl+A, B, C")]
    public void RefusesWhatIsNotAKey(string written) => Assert.Null(KeysFile.Normalize(written));

    [Fact]
    public void DefaultsOnlyWithCommentsAndParameters()
    {
        var merged = KeysFile.Merge(Defaults, null);
        Assert.Empty(merged["problems"]!.AsArray());
        Assert.Equal("save", (string?)Keys(merged)["Ctrl+S"]);
        Assert.Equal("""["bookmarkStore",1]""", Keys(merged)["Ctrl+1, S"]!.ToJsonString());
    }

    [Fact]
    public void UserKeysOverrideOnePerKeyAndNullRemoves()
    {
        var merged = KeysFile.Merge(Defaults, """{ "shift+ctrl+n": "newFile", "ctrl+s": "saveAs", "Ctrl+T": null }""");
        var keys = Keys(merged);
        Assert.Equal("saveAs", (string?)keys["Ctrl+S"]);
        Assert.Equal("newFile", (string?)keys["Ctrl+Shift+N"]);
        Assert.False(keys.ContainsKey("Ctrl+T"));
        Assert.True(keys.ContainsKey("Ctrl+1, S"));   // untouched default
        Assert.Equal(["Ctrl+Shift+N", "Ctrl+S"], merged["user"]!.AsArray().Select(k => (string?)k));
    }

    [Fact]
    public void ABrokenUserFileLeavesTheDefaults()
    {
        var merged = KeysFile.Merge(Defaults, "{ \"Ctrl+S\": ", "mine.json");
        Assert.Equal("save", (string?)Keys(merged)["Ctrl+S"]);
        Assert.Contains("mine.json", (string?)merged["problems"]![0]);
    }

    [Fact]
    public void ReportsBadEntriesAndKeepsTheRest()
    {
        var merged = KeysFile.Merge(Defaults, """{ "Ctrl+Bogus": "save", "Ctrl+J": 5, "Ctrl+L": "link" }""");
        Assert.Equal(2, merged["problems"]!.AsArray().Count);
        Assert.Equal("link", (string?)Keys(merged)["Ctrl+L"]);
    }

    [Fact]
    public void TheShippedFileParsesWithoutProblems()
    {
        var path = Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder, KeysFile.Name);
        var merged = KeysFile.Merge(File.ReadAllText(path), null);
        Assert.Empty(merged["problems"]!.AsArray());
        Assert.True(Keys(merged).Count > 0);
    }
}
