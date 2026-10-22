using Microsoft.Win32;

namespace LexPen.Tests;

// The registry entries go below a key of their own (LEXPEN_REGISTRY_ROOT), removed afterwards: never the real menu.
public class ExplorerMenuTests : IDisposable
{
    readonly string testKey = @"Software\LexPenTest-" + Guid.NewGuid().ToString("N");
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-em-" + Guid.NewGuid().ToString("N"));
    const string Exe = @"C:\Apps\LexPen\LexPen.exe";

    public ExplorerMenuTests()
    {
        Environment.SetEnvironmentVariable("LEXPEN_REGISTRY_ROOT", testKey + @"\Classes");
        Directory.CreateDirectory(dir);
        ExplorerMenu.LeftFileForTests = Path.Combine(dir, "compare-left.txt");
    }

    public void Dispose()
    {
        Registry.CurrentUser.DeleteSubKeyTree(testKey, throwOnMissingSubKey: false);
        Environment.SetEnvironmentVariable("LEXPEN_REGISTRY_ROOT", null);
        ExplorerMenu.LeftFileForTests = null;
        Directory.Delete(dir, true);
    }

    string? Label(string kind, string verb)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\Classes\{kind}\shell\{verb}");
        return key?.GetValue("MUIVerb") as string;
    }

    string? IconOf(string kind, string verb)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\Classes\{kind}\shell\{verb}");
        return key?.GetValue("Icon") as string;
    }

    string? Command(string kind, string verb)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\Classes\{kind}\shell\{verb}\command");
        return key?.GetValue(null) as string;
    }

    [Fact]
    public void InstallSelectAndRemove()
    {
        ExplorerMenu.Install(Exe);
        Assert.Equal(Exe, ExplorerMenu.InstalledExe);
        Assert.Equal("Select left side to compare", Label("*", "LexPen.CompareLeft"));
        Assert.Equal("Select left side to compare", Label("Directory", "LexPen.CompareLeft"));
        Assert.Equal($"\"{Exe}\" --compare-left \"%1\"", Command("*", "LexPen.CompareLeft"));
        Assert.Equal("\"C:\\Apps\\LexPen\\compare-left.ico\"", IconOf("*", "LexPen.CompareLeft"));
        Assert.Null(Label("*", "LexPen.CompareTo"));

        // A file as the left side: Compare to on files only.
        var file = Path.Combine(dir, "old.sql");
        File.WriteAllText(file, "x");
        ExplorerMenu.SelectLeft(file);
        Assert.Equal(file, ExplorerMenu.Left);
        Assert.Equal("Select as new left side to compare", Label("*", "LexPen.CompareLeft"));
        Assert.Equal("Compare to old.sql", Label("*", "LexPen.CompareTo"));
        Assert.Equal($"\"{Exe}\" --compare \"{file}\" \"%1\"", Command("*", "LexPen.CompareTo"));
        Assert.Equal("\"C:\\Apps\\LexPen\\compare-to.ico\"", IconOf("*", "LexPen.CompareTo"));
        Assert.Null(Label("Directory", "LexPen.CompareTo"));

        // Another left side, a folder: Compare to on folders only.
        var folder = Path.Combine(dir, "old");
        Directory.CreateDirectory(folder);
        ExplorerMenu.SelectLeft(folder);
        Assert.Equal("Compare to old", Label("Directory", "LexPen.CompareTo"));
        Assert.Null(Label("*", "LexPen.CompareTo"));

        ExplorerMenu.Remove();
        Assert.Null(ExplorerMenu.InstalledExe);
        Assert.Null(Label("*", "LexPen.CompareLeft"));
        Assert.Null(Label("Directory", "LexPen.CompareTo"));
        Assert.Null(ExplorerMenu.Left);
    }

    [Fact]
    public void SelectingWithoutTheEntriesKeepsTheLeftSideOnly()
    {
        var file = Path.Combine(dir, "a.txt");
        File.WriteAllText(file, "x");
        ExplorerMenu.SelectLeft(file);
        Assert.Equal(file, ExplorerMenu.Left);
        Assert.Null(ExplorerMenu.InstalledExe);
        Assert.Null(Label("*", "LexPen.CompareTo"));
        ExplorerMenu.ClearLeft();
        Assert.Null(ExplorerMenu.Left);
    }

    [Theory]
    [InlineData("\"C:\\A b\\LexPen.exe\" --compare-left \"%1\"", @"C:\A b\LexPen.exe")]
    [InlineData(@"C:\Apps\LexPen.exe --compare-left %1", @"C:\Apps\LexPen.exe")]
    public void TheExeOfACommand(string command, string exe) => Assert.Equal(exe, ExplorerMenu.ExeOf(command));

    [Theory]
    [InlineData(@"C:\work\old.sql", "old.sql")]
    [InlineData(@"C:\work\old\", "old")]
    [InlineData(@"C:\", @"C:\")]
    public void TheNameInTheLabel(string path, string name) => Assert.Equal(name, ExplorerMenu.NameOf(path));
}
