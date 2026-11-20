using Microsoft.Win32;

namespace LexPen.Tests;

// The preview handler's registration (Previewer, docs/plans/PLAN-preview-handler.md 3.8). Below a key of its own
// (LEXPEN_REGISTRY_ROOT), removed afterwards: never the real one.
[Collection("Registry")]
public class PreviewerTests : IDisposable
{
    readonly string testKey = @"Software\LexPenTest-" + Guid.NewGuid().ToString("N");
    const string Exe = @"C:\Apps\LexPen\LexPen.exe";
    static readonly string Class = $@"Classes\CLSID\{Previewer.Clsid:B}";

    public PreviewerTests() => Environment.SetEnvironmentVariable("LEXPEN_REGISTRY_ROOT", testKey + @"\Classes");

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

    [Fact]
    public void TheClassIsListedAsAPreviewHandlerWithTheExtensionsItShows()
    {
        Previewer.Register(Exe, [".md", ".cs", ".pdf"]);
        Assert.Equal(Previewer.Name, Value(Class));
        Assert.Equal($"\"{Exe}\"", Value(Class + @"\LocalServer32"));
        Assert.Equal([".cs", ".md", ".pdf"], (string[])Value(Class, "Extensions")!);
        Assert.Equal(Previewer.Name, Value(@"Microsoft\Windows\CurrentVersion\PreviewHandlers", Previewer.Clsid.ToString("B")));
        Assert.Equal(Exe, Previewer.RegisteredExe);
        // Binds nothing: no extension's shellex is written.
        Assert.Null(Value(@"Classes\.md\shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}"));
    }

    [Fact]
    public void RefreshKeepsAnotherLexPensAndTakesOverOneThatIsGone()
    {
        var other = typeof(PreviewerTests).Assembly.Location;   // a file that exists: another LexPen
        Previewer.Register(other, [".md"]);
        Previewer.Refresh(Exe, [".md", ".cs"]);
        Assert.Equal(other, Previewer.RegisteredExe);

        Previewer.Register(@"C:\Gone\LexPen.exe", [".md"]);   // moved: its exe is gone
        Previewer.Refresh(Exe, [".md", ".cs"]);
        Assert.Equal(Exe, Previewer.RegisteredExe);
        Assert.Equal([".cs", ".md"], (string[])Value(Class, "Extensions")!);
    }

    [Fact]
    public void UnregisterTakesTheClassAndItsListingOff()
    {
        Previewer.Register(Exe, [".md"]);
        Previewer.Unregister();
        Assert.Null(Value(Class));
        Assert.Null(Value(@"Microsoft\Windows\CurrentVersion\PreviewHandlers", Previewer.Clsid.ToString("B")));
        Assert.Null(Previewer.RegisteredExe);
    }
}
