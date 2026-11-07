using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The stored print settings (PrintStore, docs/plans/executed/PLAN-printing.md 3.5): as the stored sorts.
public class PrintStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-prints-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, PrintStore.FileName);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonObject Settings(int from) => new() { ["printer"] = "A printer", ["margins"] = new JsonArray(from, from, from, from) };   // a set of print settings
    static int From(JsonNode? settings) => (int)settings!["margins"]![0]!;

    [Fact]
    public void SettingsComeBackAfterARestart()
    {
        var store = new PrintStore(FilePath);
        store.Save("Second", Settings(2));
        store.Save("first", Settings(1));
        store.SetLast(Settings(7));
        var again = new PrintStore(FilePath);
        Assert.Equal(["first", "Second"], again.List().Select(e => (string)e!["name"]!));
        Assert.Equal(2, From(again.Get("Second")));
        Assert.Equal(7, From(again.Last));
    }

    [Fact]
    public void ANameIsNotCaseSensitive()
    {
        var store = new PrintStore(FilePath);
        store.Save("Names", Settings(1));
        store.Save("NAMES", Settings(3));
        Assert.Single(store.List());
        Assert.Equal("NAMES", (string)store.List()[0]!["name"]!);
        Assert.Equal(3, From(store.Get("names")));
    }

    [Fact]
    public void DeleteRemovesIt()
    {
        var store = new PrintStore(FilePath);
        store.Save("a", Settings(1));
        Assert.True(store.Delete("A"));
        Assert.False(store.Delete("a"));
        Assert.Null(store.Get("a"));
        Assert.Empty(new PrintStore(FilePath).List());
    }

    [Fact]
    public void ADamagedFileIsKeptBesideBeforeTheFirstSave()
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(FilePath, "{ not json");
        var store = new PrintStore(FilePath);
        Assert.Empty(store.List());
        store.Save("a", Settings(1));
        Assert.Equal("{ not json", File.ReadAllText(FilePath + ".damaged"));
        Assert.Single(new PrintStore(FilePath).List());
    }

    [Fact]
    public void TemplatesComeFirstAndStayTemplates()
    {
        var store = new PrintStore(FilePath);
        store.Save("a", Settings(1));
        store.Save("z", Settings(2));
        Assert.True(store.SetTemplate("Z", true));
        store.Save("Z", Settings(5));   // replaced under its name: still a template
        var again = new PrintStore(FilePath);
        Assert.Equal(["Z", "a"], again.List().Select(e => (string)e!["name"]!));
        Assert.True((bool)again.List()[0]!["template"]!);
        Assert.False((bool)again.List()[1]!["template"]!);
        Assert.True(again.SetTemplate("z", false));
        Assert.Equal(["a", "Z"], again.List().Select(e => (string)e!["name"]!));
        Assert.False(again.SetTemplate("none", true));
    }

    [Fact]
    public void RenameKeepsTheSettingsAndRefusesATakenName()
    {
        var store = new PrintStore(FilePath);
        store.Save("a", Settings(1));
        store.Save("b", Settings(2));
        store.SetTemplate("a", true);
        Assert.False(store.Rename("a", "B"));
        Assert.False(store.Rename("none", "c"));
        Assert.True(store.Rename("a", "c"));
        Assert.True(store.Rename("c", "C"));   // its own name in another case
        var again = new PrintStore(FilePath);
        Assert.Equal(["C", "b"], again.List().Select(e => (string)e!["name"]!));
        Assert.Equal(1, From(again.Get("c")));
        Assert.True((bool)again.List()[0]!["template"]!);
        Assert.True(again.Delete("C"));
        Assert.False(again.SetTemplate("C", true));
    }

    [Fact]
    public void NoFileIsNoSettings()
    {
        var store = new PrintStore(FilePath);
        Assert.Empty(store.List());
        Assert.Null(store.Last);
        Assert.False(File.Exists(FilePath));
    }
}
