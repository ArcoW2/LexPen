namespace LexPen.Tests;

public class ProgramTests
{
    [Fact]
    public void PathsOnlyMeansNoNewWindow()
    {
        var (newWindow, paths) = Program.ParseArgs([@"C:\a\x.md", @"C:\b"]);
        Assert.False(newWindow);
        Assert.Equal([@"C:\a\x.md", @"C:\b"], paths);
    }

    [Theory]
    [InlineData("-n")]
    [InlineData("--new-window")]
    public void NewWindowSwitchIsTakenOutOfThePaths(string option)
    {
        var (newWindow, paths) = Program.ParseArgs([@"C:\a\x.md", option, @"C:\b"]);
        Assert.True(newWindow);
        Assert.Equal([@"C:\a\x.md", @"C:\b"], paths);
    }
}
