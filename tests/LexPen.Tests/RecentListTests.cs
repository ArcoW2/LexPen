namespace LexPen.Tests;

public class RecentListTests
{
    [Fact]
    public void PushPutsOnTopWithoutDoubles()
    {
        var list = RecentList.Push([@"C:\a.md", @"C:\b.md"], @"C:\B.md");
        Assert.Equal([@"C:\B.md", @"C:\a.md"], list);
    }

    [Fact]
    public void PushKeepsAtMostFifteen()
    {
        var list = Enumerable.Range(1, 15).Select(i => $@"C:\{i}.md").ToList();
        list = RecentList.Push(list, @"C:\new.md");
        Assert.Equal(RecentList.Max, list.Count);
        Assert.Equal(@"C:\new.md", list[0]);
        Assert.DoesNotContain(@"C:\15.md", list);
    }

    [Fact]
    public void AppendAddsAtTheEndOnceAndHasNoLimit()
    {
        var list = Enumerable.Range(1, 20).Select(i => $@"C:\{i}.md").ToList();
        list = RecentList.Append(list, @"C:\new.md");
        Assert.Equal(21, list.Count);
        Assert.Equal(@"C:\new.md", list[^1]);
        Assert.Same(list, RecentList.Append(list, @"c:\NEW.md"));   // already in it: unchanged
    }

    [Fact]
    public void UniqueKeepsYourOrderWithoutDoubles()
    {
        Assert.Equal([@"C:\b", @"C:\a", @"D:\c"], RecentList.Unique([@"C:\b", @"C:\a", @"c:\B", "", @"D:\c", " "]));
    }

    [Fact]
    public void RemoveIgnoresCase()
    {
        Assert.Equal([@"C:\a.md"], RecentList.Remove([@"C:\a.md", @"C:\b.md"], @"c:\B.MD"));
    }
}
