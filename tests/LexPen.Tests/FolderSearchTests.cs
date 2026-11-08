using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class FolderSearchTests : IDisposable
{
    readonly string root = Path.Combine(Path.GetTempPath(), "LexPen.Search." + Guid.NewGuid().ToString("N"));
    static readonly HashSet<string> None = [];
    static readonly HashSet<string> Markdown = new([".md"], StringComparer.OrdinalIgnoreCase);

    public FolderSearchTests()
    {
        Directory.CreateDirectory(Path.Combine(root, "sub"));
        Directory.CreateDirectory(Path.Combine(root, ".git"));
        Directory.CreateDirectory(Path.Combine(root, "node_modules"));
        File.WriteAllText(Path.Combine(root, "a.md"), "Alpha one\r\nsecond Alpha line\r\nend");
        File.WriteAllText(Path.Combine(root, "sub", "b.md"), "beta\nalpha here\n");
        File.WriteAllText(Path.Combine(root, "code.cs"), "// alpha in code");
        File.WriteAllText(Path.Combine(root, ".git", "x.md"), "alpha");
        File.WriteAllText(Path.Combine(root, "node_modules", "y.md"), "alpha");
        File.WriteAllBytes(Path.Combine(root, "bin.md"), [(byte)'a', (byte)'l', 0, (byte)'p']);
    }

    public void Dispose() => Directory.Delete(root, true);

    static List<string> Names(JsonObject result) =>
        result["files"]!.AsArray().Select(f => Path.GetFileName(f!["path"]!.GetValue<string>())).ToList();

    // The index of definitions (go to definition) lists the folder as the search looks in it: subfolders too, what the
    // tree skips left out, only the extensions asked for, each with the time it was written.
    [Fact]
    public void ListsTheFilesOfTheExtensionsWithTheirTimes()
    {
        var list = FolderSearch.List(root, Markdown);
        var names = list.Select(f => Path.GetFileName(f!["path"]!.GetValue<string>())).ToList();
        Assert.Equal(["a.md", "bin.md", "b.md"], names);   // the search reads bin.md and finds it binary; the list has it
        var time = new DateTime(long.Parse(list[0]!["time"]!.GetValue<string>()), DateTimeKind.Utc);
        Assert.Equal(File.GetLastWriteTimeUtc(Path.Combine(root, "a.md")), time);
    }

    [Fact]
    public void FindsInAllTextFilesButSkipsWhatTheTreeSkips()
    {
        var result = FolderSearch.Search(root, "alpha", ignoreCase: true, extensions: null, None);
        Assert.Equal(["a.md", "code.cs", "b.md"], Names(result));
    }

    [Fact]
    public void KnownExtensionsOnlyAndCase()
    {
        var result = FolderSearch.Search(root, "alpha", ignoreCase: false, extensions: Markdown, None);
        Assert.Equal(["b.md"], Names(result));
    }

    [Fact]
    public void LinesAndColumnsWithCrlf()
    {
        var result = FolderSearch.Search(root, "Alpha", ignoreCase: false, extensions: Markdown, None);
        var matches = result["files"]![0]!["matches"]!.AsArray();
        Assert.Equal(2, matches.Count);
        Assert.Equal(1, matches[1]!["line"]!.GetValue<int>());
        Assert.Equal(7, matches[1]!["col"]!.GetValue<int>());
        Assert.Equal("second Alpha line", matches[1]!["text"]!.GetValue<string>());
    }

    [Fact]
    public void ALineBreakInThePatternMatchesCrlfAndLf()
    {
        // ^p in the page becomes (?:\r\n|\n|\r)
        var result = FolderSearch.Search(root, @"one(?:\r\n|\n|\r)second", ignoreCase: false, extensions: Markdown, None);
        var match = result["files"]![0]!["matches"]![0]!;
        Assert.Equal(0, match["line"]!.GetValue<int>());
        Assert.Equal(1, match["endLine"]!.GetValue<int>());
        Assert.Equal(6, match["endCol"]!.GetValue<int>());
    }

    [Fact]
    public void SkippedFilesAndTheLimit()
    {
        var skip = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Path.Combine(root, "a.md") };
        Assert.Equal(["code.cs", "b.md"], Names(FolderSearch.Search(root, "alpha", true, null, skip)));
        var limited = FolderSearch.Search(root, "alpha", true, null, None, max: 2);
        Assert.True(limited["truncated"]!.GetValue<bool>());
        Assert.Equal(2, limited["files"]!.AsArray().Sum(f => f!["matches"]!.AsArray().Count));
    }
}
