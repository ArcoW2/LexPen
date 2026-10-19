using System.Text.Json;

namespace LexPen.Tests;

public class TabColourFileTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-tabcolours-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void WritesTheDefaultWhenMissing()
    {
        var text = TabColourFile.Read(dir);
        Assert.Equal(TabColourFile.Default, text);
        Assert.Equal(TabColourFile.Default, File.ReadAllText(Path.Combine(dir, TabColourFile.Name)));
    }

    [Fact]
    public void LeavesAnExistingFileAlone()
    {
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, TabColourFile.Name);
        File.WriteAllText(path, "[]");
        Assert.Equal("[]", TabColourFile.Read(dir));
        Assert.Equal("[]", File.ReadAllText(path));
    }

    [Fact]
    public void DefaultIsJsonWithSixRulesTheLastForEveryFile()
    {
        using var json = JsonDocument.Parse(TabColourFile.Default,
            new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        var rules = json.RootElement.EnumerateArray().ToList();
        Assert.Equal(6, rules.Count);
        Assert.Equal("*", rules[^1].GetProperty("match").GetString());
        foreach (var rule in rules)
            foreach (var theme in new[] { "light", "dark" })
                Assert.True(rule.GetProperty(theme).GetProperty("active").GetProperty("bold").GetBoolean());
        Assert.All(TabColourFile.Default, c => Assert.True(c < 128));   // plain ASCII
    }
}
