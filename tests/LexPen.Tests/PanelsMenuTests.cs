using System.Text.RegularExpressions;

namespace LexPen.Tests;

// Window > Panels (docks.js panelItems, docs/plans/executed/PLAN-panels-menu-order.md): the panels in groups, then the dock
// areas and Reset docking, all in one menu, so no two items may share a letter.
public class PanelsMenuTests
{
    static readonly string Source = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "docks.js"));

    static string Block(string start, string end)
    {
        var at = Source.IndexOf(start, StringComparison.Ordinal);
        Assert.True(at >= 0, start);
        return Source[at..Source.IndexOf(end, at, StringComparison.Ordinal)];
    }

    [Fact]
    public void NoTwoItemsShareALetter()
    {
        var panels = Block("const PANELS = [", "];");
        var rest = Block("async function panelItems()", "\n}");
        var labels = Regex.Matches(panels + rest, @"\['([^']*&[^']*)'").Select(m => m.Groups[1].Value)
            .Concat(Regex.Matches(rest, @"label: '([^']*&[^']*)'").Select(m => m.Groups[1].Value)).ToList();
        Assert.True(labels.Count > 10, string.Join(", ", labels));
        var letters = labels.Select(l => char.ToLowerInvariant(l[l.IndexOf('&') + 1])).ToList();
        var shared = letters.GroupBy(c => c).Where(g => g.Count() > 1).Select(g => g.Key + ": " + string.Join(", ", labels.Where(l => char.ToLowerInvariant(l[l.IndexOf('&') + 1]) == g.Key)));
        Assert.Empty(shared);
    }

    [Fact]
    public void EveryGroupHasAHeadingAndPanels()
    {
        var lines = Block("const PANELS = [", "];").Split('\n').Select(l => l.Trim()).Where(l => l.StartsWith('{') || l.StartsWith('[')).ToList();
        Assert.StartsWith("{ header:", lines[0]);
        for (var i = 0; i < lines.Count; i++)
            if (lines[i].StartsWith("{ header:")) Assert.True(i + 1 < lines.Count && lines[i + 1].StartsWith('['), lines[i]);
    }
}
