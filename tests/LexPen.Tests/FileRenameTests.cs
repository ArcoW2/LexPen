using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class FileRenameTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-rename-" + Guid.NewGuid().ToString("N"));

    public FileRenameTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    string Made(string rel, bool folder = false)
    {
        var path = Path.Combine(dir, rel);
        if (folder) Directory.CreateDirectory(path);
        else { Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.WriteAllText(path, "x"); }
        return path;
    }

    [Theory]
    [InlineData("", "empty")]
    [InlineData("a/b.md", "cannot hold")]
    [InlineData("a:b.md", "cannot hold")]
    [InlineData("a?.md", "cannot hold")]
    [InlineData("name.", "end with")]
    [InlineData("name ", "end with")]
    [InlineData("other.md", "already exists")]
    [InlineData("SUB", "already exists")]
    public void NamesRefused(string name, string why)
    {
        var from = Made("doc.md");
        Made("other.md");
        Made("sub", folder: true);
        Assert.Contains(why, FileRename.Refusal(from, name));
    }

    [Fact]
    public void ANewNameOrOnlyTheCaseIsAllowed()
    {
        var from = Made("doc.md");
        Assert.Null(FileRename.Refusal(from, "notes.txt"));
        Assert.Null(FileRename.Refusal(from, "Doc.md"));
        Assert.Contains("drive", FileRename.Refusal(@"D:\", "x"));
    }

    [Fact]
    public void AFileIsRenamedAlsoInCaseOnly()
    {
        var from = Made("doc.md");
        FileRename.Move(from, Path.Combine(dir, "notes.md"));
        Assert.False(File.Exists(from));
        FileRename.Move(Path.Combine(dir, "notes.md"), Path.Combine(dir, "Notes.md"));
        Assert.Equal("Notes.md", Path.GetFileName(Directory.GetFiles(dir).Single()));
    }

    [Fact]
    public void AFolderIsRenamedWithItsFilesAlsoInCaseOnly()
    {
        Made(@"sub\deep\a.md");
        var from = Path.Combine(dir, "sub");
        FileRename.Move(from, Path.Combine(dir, "Sub"));
        Assert.Equal("Sub", Path.GetFileName(Directory.GetDirectories(dir).Single()));
        FileRename.Move(Path.Combine(dir, "Sub"), Path.Combine(dir, "other"));
        Assert.True(File.Exists(Path.Combine(dir, @"other\deep\a.md")));
    }

    [Fact]
    public void AFileNotThereIsAnError() =>
        Assert.Throws<IOException>(() => FileRename.Move(Path.Combine(dir, "gone.md"), Path.Combine(dir, "x.md")));

    [Theory]
    [InlineData(@"C:\A\doc.md", @"C:\A\new.md")]
    [InlineData(@"c:\a\DOC.md", @"C:\A\new.md")]
    [InlineData(@"C:\A\docs", null)]
    [InlineData(@"C:\A\doc.md.bak", null)]
    public void RenamedFile(string path, string? expected) => Assert.Equal(expected, FileRename.Renamed(path, @"C:\A\doc.md", @"C:\A\new.md"));

    [Theory]
    [InlineData(@"C:\A\sub", @"C:\A\next")]
    [InlineData(@"C:\A\sub\x\y.md", @"C:\A\next\x\y.md")]
    [InlineData(@"c:\a\SUB\y.md", @"C:\A\next\y.md")]
    [InlineData(@"C:\A\subway\y.md", null)]
    public void RenamedFolder(string path, string? expected) => Assert.Equal(expected, FileRename.Renamed(path, @"C:\A\sub", @"C:\A\next"));

    [Fact]
    public void ASessionsPathsFollow()
    {
        var session = JsonNode.Parse("""{"root":"C:\\A\\sub","tabs":[{"path":"C:\\A\\sub\\y.md","n":1},{"path":"C:\\B\\z.md"}],"title":"sub"}""");
        FileRename.RenameIn(session, @"C:\A\sub", @"C:\A\next");
        Assert.Equal("""{"root":"C:\\A\\next","tabs":[{"path":"C:\\A\\next\\y.md","n":1},{"path":"C:\\B\\z.md"}],"title":"sub"}""", session!.ToJsonString());
    }

    [Fact]
    public void TheStoresFollow()
    {
        var bookmarks = new BookmarkStore(Path.Combine(dir, "bookmarks.json"));
        var rulers = new RulerStore(Path.Combine(dir, "rulers.json"));
        var highlights = new HighlightStore(Path.Combine(dir, "highlights.json"));
        var file = Made(@"sub\doc.md");
        var other = Made(@"sub\beside.md");
        JsonArray Mark() => [new JsonObject { ["n"] = 1, ["line"] = 0, ["ch"] = 0, ["text"] = "x" }];
        bookmarks.Set(BookmarkStore.Key(file, null), Mark());
        rulers.Set(BookmarkStore.Key(file, null), [new JsonObject { ["col"] = 4 }]);
        highlights.Set(file, null, Mark(), false);
        highlights.Set(other, null, Mark(), true);

        FileRename.Move(file, Path.Combine(dir, @"sub\new.md"));
        bookmarks.Rename(file, Path.Combine(dir, @"sub\new.md"));
        rulers.Rename(file, Path.Combine(dir, @"sub\new.md"));
        highlights.Rename(file, Path.Combine(dir, @"sub\new.md"));
        FileRename.Move(other, Path.Combine(dir, @"sub\Beside.md"));
        highlights.Rename(other, Path.Combine(dir, @"sub\Beside.md"));
        FileRename.Move(Path.Combine(dir, "sub"), Path.Combine(dir, "next"));
        bookmarks.Rename(Path.Combine(dir, "sub"), Path.Combine(dir, "next"));
        rulers.Rename(Path.Combine(dir, "sub"), Path.Combine(dir, "next"));
        highlights.Rename(Path.Combine(dir, "sub"), Path.Combine(dir, "next"));

        var now = Path.Combine(dir, @"next\new.md");
        Assert.Single(new BookmarkStore(Path.Combine(dir, "bookmarks.json")).Get(BookmarkStore.Key(now, null)));
        Assert.Single(new RulerStore(Path.Combine(dir, "rulers.json")).Open(BookmarkStore.Key(now, null)));
        var again = new HighlightStore(Path.Combine(dir, "highlights.json"));
        Assert.Single(again.Get(now, null)["list"]!.AsArray());
        var lph = Path.Combine(dir, @"next\Beside.md");
        Assert.True(File.Exists(HighlightStore.BesidePath(lph)));
        Assert.Single(again.Get(lph, null)["list"]!.AsArray());
        Assert.Contains(again.All(), e => (string?)e!["path"] == lph && (bool)e["beside"]!);
    }
}
