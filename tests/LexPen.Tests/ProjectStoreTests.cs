using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class ProjectStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-projects-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, ProjectStore.FileName);

    public ProjectStoreTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    // A session with the given files in the first pane ("edit1": a draft).
    static JsonNode Session(params string[] files) => new JsonObject
    {
        ["panes"] = new JsonArray(new JsonObject
        {
            ["tabs"] = new JsonArray(files.Select(f => (JsonNode?)(f.StartsWith("edit") ? new JsonObject { ["draft"] = f } : new JsonObject { ["path"] = f })).ToArray()),
        }),
    };

    [Fact]
    public void ProjectsAndWindowsGoRoundTheFile()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("LexPen");
        var w = store.AddWindow(p);
        w.Session = Session(@"D:\a.md");
        (w.Bounds, w.Maximized, w.Desktop) = ([10, 20, 800, 600], true, "8a3e2d5c-0000-4000-8000-000000000001");
        store.Save();
        Assert.False(File.Exists(FilePath + ".tmp"));
        var again = ProjectStore.Load(FilePath);
        var p2 = Assert.Single(again.Projects);
        Assert.Equal(("LexPen", p.Id), (p2.Name, p2.Id));
        var w2 = Assert.Single(p2.Windows);
        Assert.Equal([10, 20, 800, 600], w2.Bounds!);
        Assert.True(w2.Maximized && w2.Open);
        Assert.Equal(w.Desktop, w2.Desktop);
        Assert.True(ProjectStore.HasFiles(w2));
        // Numbers are never reused.
        Assert.True(again.NewProject("").Id > p.Id);
        Assert.True(again.AddWindow(p2).Key > w.Key);
    }

    [Fact]
    public void TheOldSessionBecomesProjectOne()
    {
        var store = ProjectStore.Load(FilePath, Session(@"D:\a.md"), [1, 2, 3, 4], false);
        var p = Assert.Single(store.Projects);
        Assert.Equal(("Project 1", 1), (ProjectStore.Display(p), p.Id));
        var w = Assert.Single(p.Windows);
        Assert.True(w.Open);
        Assert.Equal([1, 2, 3, 4], w.Bounds!);
    }

    [Fact]
    public void AnInterruptedWriteKeepsTheOldFile()
    {
        var store = ProjectStore.Load(FilePath);
        store.NewProject("Kept");
        store.Save();
        File.WriteAllText(FilePath + ".tmp", "{ broken");   // a crash between writing and replacing
        Assert.Equal("Kept", Assert.Single(ProjectStore.Load(FilePath).Projects).Name);
    }

    [Fact]
    public void ClosingOneOfTwoWindowsOfAProjectForgetsIt()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("");
        var a = store.AddWindow(p);
        var b = store.AddWindow(p);
        a.Session = Session(@"D:\a.md");
        b.Session = Session(@"D:\b.md");
        store.CloseByHand(a.Key, keepUnnamed: true);
        Assert.Equal([b.Key], p.Windows.Select(w => w.Key));
        Assert.Contains(p, store.Projects);
    }

    [Fact]
    public void TheLastWindowOfAProjectClosesTheProject()
    {
        var store = ProjectStore.Load(FilePath);
        var named = store.NewProject("Docs");
        var w = store.AddWindow(named);
        w.Session = Session(@"D:\a.md");
        store.CloseByHand(w.Key, keepUnnamed: true);
        Assert.False(Assert.Single(named.Windows).Open);   // kept for when the project is opened again
        Assert.Contains(named, store.Projects);
    }

    [Fact]
    public void UnnamedProjects()
    {
        var store = ProjectStore.Load(FilePath);
        // With files, kept as "Project n" (the setting on).
        var kept = store.NewProject("");
        var w1 = store.AddWindow(kept);
        w1.Session = Session(@"D:\a.md");
        store.CloseByHand(w1.Key, keepUnnamed: true);
        Assert.Contains(kept, store.Projects);
        // Without files: dropped.
        var empty = store.NewProject("");
        var w2 = store.AddWindow(empty);
        store.CloseByHand(w2.Key, keepUnnamed: true);
        Assert.DoesNotContain(empty, store.Projects);
        // The setting off: dropped, files or not.
        var off = store.NewProject("");
        var w3 = store.AddWindow(off);
        w3.Session = Session(@"D:\b.md");
        store.CloseByHand(w3.Key, keepUnnamed: false);
        Assert.DoesNotContain(off, store.Projects);
        // A named one without files stays, without windows.
        var named = store.NewProject("Named");
        var w4 = store.AddWindow(named);
        store.CloseByHand(w4.Key, keepUnnamed: false);
        Assert.Contains(named, store.Projects);
        Assert.Empty(named.Windows);
    }

    [Fact]
    public void MovingTheLastWindowOutOfAProject()
    {
        var store = ProjectStore.Load(FilePath);
        var unnamed = store.NewProject("");
        var named = store.NewProject("Named");
        var target = store.NewProject("Target");
        var a = store.AddWindow(unnamed);
        a.Session = Session(@"D:\a.md");
        var b = store.AddWindow(named);
        store.MoveWindow(a.Key, target, keepUnnamed: true);
        Assert.DoesNotContain(unnamed, store.Projects);   // its files went with the window
        store.MoveWindow(b.Key, target, keepUnnamed: true);
        Assert.Contains(named, store.Projects);           // named: stays, without windows
        Assert.Equal([a.Key, b.Key], target.Windows.Select(w => w.Key));
    }

    [Fact]
    public void AtStartAWindowWithoutFilesOnlyAsTheOneOfItsDesktop()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("P");
        var withFiles = store.AddWindow(p);
        withFiles.Session = Session(@"D:\a.md");
        withFiles.Desktop = "d1";
        var emptyBeside = store.AddWindow(p);
        emptyBeside.Desktop = "d1";
        var onlyOne = store.AddWindow(store.NewProject("Q"));
        onlyOne.Desktop = "d2";
        var closed = store.AddWindow(p);
        closed.Session = Session(@"D:\c.md");
        closed.Open = false;
        var start = store.StartWindows(keepUnnamed: true);
        Assert.Equal([withFiles.Key, onlyOne.Key], start.Select(s => s.Window.Key));
        Assert.DoesNotContain(emptyBeside, p.Windows);   // forgotten
        Assert.Contains(closed, p.Windows);              // a closed window stays closed, kept
    }

    [Fact]
    public void DraftsBelongToTheirWindows()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("");
        var a = store.AddWindow(p);
        a.Session = Session("edit1", @"D:\a.md", "edit3");
        var b = store.AddWindow(p);
        b.Session = Session("edit2");
        b.Open = false;
        Assert.Equal(["edit1", "edit3"], ProjectStore.DraftsOf(a));
        Assert.Equal(["edit1", "edit2", "edit3"], store.AllDrafts().Order());
    }

    [Fact]
    public void TheLastProjectClosedOnADesktop()
    {
        var store = ProjectStore.Load(FilePath);
        var older = store.NewProject("Older");
        var newer = store.NewProject("Newer");
        var elsewhere = store.NewProject("Elsewhere");
        var stillOpen = store.NewProject("Open");
        foreach (var (p, desktop) in new[] { (older, "d1"), (newer, "d1"), (elsewhere, "d2"), (stillOpen, "d1") })
        {
            var w = store.AddWindow(p);
            (w.Session, w.Desktop) = (Session(@"D:\a.md"), desktop);
        }
        store.CloseByHand(older.Windows[0].Key, keepUnnamed: true);
        Thread.Sleep(20);
        store.CloseByHand(newer.Windows[0].Key, keepUnnamed: true);
        store.CloseByHand(elsewhere.Windows[0].Key, keepUnnamed: true);
        Assert.Same(newer, store.LastClosedOn("d1"));   // the most recently closed there; an open project does not count
        Assert.Same(elsewhere, store.LastClosedOn("d2"));
        Assert.Null(store.LastClosedOn("d3"));
        Assert.Null(store.LastClosedOn(null));
    }

    [Fact]
    public void AForgottenNewWindowTakesItsEmptyProjectAlong()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("");
        var w = store.AddWindow(p);
        store.Forget(w.Key, keepUnnamed: true);
        Assert.DoesNotContain(p, store.Projects);
    }

    [Fact]
    public void AProjectWithAnOpenWindowCannotBeDeleted()
    {
        var store = ProjectStore.Load(FilePath);
        var p = store.NewProject("P");
        var w = store.AddWindow(p);
        Assert.False(store.Delete(p));
        w.Open = false;
        Assert.True(store.Delete(p));
        Assert.Empty(store.Projects);
    }
}
