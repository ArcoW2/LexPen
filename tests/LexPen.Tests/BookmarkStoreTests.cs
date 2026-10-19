using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class BookmarkStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-bookmarks-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, "bookmarks.json");

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonObject Mark(int n, int line, int ch, string text) => new() { ["n"] = n, ["line"] = line, ["ch"] = ch, ["text"] = text };
    static string Place(JsonNode? mark) => $"{(int)mark!["n"]!}:{(int)mark["line"]!}:{(int)mark["ch"]!}";

    [Fact]
    public void SavedListsComeBackAfterARestart()
    {
        var store = new BookmarkStore(FilePath);
        store.Set(BookmarkStore.Key(@"C:\A\Doc.md", null), [Mark(1, 4, 2, "four")]);
        store.Set(BookmarkStore.Key(null, "edit3"), [Mark(0, 0, 0, "x")]);
        var again = new BookmarkStore(FilePath);
        Assert.Equal("1:4:2", Place(again.Get(@"c:\a\doc.md")[0]));
        Assert.Single(again.Get("draft:edit3"));
    }

    [Fact]
    public void AnEmptyListRemovesTheFile()
    {
        var store = new BookmarkStore(FilePath);
        store.Set("c:\\a.md", [Mark(1, 0, 0, "x")]);
        store.Set("c:\\a.md", []);
        Assert.Empty(new BookmarkStore(FilePath).Get("c:\\a.md"));
    }

    [Fact]
    public void StaysWhenItsLineIsUnchanged()
    {
        var resolved = BookmarkStore.Resolve([Mark(2, 1, 3, "beta")], "alpha\nbeta\ngamma");
        Assert.Equal("2:1:3", Place(resolved[0]));
    }

    [Fact]
    public void FindsAMovedLineByItsText()
    {
        // Two lines were inserted above "beta" outside LexPen.
        var resolved = BookmarkStore.Resolve([Mark(1, 1, 2, "beta")], "new\nnew\nalpha\nbeta\ngamma");
        Assert.Equal("1:3:2", Place(resolved[0]));
    }

    [Fact]
    public void TakesTheNearestOfSeveralEqualLines()
    {
        var resolved = BookmarkStore.Resolve([Mark(1, 5, 0, "x")], "x\na\nb\nc\nd\ne\nf\nx\ny");
        Assert.Equal("1:7:0", Place(resolved[0]));
    }

    [Fact]
    public void ColumnPastAShortenedLineGoesToItsEnd()
    {
        var resolved = BookmarkStore.Resolve([Mark(1, 0, 10, "a long line")], "short\r\nnext");
        Assert.Equal("1:0:5", Place(resolved[0]));   // the text is gone: same line number, line end
    }

    [Fact]
    public void BeyondTheEndGoesToTheLastLine()
    {
        var resolved = BookmarkStore.Resolve([Mark(3, 40, 1, "gone")], "one\ntwo");
        Assert.Equal("3:1:1", Place(resolved[0]));
    }
}
