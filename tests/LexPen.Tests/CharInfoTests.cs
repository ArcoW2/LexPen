using System.Diagnostics;

namespace LexPen.Tests;

public class CharInfoTests
{
    [Fact]
    public void ConsolasHasLatinButNoChinese()
    {
        var chars = CharInfo.FontChars("Consolas");
        Assert.NotNull(chars);
        Assert.Contains(0xE9, chars);        // e acute
        Assert.Contains(0x2550, chars);      // a box drawing line
        Assert.DoesNotContain(0x4E2D, chars);
        Assert.DoesNotContain(0x0A, chars);  // a control character is left out
    }

    [Fact]
    public void AFontWindowsDoesNotHaveIsNull() => Assert.Null(CharInfo.FontChars("No Such Font Here"));

    [Fact]
    public void NamesFromWindows()
    {
        Assert.Equal("Latin Small Letter E With Acute", CharInfo.Name(0xE9));
        Assert.Null(CharInfo.Name(0x0378));      // unassigned
        Assert.Null(CharInfo.Name(0x1F600));     // above U+FFFF: Windows has no name
    }

    [Fact]
    public void BlocksInCodeOrderWithNames()
    {
        var blocks = CharInfo.Blocks().ToList();
        Assert.Equal((0, 128, "Basic Latin"), blocks[0]);
        Assert.Contains(blocks, b => b.Name == "Latin Extended A" && b.First == 0x100);
        Assert.Contains(blocks, b => b.Name == "Box Drawing" && b.First == 0x2500);
        Assert.Contains(blocks, b => b.Name == "Latin 1 Supplement" && b.First == 0x80);
        Assert.Contains(blocks, b => b.Name == "CJK Unified Ideographs");
        Assert.Contains(blocks, b => b.Name == "Greek and Coptic");
        Assert.Contains(blocks, b => b.Name == "IPA Extensions");
        Assert.Contains(blocks, b => b.Name == "Superscripts and Subscripts");
        Assert.True(blocks.Zip(blocks.Skip(1)).All(p => p.First.First < p.Second.First));
    }

    [Fact]
    public void SearchByNameWords()
    {
        var found = CharInfo.Search(CharInfo.FontChars("Consolas")!, ["arrow", "LEFT"]);
        Assert.Contains(0x2190, found);       // Leftwards Arrow
        Assert.DoesNotContain(0x2192, found); // Rightwards Arrow
    }

    [Fact]
    public void AllCharactersQuicklyEnough()
    {
        var watch = Stopwatch.StartNew();
        var all = CharInfo.AllChars();
        watch.Stop();
        Console.WriteLine($"ALL {all.Count} characters in {watch.ElapsedMilliseconds} ms");
        Assert.Contains(0x4E2D, all);
        Assert.DoesNotContain(0xE000, all);     // private use (the stand-ins) left out
    }
}
