namespace LexPen.Tests;

public class FontsTests
{
    [Fact]
    public void ConsolasIsMonospacedAndSegoeUiIsNot()
    {
        var fonts = Fonts.List();
        Assert.Contains(("Consolas", true), fonts);
        Assert.Contains(("Segoe UI", false), fonts);
    }

    [Fact]
    public void NoVerticalVariants()
    {
        Assert.DoesNotContain(Fonts.List(), f => f.Name.StartsWith('@'));
    }
}
