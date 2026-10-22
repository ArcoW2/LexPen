namespace LexPen.Tests;

public class ProgramTests
{
    [Fact]
    public void PathsOnlyMeansNoNewWindow()
    {
        var (newWindow, compare, paths) = Program.ParseArgs([@"C:\a\x.md", @"C:\b"]);
        Assert.False(newWindow);
        Assert.False(compare);
        Assert.Equal([@"C:\a\x.md", @"C:\b"], paths);
    }

    [Theory]
    [InlineData("-n")]
    [InlineData("--new-window")]
    public void NewWindowSwitchIsTakenOutOfThePaths(string option)
    {
        var (newWindow, _, paths) = Program.ParseArgs([@"C:\a\x.md", option, @"C:\b"]);
        Assert.True(newWindow);
        Assert.Equal([@"C:\a\x.md", @"C:\b"], paths);
    }

    [Theory]
    [InlineData("-c")]
    [InlineData("--compare")]
    public void CompareSwitchIsTakenOutOfThePaths(string option)
    {
        var (newWindow, compare, paths) = Program.ParseArgs([option, @"C:\a\old.sql", @"C:\a\new.sql"]);
        Assert.False(newWindow);
        Assert.True(compare);
        Assert.Equal([@"C:\a\old.sql", @"C:\a\new.sql"], paths);
    }
}
