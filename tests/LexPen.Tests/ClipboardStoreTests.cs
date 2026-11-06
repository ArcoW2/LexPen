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
    public void TextsSurviveARestart()
    {
        var store = new ClipboardStore(FilePath);
        store.Set(3, "three");
        var again = new ClipboardStore(FilePath);
        Assert.Equal("three", again.Get(3));
    }

    // Which clipboard is active is each window's own (docs/plans/22-PLAN-floating-panel-scope.md 3.5): the store has
    // only the texts.
    [Fact]
    public void TheStoreKeepsTheTextsOnlyNotWhichIsActive()
    {
        var state = new ClipboardStore(FilePath).State();
        Assert.False(state.ContainsKey("active"));
        Assert.Equal(ClipboardStore.Count, state["previews"]!.AsArray().Count);
        ClipboardStore.Check(0);
        ClipboardStore.Check(9);
        Assert.Throws<ArgumentOutOfRangeException>(() => ClipboardStore.Check(10));
        Assert.Throws<ArgumentOutOfRangeException>(() => ClipboardStore.Check(-1));
    }

    [Fact]
    public void TheWindowsClipboardIsNotStoredHere()
    {
        var store = new ClipboardStore(FilePath);
        Assert.Throws<ArgumentException>(() => store.Set(0, "x"));
        Assert.Throws<ArgumentException>(() => store.Get(0));
    }

    [Fact]
    public void ABlockKeepsItsMarkAcrossARestart()
    {
        var store = new ClipboardStore(FilePath);
        store.Set(2, "ab\ncd", column: true);
        store.Set(3, "plain");
        var again = new ClipboardStore(FilePath);
        Assert.Equal("ab\ncd", again.Get(2));
        Assert.True(again.IsColumn(2));
        Assert.False(again.IsColumn(3));
        Assert.False(again.IsColumn(0));
        Assert.True(again.State()["columns"]![2]!.GetValue<bool>());
    }

    [Fact]
    public void ANewTextWithoutTheMarkClearsIt()
    {
        var store = new ClipboardStore(FilePath);
        store.Set(4, "block", column: true);
        store.Set(4, "text");
        Assert.False(store.IsColumn(4));
    }

    [Fact]
    public void AFileOfPlainStringsStillLoads()
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(FilePath, "[\"\", \"one\", \"two\"]");
        var store = new ClipboardStore(FilePath);
        Assert.Equal("two", store.Get(2));
        Assert.False(store.IsColumn(2));
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
