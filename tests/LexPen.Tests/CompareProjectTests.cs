using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The project for comparing (CompareProject, docs/plans/executed/PLAN-compare-project.md).
public class CompareProjectTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-compare-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, ProjectStore.FileName);

    public CompareProjectTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void TheSettingNamesItElseTheProjectNamedCompare()
    {
        var store = ProjectStore.Load(FilePath);
        Assert.Null(CompareProject.Find(store, 0, null));   // none yet: the first compare makes it
        var work = store.NewProject("Work");
        var view = store.NewProject("View");
        var compare = store.NewProject("Compare");
        Assert.Same(compare, CompareProject.Find(store, 0, view));
        Assert.Same(work, CompareProject.Find(store, work.Id, view));
        Assert.Same(view, CompareProject.Find(store, CompareProject.SameAsViewing, view));   // Same project as Viewing
        Assert.Null(CompareProject.Find(store, CompareProject.SameAsViewing, null));         // that one not made yet
        Assert.Same(compare, CompareProject.Find(store, 999, view));    // the chosen one is gone
    }

    // A file and a folder (Plan 40): the file against the folder's file of the same name, the file keeping its side.
    [Fact]
    public void AFileAndAFolderCompareTheFileWithTheFoldersFileOfThatName()
    {
        var a = Directory.CreateDirectory(Path.Combine(dir, "a")).FullName;
        var b = Directory.CreateDirectory(Path.Combine(dir, "b")).FullName;
        var file = Path.Combine(a, "x.sql");
        File.WriteAllText(file, "1");
        File.WriteAllText(Path.Combine(b, "x.sql"), "2");
        Assert.Equal([file, Path.Combine(b, "x.sql")], CompareProject.FileInFolder([file, b]).Pair!);
        Assert.Equal([Path.Combine(b, "x.sql"), file], CompareProject.FileInFolder([b, file]).Pair!);   // the folder first: left
        // Not in the folder: no compare, and why.
        var (none, why) = CompareProject.FileInFolder([file, dir]);
        Assert.Null(none);
        Assert.Equal($"{dir} has no x.sql.", why);
        // The file's own folder: it would be compared with itself.
        Assert.Null(CompareProject.FileInFolder([file, a]).Pair);
        // Two files, two folders: as given.
        Assert.Equal([a, b], CompareProject.FileInFolder([a, b]).Pair!);
        Assert.Equal([file, file], CompareProject.FileInFolder([file, file]).Pair!);
        Assert.Null(CompareProject.FileInFolder([a, b]).Message);
    }

    static JsonNode Tabs(string path) =>
        new JsonObject { ["panes"] = new JsonArray(new JsonObject { ["tabs"] = new JsonArray(new JsonObject { ["path"] = path }) }) };

    // Neither the project for viewing nor the one for comparing comes back by itself: at start, or for a new window.
    [Fact]
    public void AtStartTheProjectsForViewingAndComparingStayClosed()
    {
        var store = ProjectStore.Load(FilePath);
        var work = store.NewProject("Work");
        var view = store.NewProject("View");
        var compare = store.NewProject("Compare");
        var w1 = store.AddWindow(work);
        w1.Session = Tabs("a.md");
        var w2 = store.AddWindow(view);
        w2.Session = Tabs("b.md");
        var w3 = store.AddWindow(compare);
        w3.Session = Tabs("c.md");
        var start = store.StartWindows(true, view, compare);
        Assert.Equal([w1.Key], start.Select(s => s.Window.Key));
        Assert.Contains(w3, compare.Windows);   // kept, closed, with its tabs
        Assert.False(w3.Open);
    }

    [Fact]
    public void TheProjectForComparingIsNotTheLastClosed()
    {
        var store = ProjectStore.Load(FilePath);
        var work = store.NewProject("Work");
        var view = store.NewProject("View");
        var compare = store.NewProject("Compare");
        var w1 = store.AddWindow(work);
        (w1.Open, w1.Desktop, w1.Used) = (false, "{d}", new DateTime(2026, 1, 1));
        var w2 = store.AddWindow(view);
        (w2.Open, w2.Desktop, w2.Used) = (false, "{d}", new DateTime(2026, 2, 1));
        var w3 = store.AddWindow(compare);
        (w3.Open, w3.Desktop, w3.Used) = (false, "{d}", new DateTime(2026, 3, 1));
        Assert.Same(compare, store.LastClosedOn("{d}"));
        Assert.Same(work, store.LastClosedOn("{d}", view, compare));
    }
}
