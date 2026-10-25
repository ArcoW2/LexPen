using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The layout a window opens with (ProjectStore.LayoutOf, docs/plans/executed/PLAN-settings-layers.md).
public class ProjectLayoutTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-layout-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, ProjectStore.FileName);

    public ProjectLayoutTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonNode WithLayout(bool outline) => new JsonObject { ["layout"] = new JsonObject { ["outline"] = outline } };

    [Fact]
    public void AWindowOpensWithItsOwnLayout()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("A");
        var w = store.AddWindow(p);
        w.Session = WithLayout(true);
        Assert.True(store.LayoutOf(w.Key)!["outline"]!.GetValue<bool>());
    }

    [Fact]
    public void ANewWindowTakesTheLayoutOfTheLastWindowUsedOfItsProject()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("A");
        var older = store.AddWindow(p);
        older.Session = WithLayout(false);
        older.Used = new DateTime(2026, 1, 1);
        var last = store.AddWindow(p);
        last.Session = WithLayout(true);
        last.Used = new DateTime(2026, 2, 1);
        var other = store.NewProject("B");
        store.AddWindow(other).Session = WithLayout(false);

        var fresh = store.AddWindow(p);
        Assert.True(store.LayoutOf(fresh.Key)!["outline"]!.GetValue<bool>());
    }

    [Fact]
    public void ANewProjectHasNoLayoutOfItsOwn()
    {
        var store = ProjectStore.Load(FilePath);
        store.AddWindow(store.NewProject("A")).Session = WithLayout(true);
        var fresh = store.AddWindow(store.NewProject("B"));
        Assert.Null(store.LayoutOf(fresh.Key));   // the default layout of the settings
    }

    [Fact]
    public void TheLayoutGoesRoundTheFileWithTheSession()
    {
        var store = ProjectStore.Load(FilePath);
        var w = store.AddWindow(store.NewProject("A"));
        w.Session = WithLayout(true);
        store.Save();
        Assert.True(ProjectStore.Load(FilePath).LayoutOf(w.Key)!["outline"]!.GetValue<bool>());
    }
}
