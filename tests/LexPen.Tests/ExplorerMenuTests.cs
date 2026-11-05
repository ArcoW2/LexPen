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
        Assert.Equal($"\"{Exe}\",0", IconOf("*", "LexPen.CompareLeft"));   // registry entries (no DLL): LexPen's own icon
        Assert.Null(Label("*", "LexPen.CompareTo"));

        // A file as the left side: Compare to on files only.
        var file = Path.Combine(dir, "old.sql");
        File.WriteAllText(file, "x");
        ExplorerMenu.SelectLeft(file);
        Assert.Equal(file, ExplorerMenu.Left);
        Assert.Equal("Select as new left side to compare", Label("*", "LexPen.CompareLeft"));
        Assert.Equal("Compare to old.sql", Label("*", "LexPen.CompareTo"));
        Assert.Equal($"\"{Exe}\" --compare \"{file}\" \"%1\"", Command("*", "LexPen.CompareTo"));
        Assert.Equal($"\"{Exe}\",0", IconOf("*", "LexPen.CompareTo"));
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

    // Delete .bak files (plan 33): on files and on folders, alone or with the others, and gone again.
    [Fact]
    public void TheBackupEntries()
    {
        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(false, false, false, false, Backups: true));
        Assert.Equal("Delete .bak file", Label("*", "LexPen.DeleteBackups"));
        Assert.Equal("Delete all .bak files", Label("Directory", "LexPen.DeleteBackups"));
        Assert.Equal($"\"{Exe}\" --delete-backups \"%1\"", Command("Directory", "LexPen.DeleteBackups"));
        Assert.Equal(new ExplorerMenu.Choice(false, false, false, false, true), ExplorerMenu.Installed);
        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(false, true, true, true, Backups: true));
        Assert.Equal("Delete .bak file", Label("LexPen.Menu.Files", "LexPen.DeleteBackups"));
        Assert.Equal(new ExplorerMenu.Choice(false, true, true, true, true), ExplorerMenu.Installed);
        ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(false, true, false, false));
        Assert.Null(Label("*", "LexPen.DeleteBackups"));
        Assert.Null(Label("LexPen.Menu.Files", "LexPen.DeleteBackups"));
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

    string? Value(string path, string? name)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\Classes\{path}");
        return key?.GetValue(name) as string;
    }

    const string LeftClsid = "{E47540AF-B66D-4FAF-849E-D0B2D0D28E65}";

    // The Explorer extension (Plan 40): with LexPenShell.dll next to the exe every LexPen item is its, for files and
    // folders together (so they stay together), with its classes and what it reads; in a submenu one item LexPen; without
    // the DLL, registry entries and nothing of it left.
    [Fact]
    public void TheItemsByTheExtensionAndBack()
    {
        ExplorerMenu.ShellDllForTests = true;
        try
        {
            ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(true, true, false, false));
            foreach (var verb in new[] { "LexPen.CompareLeft", "LexPen.CompareTo", "LexPen.ComparePair", "LexPen.View" })
                Assert.NotNull(Value($@"AllFilesystemObjects\shell\{verb}", "ExplorerCommandHandler"));
            Assert.Null(Value(@"AllFilesystemObjects\shell\LexPen.Edit", "ExplorerCommandHandler"));   // not chosen
            Assert.Equal(LeftClsid, Value(@"AllFilesystemObjects\shell\LexPen.CompareLeft", "ExplorerCommandHandler"));
            Assert.Equal(@"C:\Apps\LexPen\LexPenShell.dll", Value($@"CLSID\{LeftClsid}\InprocServer32", null));
            Assert.Equal("Apartment", Value($@"CLSID\{LeftClsid}\InprocServer32", "ThreadingModel"));
            Assert.Equal(Exe, Value("LexPen.Shell", "Exe"));
            Assert.Equal(ExplorerMenu.LeftFileForTests, Value("LexPen.Shell", "LeftFile"));
            Assert.Null(Label("*", "LexPen.CompareLeft"));   // no registry entries as well
            Assert.Null(Label("*", "LexPen.View"));
            // A line above the first, and above Compare (two items: Select left side is not shown then); below the last.
            Assert.NotNull(Value(@"AllFilesystemObjects\shell\LexPen.CompareLeft", "SeparatorBefore"));
            Assert.NotNull(Value(@"AllFilesystemObjects\shell\LexPen.ComparePair", "SeparatorBefore"));
            Assert.Null(Value(@"AllFilesystemObjects\shell\LexPen.CompareTo", "SeparatorBefore"));
            Assert.NotNull(Value(@"AllFilesystemObjects\shell\LexPen.View", "SeparatorAfter"));
            Assert.Equal(new ExplorerMenu.Choice(true, true, false, false), ExplorerMenu.Installed);
            Assert.Equal(Exe, ExplorerMenu.InstalledExe);

            // In a submenu: one item LexPen for files, folders and both; the extension gives its items.
            ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(true, false, true, true, Backups: true));
            Assert.Equal("{136D8442-3780-48FE-9BB1-9C9D47F10E37}", Value(@"AllFilesystemObjects\shell\LexPen.Menu", "ExplorerCommandHandler"));
            Assert.Null(Value(@"AllFilesystemObjects\shell\LexPen.CompareLeft", "ExplorerCommandHandler"));
            Assert.Null(Value(@"*\shell\LexPen.Menu", "ExtendedSubCommandsKey"));
            Assert.Equal(new ExplorerMenu.Choice(true, false, true, true, true), ExplorerMenu.Installed);

            // The DLL gone (a LexPen built without it): registry entries, the extension gone (Explorer no longer loads it).
            ExplorerMenu.ShellDllForTests = false;
            ExplorerMenu.Apply(Exe, new ExplorerMenu.Choice(true, false, false, false));
            Assert.Equal("Select left side to compare", Label("*", "LexPen.CompareLeft"));
            Assert.Null(Value($@"CLSID\{LeftClsid}\InprocServer32", null));
            Assert.Null(Value("LexPen.Shell", "Exe"));
            Assert.Null(Value(@"AllFilesystemObjects\shell\LexPen.ComparePair", "ExplorerCommandHandler"));
            Assert.Null(Value(@"AllFilesystemObjects\shell\LexPen.Menu", "ExplorerCommandHandler"));
        }
        finally { ExplorerMenu.ShellDllForTests = false; }
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
