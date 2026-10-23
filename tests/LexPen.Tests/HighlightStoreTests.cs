using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The highlights' store (docs/plans/executed/PLAN-highlights.md): in highlights.json, or next to the file as name.ext.lph.
public class HighlightStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-hl-" + Guid.NewGuid().ToString("N"));
    string StorePath => Path.Combine(dir, "state", "highlights.json");

    public HighlightStoreTests() => Directory.CreateDirectory(dir);
    public void Dispose() => Directory.Delete(dir, true);

    string File1(string name = "Report.md", string text = "one two three")
    {
        var path = Path.Combine(dir, name);
        File.WriteAllText(path, text);
        return path;
    }

    static JsonArray List(params string[] texts) =>
        new(texts.Select(t => (JsonNode?)new JsonObject { ["from"] = new JsonArray(0, 0), ["to"] = new JsonArray(0, t.Length), ["text"] = t }).ToArray());

    [Fact]
    public void InTheStoreWithTheFilesStamp()
    {
        var file = File1();
        var store = new HighlightStore(StorePath);
        Assert.Equal("store", store.Set(file, null, List("one"), false));
        var got = new HighlightStore(StorePath).Get(file, null);   // read back from disk
        Assert.Equal("one", got["list"]![0]!["text"]!.GetValue<string>());
        Assert.False(got["beside"]!.GetValue<bool>());
        Assert.Equal(got["nowSize"]!.GetValue<long>(), got["size"]!.GetValue<long>());
        Assert.Equal(got["nowTime"]!.GetValue<string>(), got["time"]!.GetValue<string>());
        Assert.False(File.Exists(HighlightStore.BesidePath(file)));
    }

    [Fact]
    public void BesideTheFileAndMovedBack()
    {
        var file = File1();
        var store = new HighlightStore(StorePath);
        Assert.Equal("beside", store.Set(file, null, List("two"), true));
        Assert.True(File.Exists(file + ".lph"));
        var got = new HighlightStore(StorePath).Get(file, null);
        Assert.True(got["beside"]!.GetValue<bool>());
        Assert.Equal("two", got["list"]![0]!["text"]!.GetValue<string>());
        // The setting back to the store: written there, the .lph gone.
        Assert.Equal("store", store.Set(file, null, List("two"), false));
        Assert.False(File.Exists(file + ".lph"));
        Assert.False(store.Get(file, null)["beside"]!.GetValue<bool>());
    }

    [Fact]
    public void ABesideFileWinsWhenReading()
    {
        var file = File1();
        var store = new HighlightStore(StorePath);
        store.Set(file, null, List("store one"), false);
        File.WriteAllText(file + ".lph", new JsonObject { ["list"] = List("came with the file") }.ToJsonString());
        Assert.Equal("came with the file", store.Get(file, null)["list"]![0]!["text"]!.GetValue<string>());
    }

    [Fact]
    public void NoneLeftGoneFromBoth()
    {
        var file = File1();
        var store = new HighlightStore(StorePath);
        store.Set(file, null, List("x"), true);
        store.Set(file, null, [], true);
        Assert.False(File.Exists(file + ".lph"));
        Assert.Empty(store.Get(file, null)["list"]!.AsArray());
        Assert.Empty(store.All());
    }

    [Fact]
    public void AllFilesWithTheirPathAsWritten()
    {
        var a = File1("A.md"); var b = File1("B.sql");
        var store = new HighlightStore(StorePath);
        store.Set(a, null, List("1", "2"), false);
        store.Set(b, null, List("3"), true);
        store.Set(null, "d1", List("4"), false);
        var all = store.All().Select(e => (e!["path"]?.GetValue<string>() ?? "draft " + e["draft"]!.GetValue<string>()) + " " + e["count"] + " " + e["beside"]).Order();
        Assert.Equal(new[] { $"{a} 2 false", $"{b} 1 true", "draft d1 1 false" }.Order(), all);
    }

    [Fact]
    public void MovedRenamedDeletedAndADraftSaved()
    {
        var a = File1("A.md");
        var store = new HighlightStore(StorePath);
        store.Set(a, null, List("x"), true);
        var moved = Path.Combine(dir, "Moved.md");
        File.Move(a, moved);
        store.Move(a, moved);
        Assert.True(File.Exists(moved + ".lph"));
        Assert.Equal("x", store.Get(moved, null)["list"]![0]!["text"]!.GetValue<string>());
        store.Delete(moved);
        Assert.False(File.Exists(moved + ".lph"));
        // A draft saved as a file: its highlights go along, where the setting says.
        store.Set(null, "d7", List("draft text"), false);
        var saved = File1("Saved.md");
        store.DraftSaved("d7", saved, true);
        Assert.True(File.Exists(saved + ".lph"));
        Assert.Empty(store.Get(null, "d7")["list"]!.AsArray());
    }

    [Fact]
    public void AllMovedToTheOtherPlace()
    {
        var a = File1("A.md"); var b = File1("B.md");
        var store = new HighlightStore(StorePath);
        store.Set(a, null, List("1"), false);
        store.Set(b, null, List("2"), false);
        Assert.Equal(2, store.MoveAll(true));
        Assert.True(File.Exists(a + ".lph") && File.Exists(b + ".lph"));
        Assert.Equal(2, store.MoveAll(false));
        Assert.False(File.Exists(a + ".lph") || File.Exists(b + ".lph"));
        Assert.Equal("1", store.Get(a, null)["list"]![0]!["text"]!.GetValue<string>());
    }
}
