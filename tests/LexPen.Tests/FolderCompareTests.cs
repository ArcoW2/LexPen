namespace LexPen.Tests;

public class FolderCompareTests : IDisposable
{
    readonly string root = Path.Combine(Path.GetTempPath(), "lexpen-fc-" + Guid.NewGuid().ToString("N"));
    string Left => Path.Combine(root, "a");
    string Right => Path.Combine(root, "b");

    public FolderCompareTests()
    {
        Directory.CreateDirectory(Left);
        Directory.CreateDirectory(Right);
    }

    public void Dispose() => Directory.Delete(root, true);

    void Write(string side, string rel, string text, DateTime? time = null)
    {
        var path = Path.Combine(side, rel);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, text);
        File.SetLastWriteTimeUtc(path, time ?? new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc));
    }

    string StateOf(List<FolderCompare.Row> rows, string rel) => rows.Single(r => r.Rel == rel).State;

    [Fact]
    public void FirstPassByAttributes()
    {
        Write(Left, "only-left.txt", "x");
        Write(Right, "only-right.txt", "x");
        Write(Left, "size.txt", "abc");
        Write(Right, "size.txt", "abcd");
        Write(Left, "same.txt", "abc");
        Write(Right, "same.txt", "abc");
        Write(Left, @"sub\other-date.txt", "abc");
        Write(Right, @"sub\other-date.txt", "xyz", new DateTime(2026, 2, 1, 12, 0, 0, DateTimeKind.Utc));
        Write(Left, @"sub\fat.txt", "abc");
        Write(Right, @"sub\fat.txt", "abc", new DateTime(2026, 1, 1, 12, 0, 2, DateTimeKind.Utc));   // 2 seconds later
        Directory.CreateDirectory(Path.Combine(Left, ".git"));
        Write(Left, @".git\HEAD", "ref");

        var rows = FolderCompare.List(Left, Right);
        Assert.Equal("<", StateOf(rows, "only-left.txt"));
        Assert.Equal(">", StateOf(rows, "only-right.txt"));
        Assert.Equal("~", StateOf(rows, "size.txt"));
        Assert.Equal("=", StateOf(rows, "same.txt"));
        Assert.Equal("?", StateOf(rows, @"sub\other-date.txt"));
        Assert.Equal("=", StateOf(rows, @"sub\fat.txt"));
        Assert.Equal("", StateOf(rows, "sub"));
        Assert.DoesNotContain(rows, r => r.Rel.StartsWith(".git"));
        // Folders first within a folder, then by name.
        Assert.Equal(["sub", @"sub\fat.txt", @"sub\other-date.txt", "only-left.txt", "only-right.txt", "same.txt", "size.txt"],
            rows.Select(r => r.Rel));
    }

    [Fact]
    public void SecondPassByContents()
    {
        Write(Left, "equal.txt", "same text");
        Write(Right, "equal.txt", "same text", new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));
        Write(Left, "differ.txt", "text one");
        Write(Right, "differ.txt", "text two");
        Assert.True(FolderCompare.SameBytes(Path.Combine(Left, "equal.txt"), Path.Combine(Right, "equal.txt")));
        Assert.False(FolderCompare.SameBytes(Path.Combine(Left, "differ.txt"), Path.Combine(Right, "differ.txt")));
    }

    [Fact]
    public void StoppedWhileChecking()
    {
        Write(Left, "big.txt", new string('x', 1 << 20));
        Write(Right, "big.txt", new string('x', 1 << 20));
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        Assert.Throws<OperationCanceledException>(() => FolderCompare.SameBytes(Path.Combine(Left, "big.txt"), Path.Combine(Right, "big.txt"), stop.Token));
    }

    [Fact]
    public void AsTextWithTheOptions()
    {
        Write(Left, "ws.txt", "  a   b\r\n\r\nC\r\n");
        Write(Right, "ws.txt", "a b  \nc\n");
        var a = Path.Combine(Left, "ws.txt");
        var b = Path.Combine(Right, "ws.txt");
        Assert.False(FolderCompare.SameText(a, b, whitespace: true, ignoreCase: false));   // C against c
        Assert.True(FolderCompare.SameText(a, b, whitespace: true, ignoreCase: true));
        Assert.False(FolderCompare.SameText(a, b, whitespace: false, ignoreCase: true));
    }
}
