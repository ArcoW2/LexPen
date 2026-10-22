using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class RulerStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-rulers-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, "file-rulers.json");

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonArray Lines(params int[] cols) => [.. cols.Select(c => (JsonNode)new JsonObject { ["col"] = c, ["colour"] = "var(--tip)", ["kind"] = "tab" })];
    static string Cols(JsonArray lines) => string.Join(",", lines.Select(l => (int)l!["col"]!));

    [Fact]
    public void LinesComeBackAfterARestart()
    {
        var store = new RulerStore(FilePath);
        store.Set(BookmarkStore.Key(@"C:\A\Doc.txt", null), Lines(10, 20));
        store.Set(BookmarkStore.Key(null, "edit3"), Lines(5));
        var again = new RulerStore(FilePath);
        Assert.Equal("10,20", Cols(again.Open(@"c:\a\doc.txt")));
        Assert.Equal("5", Cols(again.Open("draft:edit3")));
    }

    [Fact]
    public void AnEmptyListRemovesTheFile()
    {
        var store = new RulerStore(FilePath);
        store.Set("c:\\a.txt", Lines(4));
        store.Set("c:\\a.txt", []);
        Assert.Empty(new RulerStore(FilePath).Open("c:\\a.txt"));
        Assert.Empty(store.Keys);
    }

    [Fact]
    public void PastTheMaximumTheOldestGoes()
    {
        var store = new RulerStore(FilePath);
        for (var i = 0; i <= RulerStore.Max; i++) store.Set($"c:\\f{i}.txt", Lines(i + 1));
        Assert.Equal(RulerStore.Max, store.Keys.Count());
        Assert.DoesNotContain("c:\\f0.txt", store.Keys);
        Assert.Contains("c:\\f1.txt", store.Keys);
    }

    [Fact]
    public void OpeningAFileMovesItToTheFront()
    {
        var store = new RulerStore(FilePath);
        for (var i = 0; i < RulerStore.Max; i++) store.Set($"c:\\f{i}.txt", Lines(i + 1));
        store.Open("c:\\f0.txt");   // the oldest, now the newest
        store.Set("c:\\new.txt", Lines(7));
        Assert.Contains("c:\\f0.txt", store.Keys);
        Assert.DoesNotContain("c:\\f1.txt", store.Keys);
        Assert.Contains("c:\\new.txt", new RulerStore(FilePath).Keys);
    }

    [Fact]
    public void OpeningAFileWithoutLinesKeepsNothing()
    {
        var store = new RulerStore(FilePath);
        Assert.Empty(store.Open("c:\\none.txt"));
        Assert.Empty(store.Keys);
    }
}
