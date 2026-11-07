using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class SortStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-sorts-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, SortStore.FileName);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonObject Sort(int from) => new() { ["kind"] = "text", ["keys"] = new JsonArray(new JsonObject { ["from"] = from, ["desc"] = false }) };
    static int From(JsonNode? sort) => (int)sort!["keys"]![0]!["from"]!;

    [Fact]
    public void SortsComeBackAfterARestart()
    {
        var store = new SortStore(FilePath);
        store.Save("Second", Sort(2));
        store.Save("first", Sort(1));
        store.SetLast(Sort(7));
        var again = new SortStore(FilePath);
        Assert.Equal(["first", "Second"], again.List().Select(e => (string)e!["name"]!));
        Assert.Equal(2, From(again.Get("Second")));
        Assert.Equal(7, From(again.Last));
    }

    [Fact]
    public void ANameIsNotCaseSensitive()
    {
        var store = new SortStore(FilePath);
        store.Save("Names", Sort(1));
        store.Save("NAMES", Sort(3));
        Assert.Single(store.List());
        Assert.Equal("NAMES", (string)store.List()[0]!["name"]!);
        Assert.Equal(3, From(store.Get("names")));
    }

    [Fact]
    public void DeleteRemovesIt()
    {
        var store = new SortStore(FilePath);
        store.Save("a", Sort(1));
        Assert.True(store.Delete("A"));
        Assert.False(store.Delete("a"));
        Assert.Null(store.Get("a"));
        Assert.Empty(new SortStore(FilePath).List());
    }

    [Fact]
    public void ADamagedFileIsKeptBesideBeforeTheFirstSave()
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(FilePath, "{ not json");
        var store = new SortStore(FilePath);
        Assert.Empty(store.List());
        store.Save("a", Sort(1));
        Assert.Equal("{ not json", File.ReadAllText(FilePath + ".damaged"));
        Assert.Single(new SortStore(FilePath).List());
    }

    [Fact]
    public void NoFileIsNoSorts()
    {
        var store = new SortStore(FilePath);
        Assert.Empty(store.List());
        Assert.Null(store.Last);
        Assert.False(File.Exists(FilePath));
    }
}
