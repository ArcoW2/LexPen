namespace LexPen.Tests;

public class DraftStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "LexPen.Tests." + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void NextIdIsTheLowestFreeNumber()
    {
        Assert.Equal("edit1", DraftStore.NextId([]));
        Assert.Equal("edit2", DraftStore.NextId(["edit1", "edit3"]));
        Assert.Equal("edit3", DraftStore.NextId(["EDIT1", "edit2"]));
    }

    [Fact]
    public void IdsAreNotHandedOutTwiceAndSkipDraftsOnDisk()
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "edit1.md"), "x");
        var store = new DraftStore(dir);
        Assert.Equal("edit2", store.NewId());
        Assert.Equal("edit3", store.NewId());
    }

    [Fact]
    public void WriteLoadAndDelete()
    {
        var store = new DraftStore(dir);
        store.Write("edit2", "two");
        store.Write("edit10", "ten");
        store.Write("edit2", "two again");   // in order: the last write wins
        store.Flush();

        var loaded = new DraftStore(dir).LoadAll();
        Assert.Equal(["edit2", "edit10"], loaded.Select(d => d!["id"]!.GetValue<string>()));
        Assert.Equal("two again", loaded[0]!["text"]!.GetValue<string>());

        store.Delete("edit2");
        store.Flush();
        Assert.False(File.Exists(Path.Combine(dir, "edit2.md")));
    }

    [Fact]
    public void OnlyEditIdsAreAccepted()
    {
        var store = new DraftStore(dir);
        Assert.Throws<ArgumentException>(() => store.Write(@"..\evil", "x"));
        Assert.Throws<ArgumentException>(() => store.Delete("edit1.md"));
    }
}
