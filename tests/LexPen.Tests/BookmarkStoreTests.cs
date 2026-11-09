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

    // ---------- A PDF's (web/pdfbookmarks.js; docs/plans/executed/PLAN-pdf-bookmarks.md) ----------
    static JsonObject PdfMark(int n, int page, int offset, string text) => new() { ["n"] = n, ["page"] = page, ["offset"] = offset, ["text"] = text };

    [Fact]
    public void APdfsListIsKeptAndRenamedWithTheFile()
    {
        var store = new BookmarkStore(FilePath);
        store.Set(BookmarkStore.Key(@"C:\Docs\Ref.pdf", null), [PdfMark(1, 12, 340, "SELECT statement"), PdfMark(0, 3, 0, "Contents")]);
        store.Rename(@"C:\Docs\Ref.pdf", @"C:\Docs\Reference.pdf");
        var again = new BookmarkStore(FilePath);
        Assert.Empty(again.Get(BookmarkStore.Key(@"C:\Docs\Ref.pdf", null)));
        var list = again.Get(BookmarkStore.Key(@"C:\Docs\Reference.pdf", null));
        Assert.Equal("1:12:340:SELECT statement|0:3:0:Contents", string.Join("|", list.Select(m => $"{(int)m!["n"]!}:{(int)m["page"]!}:{(int)m["offset"]!}:{(string)m["text"]!}")));
    }

    static readonly string PdfModel = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "pdfbookmarks.js"));

    // pdfResolveMarks under Jint, given the pages' texts of another version of the file.
    static string ResolvePdf(string list, string texts)
    {
        var engine = new Jint.Engine();
        engine.Execute(PdfModel);
        return engine.Evaluate($"(() => {{ const r = pdfResolveMarks({list}, {texts}); return r.list.map(b => b.n + ':' + b.page + ':' + b.offset).join('|') + (r.changed ? ' changed' : ''); }})()").ToString();
    }

    [Fact]
    public void APdfBookmarkStaysWhereItsTextStillIs()
        => Assert.Equal("1:2:6", ResolvePdf("[{ n: 1, page: 2, offset: 6, text: 'SELECT statement' }]", @"['one', 'Intro\nSELECT statement']"));

    [Fact]
    public void APdfBookmarkMovedAPageDownIsFoundByItsText()
        => Assert.Equal("1:3:4 changed", ResolvePdf("[{ n: 1, page: 2, offset: 6, text: 'SELECT statement' }]", @"['one', 'a new page', 'See\nSELECT statement']"));

    [Fact]
    public void APdfBookmarkWhoseTextIsGoneStaysWhereItWas()
        => Assert.Equal("0:2:6", ResolvePdf("[{ n: 0, page: 2, offset: 6, text: 'SELECT statement' }]", @"['one', 'Intro\nUPDATE statement', 'three']"));

    [Fact]
    public void OfTwoPagesWithItsTextTheNearestWins()
        => Assert.Equal("2:4:0 changed", ResolvePdf("[{ n: 2, page: 5, offset: 0, text: 'Index' }]", "['Index', 'x', 'x', 'Index', 'x', 'x']"));
}
