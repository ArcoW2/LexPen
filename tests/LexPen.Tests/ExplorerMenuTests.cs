using Microsoft.Win32;

namespace LexPen.Tests;

// The registry entries go below a key of their own (LEXPEN_REGISTRY_ROOT), removed afterwards: never the real menu.
// One collection with FileTypesTests: both set LEXPEN_REGISTRY_ROOT, so they must not run at the same time.
[Collection("Registry")]
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

    bool HasValue(string path, string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\Classes\{path}");
        return key?.GetValueNames().Contains(name) == true;
    }

    // View and Edit in LexPen (docs/plans/executed/PLAN-view-window.md): next to each other between two lines, Edit on files only.
    [Fact]
    public void TheItemsAsAGroupBetweenTwoLines()
    {
        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(Compare: true, View: true, Edit: true, Submenu: false));
        Assert.Equal("View in LexPen", Label("*", "LexPen.View"));
        Assert.Equal("View in LexPen", Label("Directory", "LexPen.View"));
        Assert.Equal("Edit in LexPen", Label("*", "LexPen.Edit"));
        Assert.Null(Label("Directory", "LexPen.Edit"));
        Assert.Equal($"\"{Exe}\" --view \"%1\"", Command("*", "LexPen.View"));
        Assert.Equal($"\"{Exe}\" --edit \"%1\"", Command("*", "LexPen.Edit"));
        Assert.Equal($"\"{Exe}\",0", IconOf("*", "LexPen.View"));
        // The first and the last of a kind (in the order of the names) carry the lines.
        Assert.True(HasValue(@"*\shell\LexPen.CompareLeft", "SeparatorBefore"));
        Assert.True(HasValue(@"*\shell\LexPen.View", "SeparatorAfter"));
        Assert.False(HasValue(@"*\shell\LexPen.Edit", "SeparatorBefore"));
        Assert.Equal(new ExplorerMenu.Choice(true, true, true, false), ExplorerMenu.Installed);
        Assert.Equal(Exe, ExplorerMenu.InstalledExe);
    }

    [Fact]
    public void TheItemsInASubmenuAndBackLeaveNothingBehind()
    {
        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(Compare: true, View: true, Edit: false, Submenu: false));
        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(Compare: true, View: true, Edit: false, Submenu: true));
        Assert.Null(Label("*", "LexPen.View"));          // not next to the others any more
        Assert.Null(Label("*", "LexPen.CompareLeft"));
        Assert.Equal("LexPen", Label("*", "LexPen.Menu"));
        Assert.Equal("LexPen", Label("Directory", "LexPen.Menu"));
        using (var menu = Registry.CurrentUser.OpenSubKey($@"{testKey}\Classes\*\shell\LexPen.Menu"))
            Assert.Equal("LexPen.Menu.Files", menu!.GetValue("ExtendedSubCommandsKey"));
        Assert.Equal("View in LexPen", Label("LexPen.Menu.Files", "LexPen.View"));
        Assert.Equal("View in LexPen", Label("LexPen.Menu.Folders", "LexPen.View"));
        Assert.Equal("Select left side to compare", Label("LexPen.Menu.Files", "LexPen.CompareLeft"));
        Assert.Equal(new ExplorerMenu.Choice(true, true, false, true), ExplorerMenu.Installed);

        // A left side chosen while in the submenu: Compare to there too.
        var file = Path.Combine(dir, "old.sql");
        File.WriteAllText(file, "x");
        ExplorerMenu.SelectLeft(file);
        Assert.Equal("Compare to old.sql", Label("LexPen.Menu.Files", "LexPen.CompareTo"));

        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(Compare: false, View: true, Edit: false, Submenu: false));
        Assert.Null(Label("*", "LexPen.Menu"));
        Assert.Null(Label("LexPen.Menu.Files", "LexPen.View"));
        Assert.Null(Label("*", "LexPen.CompareLeft"));
        Assert.Equal("View in LexPen", Label("*", "LexPen.View"));

        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(false, false, false, false));
        Assert.Null(ExplorerMenu.Installed);
        Assert.Null(Label("*", "LexPen.View"));
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
