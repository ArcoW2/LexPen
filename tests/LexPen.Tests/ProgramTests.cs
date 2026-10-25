namespace LexPen.Tests;

public class ProgramTests
{
    [Fact]
    public void PathsOnlyMeansNoNewWindow()
    {
        var (newWindow, compare, view, paths) = Program.ParseArgs([@"C:\a\x.md", @"C:\b"]);
        Assert.False(newWindow);
        Assert.False(compare);
        Assert.False(view);
        Assert.Equal([@"C:\a\x.md", @"C:\b"], paths);
    }

    [Theory]
    [InlineData("-n")]
    [InlineData("--new-window")]
    public void NewWindowSwitchIsTakenOutOfThePaths(string option)
    {
        var (newWindow, _, _, paths) = Program.ParseArgs([@"C:\a\x.md", option, @"C:\b"]);
        Assert.True(newWindow);
        Assert.Equal([@"C:\a\x.md", @"C:\b"], paths);
    }

    [Theory]
    [InlineData("-c")]
    [InlineData("--compare")]
    public void CompareSwitchIsTakenOutOfThePaths(string option)
    {
        var (newWindow, compare, _, paths) = Program.ParseArgs([option, @"C:\a\old.sql", @"C:\a\new.sql"]);
        Assert.False(newWindow);
        Assert.True(compare);
        Assert.Equal([@"C:\a\old.sql", @"C:\a\new.sql"], paths);
    }

    // Explorer's View in LexPen and Edit in LexPen (docs/plans/33-PLAN-view-window.md): --edit is as no switch.
    [Fact]
    public void ViewAndEditSwitchesAreTakenOutOfThePaths()
    {
        var (_, _, view, paths) = Program.ParseArgs(["--view", @"C:\a\x.md"]);
        Assert.True(view);
        Assert.Equal([@"C:\a\x.md"], paths);
        (_, _, view, paths) = Program.ParseArgs(["--edit", @"C:\a\x.md"]);
        Assert.False(view);
        Assert.Equal([@"C:\a\x.md"], paths);
    }
}
