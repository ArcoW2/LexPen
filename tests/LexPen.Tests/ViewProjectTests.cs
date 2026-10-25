using System.Text.Json.Nodes;

namespace LexPen.Tests;

// The project for viewing (ViewProject, docs/plans/executed/PLAN-view-window.md).
public class ViewProjectTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-view-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, ProjectStore.FileName);

    public ViewProjectTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void TheSettingNamesItElseTheProjectNamedView()
    {
        var store = ProjectStore.Load(FilePath);
        Assert.Null(ViewProject.Find(store, 0));   // none yet: the first view makes it
        var work = store.NewProject("Work");
        var view = store.NewProject("View");
        Assert.Same(view, ViewProject.Find(store, 0));
        Assert.Same(work, ViewProject.Find(store, work.Id));
        Assert.Same(view, ViewProject.Find(store, 999));   // the chosen one is gone
    }

    [Fact]
    public void TheViewLayoutIsTheDefaultWithThePanesAndBarsOff()
    {
        var shipped = new JsonObject { ["sidebar"] = true, ["outline"] = true, ["formatBar"] = true, ["ruler"] = true, ["wrap"] = true, ["tabBar"] = "scroll" };
        var mine = new JsonObject { ["wrap"] = false, ["tabBar"] = 3, ["nope"] = 1 };
        var layout = ViewProject.Layout(shipped, mine);
        foreach (var name in new[] { "sidebar", "outline", "formatBar", "ruler" }) Assert.False(layout[name]!.GetValue<bool>(), name);
        Assert.False(layout["wrap"]!.GetValue<bool>());               // yours
        Assert.Equal("scroll", layout["tabBar"]!.GetValue<string>());  // yours of the wrong kind: the shipped one
        Assert.False(layout.ContainsKey("nope"));
    }

    [Fact]
    public void ASessionInTheViewLayoutHasOnePaneOfPreviews()
    {
        var session = JsonNode.Parse("""
            { "root": "C:\\docs", "hidden": 1, "sync": true, "syncGap": 2, "activePane": 1, "compare": { "left": "a" },
              "panes": [
                { "active": 1, "tabs": [ { "path": "C:\\docs\\a.md", "mode": "edit" }, { "path": "C:\\docs\\b.sql", "mode": "split", "pinned": true } ] },
                { "active": 0, "tabs": [ { "path": "C:\\docs\\A.md", "mode": "edit" }, { "draft": "d1", "mode": "edit" } ] } ] }
            """);
        var layout = new JsonObject { ["outline"] = false };
        var s = ViewProject.ToViewLayout(session, layout);
        var tabs = s["panes"]!.AsArray().Single()!["tabs"]!.AsArray();
        Assert.Equal(["C:\\docs\\a.md", "C:\\docs\\b.sql", null], tabs.Select(t => t!["path"]?.GetValue<string>()));   // a.md once
        Assert.Equal("d1", tabs[2]!["draft"]!.GetValue<string>());
        Assert.All(tabs, t => Assert.Equal("preview", t!["mode"]!.GetValue<string>()));
        Assert.True(tabs[1]!["pinned"]!.GetValue<bool>());
        Assert.Equal(1, s["panes"]![0]!["active"]!.GetValue<int>());
        Assert.Equal("C:\\docs", s["root"]!.GetValue<string>());
        Assert.False(s["layout"]!["outline"]!.GetValue<bool>());
        Assert.Equal(0, s["activePane"]!.GetValue<int>());
        foreach (var gone in new[] { "hidden", "sync", "syncGap", "compare" }) Assert.False(s.ContainsKey(gone), gone);
    }

    // The project for viewing is never the one LexPen brings back by itself: at start, or for a new window on a desktop.
    [Fact]
    public void TheProjectForViewingIsNotTheLastClosed()
    {
        var store = ProjectStore.Load(FilePath);
        var work = store.NewProject("Work");
        var view = store.NewProject("View");
        var w1 = store.AddWindow(work);
        (w1.Open, w1.Desktop, w1.Used) = (false, "{d}", new DateTime(2026, 1, 1));
        var w2 = store.AddWindow(view);
        (w2.Open, w2.Desktop, w2.Used) = (false, "{d}", new DateTime(2026, 2, 1));
        Assert.Same(view, store.LastClosedOn("{d}"));
        Assert.Same(work, store.LastClosedOn("{d}", skip: view));
    }

    static JsonNode Tabs(string path) =>
        new JsonObject { ["panes"] = new JsonArray(new JsonObject { ["tabs"] = new JsonArray(new JsonObject { ["path"] = path }) }) };

    [Fact]
    public void AtStartTheProjectForViewingStaysClosed()
    {
        var store = ProjectStore.Load(FilePath);
        var work = store.NewProject("Work");
        var view = store.NewProject("View");
        var w1 = store.AddWindow(work);
        w1.Session = Tabs("a.md");
        var w2 = store.AddWindow(view);
        w2.Session = Tabs("b.md");
        var start = store.StartWindows(keepUnnamed: true, skip: view);
        Assert.Equal([w1.Key], start.Select(s => s.Window.Key));
        Assert.Contains(w2, view.Windows);   // kept, closed, with its tabs
        Assert.False(w2.Open);
    }

    [Fact]
    public void ANewViewWindowWithoutASessionGetsOnlyTheLayout()
    {
        var s = ViewProject.ToViewLayout(null, new JsonObject { ["sidebar"] = false });
        Assert.Empty(s["panes"]![0]!["tabs"]!.AsArray());
        Assert.False(s["layout"]!["sidebar"]!.GetValue<bool>());
    }
}
