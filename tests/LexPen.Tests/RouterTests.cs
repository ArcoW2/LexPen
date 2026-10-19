namespace LexPen.Tests;

public class RouterTests
{
    static List<(string, bool)> Items(params string[] paths) =>
        paths.Select(p => (p.TrimEnd('/').Replace('/', '\\'), p.EndsWith('/'))).ToList();

    [Fact]
    public void FirstStartWithoutArgumentsRestoresTheSession()
    {
        var t = Assert.Single(Router.Route([], [], -1, shift: false));
        Assert.Null(t.Window);
        Assert.True(t.Restore);
        Assert.True(t.Primary);
        Assert.Empty(t.Files);
    }

    [Fact]
    public void FirstStartIgnoresShift()
    {
        var t = Assert.Single(Router.Route(Items(@"C:\a\x.md"), [], -1, shift: true));
        Assert.True(t.Restore);
        Assert.Equal([@"C:\a\x.md"], t.Files);
    }

    [Fact]
    public void FilesGoToTheMostRecentWindow()
    {
        var t = Assert.Single(Router.Route(Items(@"C:\a\x.md", @"C:\b\y.md"), [null, @"C:\a"], recent: 1, shift: false));
        Assert.Equal(1, t.Window);
        Assert.Equal([@"C:\a\x.md", @"C:\b\y.md"], t.Files);
        Assert.False(t.Restore);
    }

    [Fact]
    public void ShiftOpensANewWindowWithTheFiles()
    {
        var t = Assert.Single(Router.Route(Items(@"C:\a\x.md"), [null], recent: 0, shift: true));
        Assert.Null(t.Window);
        Assert.False(t.Restore);
        Assert.False(t.Primary);
        Assert.Equal([@"C:\a\x.md"], t.Files);
    }

    [Fact]
    public void ShiftWithoutFilesOpensAnEmptyWindow()
    {
        var t = Assert.Single(Router.Route([], [null], recent: 0, shift: true));
        Assert.Null(t.Window);
        Assert.Empty(t.Files);
    }

    [Fact]
    public void NoArgumentsActivateTheMostRecentWindow()
    {
        var t = Assert.Single(Router.Route([], [null, null], recent: 1, shift: false));
        Assert.Equal(1, t.Window);
        Assert.Empty(t.Files);
    }

    [Fact]
    public void EachFolderGetsAWindowAndFilesGoToTheDeepestFolder()
    {
        var targets = Router.Route(Items("C:/a/", "C:/a/b/", "C:/a/b/x.md", "C:/a/y.md", "C:/c/z.md"), [], -1, shift: false);
        var a = targets.Single(t => t.Folder == @"C:\a");
        var b = targets.Single(t => t.Folder == @"C:\a\b");
        var rest = targets.Single(t => t.Folder is null);
        Assert.Equal([@"C:\a\y.md"], a.Files);
        Assert.Equal([@"C:\a\b\x.md"], b.Files);
        Assert.Equal([@"C:\c\z.md"], rest.Files);
        // The window with the remaining files restores the session and comes to the front.
        Assert.True(rest.Restore && rest.Primary);
        Assert.False(a.Restore || a.Primary || b.Restore || b.Primary);
        Assert.Same(rest, targets[^1]);
    }

    [Fact]
    public void OnlyFoldersAtFirstStartMakeTheFirstFolderPrimary()
    {
        var targets = Router.Route(Items("C:/a/", "C:/b/"), [], -1, shift: false);
        Assert.Equal(2, targets.Count);
        Assert.True(targets[0].Primary && targets[0].Restore);
        Assert.False(targets[1].Primary || targets[1].Restore);
    }

    [Fact]
    public void AFolderAlreadyOpenReusesItsWindow()
    {
        var targets = Router.Route(Items("C:/A/", @"C:/a/x.md"), [null, @"C:\a\"], recent: 0, shift: false);
        var t = Assert.Single(targets);
        Assert.Equal(1, t.Window);
        Assert.Equal([@"C:\a\x.md"], t.Files);
    }

    [Fact]
    public void RemainingFilesWithFoldersGoToTheRunningWindow()
    {
        var targets = Router.Route(Items("C:/a/", "C:/c/z.md"), [null], recent: 0, shift: false);
        Assert.Equal(2, targets.Count);
        Assert.Null(targets[0].Window);
        Assert.Equal(0, targets[1].Window);
        Assert.Equal([@"C:\c\z.md"], targets[1].Files);
    }

    [Fact]
    public void AFileNextToAFolderWithASimilarNameIsNotInsideIt()
    {
        var targets = Router.Route(Items("C:/a/", "C:/ab/x.md"), [], -1, shift: false);
        Assert.Empty(targets.Single(t => t.Folder == @"C:\a").Files);
        Assert.Equal([@"C:\ab\x.md"], targets.Single(t => t.Folder is null).Files);
    }
}
