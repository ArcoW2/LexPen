using System.Text.Json;

namespace LexPen.Tests;

// The zoom per monitor (docs/plans/executed/PLAN-settings-layers.md, 3.6): on top of the global base, kept in state.json.
public class ScreenZoomTests
{
    [Fact]
    public void AMonitorWithoutItsOwnIsTheBase()
    {
        var screens = new Dictionary<string, ScreenZoom>();
        Assert.False(screens.ContainsKey("laptop"));   // the page then uses step 0, factor 1 (AppHost.ScreenOf)
        ScreenZoom.Set(screens, "laptop", 2, null);
        Assert.Equal(2, screens["laptop"].EditorStep);
        Assert.Equal(1, screens["laptop"].PreviewFactor);
    }

    [Fact]
    public void EachPartChangesOnItsOwn()
    {
        var screens = new Dictionary<string, ScreenZoom>();
        ScreenZoom.Set(screens, "laptop", 2, null);
        ScreenZoom.Set(screens, "laptop", null, 1.25);
        Assert.Equal(2, screens["laptop"].EditorStep);
        Assert.Equal(1.25, screens["laptop"].PreviewFactor);
        ScreenZoom.Set(screens, "laptop", 0, null);   // the editor back at the base; the preview keeps its own
        Assert.Equal(1.25, screens["laptop"].PreviewFactor);
    }

    [Fact]
    public void BackAtTheBaseTheMonitorIsDropped()
    {
        var screens = new Dictionary<string, ScreenZoom>();
        ScreenZoom.Set(screens, "laptop", 2, 1.25);
        ScreenZoom.Set(screens, "main", null, 0.9);
        ScreenZoom.Set(screens, "laptop", 0, 1);
        Assert.False(screens.ContainsKey("laptop"));
        Assert.True(screens.ContainsKey("main"));   // another monitor keeps its own
    }

    [Fact]
    public void TheZoomPerMonitorGoesRoundTheStateFile()
    {
        var state = new AppHost.AppState();
        ScreenZoom.Set(state.Screens, @"\\?\DISPLAY#ABC123#1", -1, 1.5);
        var again = JsonSerializer.Deserialize<AppHost.AppState>(JsonSerializer.Serialize(state))!;
        Assert.Equal(-1, again.Screens[@"\\?\DISPLAY#ABC123#1"].EditorStep);
        Assert.Equal(1.5, again.Screens[@"\\?\DISPLAY#ABC123#1"].PreviewFactor);
        // A state file from before: no zoom per monitor.
        Assert.Empty(JsonSerializer.Deserialize<AppHost.AppState>("""{ "X": 1 }""")!.Screens);
    }
}
