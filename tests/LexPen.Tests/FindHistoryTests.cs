namespace LexPen.Tests;

public class FindHistoryTests
{
    static FindEntry E(string text, bool regex = false) => new() { Text = text, Regex = regex };

    [Fact]
    public void NewestFirstOnceAndCapped()
    {
        var list = new List<FindEntry>();
        foreach (var t in new[] { "a", "b", "c", "b" }) list = FindHistory.Push(list, E(t), 3);
        Assert.Equal(["b", "c", "a"], list.Select(e => e.Text));
        list = FindHistory.Push(list, E("d"), 3);
        Assert.Equal(["d", "b", "c"], list.Select(e => e.Text));
    }

    [Fact]
    public void ATextAgainTakesItsLatestSwitches()
    {
        var list = FindHistory.Push([E("x")], E("x", regex: true), 20);
        Assert.True(Assert.Single(list).Regex);
    }

    [Fact]
    public void EmptyIsNotKept()
    {
        Assert.Empty(FindHistory.Push([], E(""), 20));
        Assert.Equal(["r"], FindHistory.Push(["r"], "", 20));
    }

    [Fact]
    public void ReplacementsTheSameWay()
    {
        var list = new List<string>();
        foreach (var t in new[] { "1", "2", "1", "3" }) list = FindHistory.Push(list, t, 2);
        Assert.Equal(["3", "1"], list);
    }
}
