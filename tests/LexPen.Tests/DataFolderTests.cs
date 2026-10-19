using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class DataFolderTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-data-" + Guid.NewGuid().ToString("N"));
    string State => Path.Combine(dir, "State");

    public DataFolderTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    void OldLayout()
    {
        File.WriteAllText(Path.Combine(dir, "settings.json"),
            """{"Theme":"dark","X":10,"Y":20,"Width":900,"Height":700,"Maximized":true,"RecentFiles":["a.md"],"RecentFolders":["D:\\p"],"ClosedFiles":[],"FavouriteFiles":["f.md"]}""");
        File.WriteAllText(Path.Combine(dir, "session.json"), "{}");
        File.WriteAllText(Path.Combine(dir, "clipboards.json"), "[]");
        File.WriteAllText(Path.Combine(dir, "bookmarks.json"), "{}");
        Directory.CreateDirectory(Path.Combine(dir, "Drafts"));
        File.WriteAllText(Path.Combine(dir, "Drafts", "edit1.md"), "draft");
        Directory.CreateDirectory(Path.Combine(dir, "EBWebView", "Default"));
        File.WriteAllText(Path.Combine(dir, "EBWebView", "Default", "x"), "browser data");
    }

    [Fact]
    public void TheOldSettingsAreSplitIntoStateFavouritesAndSettings()
    {
        OldLayout();
        DataFolder.Migrate(dir);
        var state = JsonNode.Parse(File.ReadAllText(Path.Combine(State, "state.json")))!;
        Assert.Equal(900, state["Width"]!.GetValue<int>());
        Assert.Equal("a.md", state["RecentFiles"]![0]!.GetValue<string>());
        Assert.Null(state["Theme"]);
        Assert.Null(state["FavouriteFiles"]);
        Assert.Equal("f.md", JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "favourites.json")))![0]!.GetValue<string>());
        var settings = JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "settings.json")))!.AsObject();
        Assert.Equal(["theme"], settings.Select(p => p.Key));
        Assert.Equal("dark", settings["theme"]!.GetValue<string>());
        Assert.True(File.Exists(Path.Combine(State, "settings-before-move.json")));
    }

    [Fact]
    public void StateFilesAndFoldersMoveWithTheirContents()
    {
        OldLayout();
        DataFolder.Migrate(dir);
        foreach (var name in new[] { "session.json", "clipboards.json", "bookmarks.json" })
        {
            Assert.False(File.Exists(Path.Combine(dir, name)));
            Assert.True(File.Exists(Path.Combine(State, name)));
        }
        Assert.Equal("draft", File.ReadAllText(Path.Combine(State, "Drafts", "edit1.md")));
        Assert.Equal("browser data", File.ReadAllText(Path.Combine(State, "EBWebView", "Default", "x")));
        Assert.False(Directory.Exists(Path.Combine(dir, "EBWebView")));
    }

    [Fact]
    public void RunningItAgainChangesNothing()
    {
        OldLayout();
        DataFolder.Migrate(dir);
        File.WriteAllText(Path.Combine(dir, "settings.json"), """{ "wrap": false }""");
        DataFolder.Migrate(dir);
        Assert.Equal("""{ "wrap": false }""", File.ReadAllText(Path.Combine(dir, "settings.json")));
    }

    [Fact]
    public void AFileInUseStaysWhereItIsAndIsFoundThere()
    {
        OldLayout();
        using (File.Open(Path.Combine(dir, "session.json"), FileMode.Open, FileAccess.Read, FileShare.None))
            DataFolder.Migrate(dir);
        Assert.Equal(Path.Combine(dir, "session.json"), DataFolder.StatePath(dir, "session.json"));
        DataFolder.Migrate(dir);   // the next start
        Assert.Equal(Path.Combine(State, "session.json"), DataFolder.StatePath(dir, "session.json"));
    }

    [Fact]
    public void ANewDataFolderGetsTheNewLayout()
    {
        DataFolder.Migrate(dir);
        Assert.True(Directory.Exists(State));
        Assert.Equal(Path.Combine(State, "session.json"), DataFolder.StatePath(dir, "session.json"));
        Assert.False(File.Exists(Path.Combine(dir, "settings.json")));
    }
}
