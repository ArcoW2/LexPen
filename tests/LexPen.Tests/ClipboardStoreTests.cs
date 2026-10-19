namespace LexPen.Tests;

public class ClipboardStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-clips-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, "clipboards.json");

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void EachNumberKeepsItsOwnText()
    {
        var store = new ClipboardStore(FilePath);
        store.Set(1, "one");
        store.Set(9, "nine");
        Assert.Equal("one", store.Get(1));
        Assert.Equal("nine", store.Get(9));
        Assert.Equal("", store.Get(5));
    }

    [Fact]
    public void TextsSurviveARestartButTheWindowsClipboardIsActiveAgain()
    {
        var store = new ClipboardStore(FilePath);
        store.Set(3, "three");
        store.Select(3);
        var again = new ClipboardStore(FilePath);
        Assert.Equal("three", again.Get(3));
        Assert.Equal(0, again.Active);
    }

    [Fact]
    public void TheWindowsClipboardIsNotStoredHere()
    {
        var store = new ClipboardStore(FilePath);
        Assert.Throws<ArgumentException>(() => store.Set(0, "x"));
        Assert.Throws<ArgumentException>(() => store.Get(0));
        store.Select(0);
        Assert.Equal(0, store.Active);
        Assert.Throws<ArgumentOutOfRangeException>(() => store.Select(10));
    }

    [Fact]
    public void ABrokenFileStartsEmpty()
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(FilePath, "{ not json");
        Assert.Equal("", new ClipboardStore(FilePath).Get(1));
    }

    [Theory]
    [InlineData("first line\nsecond", "first line")]
    [InlineData("\n\n  indented\n", "indented")]
    [InlineData("", "")]
    public void PreviewIsTheFirstLineWithText(string text, string expected) => Assert.Equal(expected, ClipboardStore.Preview(text));

    [Fact]
    public void PreviewShortensLongLines()
    {
        var preview = ClipboardStore.Preview(new string('x', 100));
        Assert.Equal(60, preview.Length);
        Assert.EndsWith("...", preview);
    }
}
