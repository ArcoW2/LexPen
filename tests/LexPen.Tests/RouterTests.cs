namespace LexPen.Tests;

public class RouterTests
{
    static List<(string, bool)> Items(params string[] paths) =>
        paths.Select(p => (p.TrimEnd('/').Replace('/', '\\'), p.EndsWith('/'))).ToList();

    [Fact]
    public void NoWindowAndNoArgumentsOpensOne()
    {
        var t = Assert.Single(Router.Route([], [], [], shift: false));
        Assert.Null(t.Window);
        Assert.Empty(t.Files);
    }

    [Fact]
    public void FilesGoToTheMostRecentWindowOnThisDesktop()
    {
        // Window 1 was used last on this desktop; window 0 is on another desktop (not in "here").
        var t = Assert.Single(Router.Route(Items(@"C:\a\x.md", @"C:\b\y.md"), [null, @"C:\a", null], here: [1, 2], shift: false));
        Assert.Equal(1, t.Window);
        Assert.Equal([@"C:\a\x.md", @"C:\b\y.md"], t.Files);
    }

    [Fact]
    public void NoWindowOnThisDesktopOpensANewOneHere()
    {
        var t = Assert.Single(Router.Route(Items(@"C:\a\x.md"), [null, null], here: [], shift: false));
        Assert.Null(t.Window);
        Assert.Equal([@"C:\a\x.md"], t.Files);
    }

    [Fact]
    public void ShiftOpensANewWindowWithTheFiles()
    {
        var t = Assert.Single(Router.Route(Items(@"C:\a\x.md"), [null], here: [0], shift: true));
        Assert.Null(t.Window);
        Assert.Equal([@"C:\a\x.md"], t.Files);
    }

    [Fact]
    public void ShiftWithoutFilesOpensAnEmptyWindow()
    {
        var t = Assert.Single(Router.Route([], [null], here: [0], shift: true));
        Assert.Null(t.Window);
        Assert.Empty(t.Files);
    }

    [Fact]
    public void NoArgumentsActivateTheMostRecentWindowOnThisDesktop()
    {
        var t = Assert.Single(Router.Route([], [null, null], here: [1, 0], shift: false));
        Assert.Equal(1, t.Window);
        Assert.Empty(t.Files);
    }

    [Fact]
    public void EachFolderGetsAWindowAndFilesGoToTheDeepestFolder()
    {
        var targets = Router.Route(Items("C:/a/", "C:/a/b/", "C:/a/b/x.md", "C:/a/y.md", "C:/c/z.md"), [], [], shift: false);
        var a = targets.Single(t => t.Folder == @"C:\a");
        var b = targets.Single(t => t.Folder == @"C:\a\b");
        var rest = targets.Single(t => t.Folder is null);
        Assert.Equal([@"C:\a\y.md"], a.Files);
        Assert.Equal([@"C:\a\b\x.md"], b.Files);
        Assert.Equal([@"C:\c\z.md"], rest.Files);
        Assert.Same(rest, targets[^1]);   // comes to the front
    }

    [Fact]
    public void OnlyFoldersOpenOnlyTheirWindows()
    {
        var targets = Router.Route(Items("C:/a/", "C:/b/"), [], [], shift: false);
        Assert.Equal([@"C:\a", @"C:\b"], targets.Select(t => t.Folder));
    }

    [Fact]
    public void AFolderAlreadyOpenReusesItsWindow()
    {
        var targets = Router.Route(Items("C:/A/", @"C:/a/x.md"), [null, @"C:\a\"], here: [0], shift: false);
        var t = Assert.Single(targets);
        Assert.Equal(1, t.Window);
        Assert.Equal([@"C:\a\x.md"], t.Files);
    }

    [Fact]
    public void RemainingFilesWithFoldersGoToTheWindowOnThisDesktop()
    {
        var targets = Router.Route(Items("C:/a/", "C:/c/z.md"), [null], here: [0], shift: false);
        Assert.Equal(2, targets.Count);
        Assert.Null(targets[0].Window);
        Assert.Equal(0, targets[1].Window);
        Assert.Equal([@"C:\c\z.md"], targets[1].Files);
    }

    [Fact]
    public void AFileNextToAFolderWithASimilarNameIsNotInsideIt()
    {
        var targets = Router.Route(Items("C:/a/", "C:/ab/x.md"), [], [], shift: false);
        Assert.Empty(targets.Single(t => t.Folder == @"C:\a").Files);
        Assert.Equal([@"C:\ab\x.md"], targets.Single(t => t.Folder is null).Files);
    }
}
