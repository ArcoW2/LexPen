using Microsoft.Win32;

namespace LexPen.Tests;

// File types (FileTypes, docs/plans/executed/PLAN-file-types.md). The registry entries go below a key of their own
// (LEXPEN_REGISTRY_ROOT), removed afterwards: never the real associations.
[Collection("Registry")]   // with ExplorerMenuTests: both set LEXPEN_REGISTRY_ROOT, never at the same time
public class FileTypesTests : IDisposable
{
    readonly string testKey = @"Software\LexPenTest-" + Guid.NewGuid().ToString("N");
    const string Exe = @"C:\Apps\LexPen\LexPen.exe";

    public FileTypesTests() => Environment.SetEnvironmentVariable("LEXPEN_REGISTRY_ROOT", testKey + @"\Classes");

    public void Dispose()
    {
        Registry.CurrentUser.DeleteSubKeyTree(testKey, throwOnMissingSubKey: false);
        Environment.SetEnvironmentVariable("LEXPEN_REGISTRY_ROOT", null);
    }

    object? Value(string path, string? name = null)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\{path}");
        return key?.GetValue(name);
    }

    bool Exists(string path)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{testKey}\{path}");
        return key is not null;
    }

    static readonly string[] Known = [".sql", ".md", ".json", ".ini"];

    [Fact]
    public void AnExtensionToEditAndOneToView()
    {
        FileTypes.Assign(Exe, [new(".sql", "asa", "Sybase ASA SQL", "edit"), new(".md", "markdown", "Markdown", "view")], Known);
        Assert.Equal("LexPen.asa.edit", Value(@"Classes\.sql"));
        Assert.Equal("LexPen.markdown.view", Value(@"Classes\.md"));
        Assert.Equal("", Value(@"Classes\.sql\OpenWithProgids", "LexPen.asa.edit"));
        Assert.Equal($"\"{Exe}\" \"%1\"", Value(@"Classes\LexPen.asa.edit\shell\open\command"));
        Assert.Equal($"\"{Exe}\" --view \"%1\"", Value(@"Classes\LexPen.markdown.view\shell\open\command"));
        Assert.Equal("Sybase ASA SQL file", Value(@"Classes\LexPen.asa.edit"));
        Assert.Equal($"\"{Exe}\",0", Value(@"Classes\LexPen.asa.edit\DefaultIcon"));
        Assert.Equal("", Value(@"Classes\Applications\LexPen.exe\SupportedTypes", ".md"));
        Assert.Equal("LexPen.markdown.view", Value(@"LexPen\Capabilities\FileAssociations", ".md"));
        Assert.Equal(@"Software\LexPen\Capabilities", Value("RegisteredApplications", "LexPen"));
        Assert.Equal("edit", FileTypes.ModeOf(".sql"));
        Assert.Equal("view", FileTypes.ModeOf(".md"));
        Assert.Null(FileTypes.ModeOf(".json"));
    }

    [Fact]
    public void AChoiceForAnotherAppIsRemovedForAnExtensionAssignedOnly()
    {
        using (var c = Registry.CurrentUser.CreateSubKey($@"{testKey}\FileExts\.sql\UserChoice")) c.SetValue("ProgId", "Other.sql");
        using (var c = Registry.CurrentUser.CreateSubKey($@"{testKey}\FileExts\.json\UserChoice")) c.SetValue("ProgId", "Other.json");
        FileTypes.Assign(Exe, [new(".sql", "asa", "Sybase ASA SQL", "edit")], Known);
        Assert.False(Exists(@"FileExts\.sql\UserChoice"));
        Assert.True(Exists(@"FileExts\.json\UserChoice"));   // not assigned: your choice stays
    }

    [Fact]
    public void UncheckedTakesLexPenOffAndNothingElse()
    {
        using (var other = Registry.CurrentUser.CreateSubKey($@"{testKey}\Classes\.json")) other.SetValue(null, "Other.json");
        FileTypes.Assign(Exe, [new(".sql", "asa", "Sybase ASA SQL", "edit"), new(".md", "markdown", "Markdown", "edit")], Known);
        FileTypes.Assign(Exe, [new(".md", "markdown", "Markdown", "edit")], Known);
        Assert.Null(Value(@"Classes\.sql"));
        Assert.Null(Value(@"Classes\.sql\OpenWithProgids", "LexPen.asa.edit"));
        Assert.Null(Value(@"Classes\Applications\LexPen.exe\SupportedTypes", ".sql"));
        Assert.Null(Value(@"LexPen\Capabilities\FileAssociations", ".sql"));
        Assert.False(Exists(@"Classes\LexPen.asa.edit"));             // no extension uses it any more
        Assert.Equal("Other.json", Value(@"Classes\.json"));          // another app's: not LexPen's to take off
        Assert.Equal("LexPen.markdown.edit", Value(@"Classes\.md"));
    }

    [Fact]
    public void FromEditToViewTheOldTypeGoesFromOpenWith()
    {
        FileTypes.Assign(Exe, [new(".md", "markdown", "Markdown", "edit")], Known);
        FileTypes.Assign(Exe, [new(".md", "markdown", "Markdown", "view")], Known);
        Assert.Equal("LexPen.markdown.view", Value(@"Classes\.md"));
        Assert.Null(Value(@"Classes\.md\OpenWithProgids", "LexPen.markdown.edit"));
        Assert.False(Exists(@"Classes\LexPen.markdown.edit"));
    }

    [Fact]
    public void TheOldMarkdownTypeOfRegisterPs1Goes()
    {
        using (var md = Registry.CurrentUser.CreateSubKey($@"{testKey}\Classes\.md"))
        {
            md.SetValue(null, "LexPen.Document");
            using var progIds = md.CreateSubKey("OpenWithProgids");
            progIds.SetValue("LexPen.Document", "");
        }
        using (var old = Registry.CurrentUser.CreateSubKey($@"{testKey}\Classes\LexPen.Document")) old.SetValue(null, "Markdown Document");
        Assert.Equal("edit", FileTypes.ModeOf(".md"));   // counted as LexPen's
        FileTypes.Assign(Exe, [new(".sql", "asa", "Sybase ASA SQL", "edit")], Known);
        Assert.Null(Value(@"Classes\.md"));
        Assert.Null(Value(@"Classes\.md\OpenWithProgids", "LexPen.Document"));
        Assert.False(Exists(@"Classes\LexPen.Document"));
    }

    [Fact]
    public void NoneCheckedTakesLexPenOffDefaultAppsToo()
    {
        FileTypes.Assign(Exe, [new(".sql", "asa", "Sybase ASA SQL", "edit")], Known);
        FileTypes.Assign(Exe, [], Known);
        Assert.Null(Value(@"Classes\.sql"));
        Assert.False(Exists(@"LexPen"));
        Assert.Null(Value("RegisteredApplications", "LexPen"));
    }
}
