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

    const string Shellex = @"shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}";

    [Fact]
    public void BindingAnExtensionKeepsTheHandlerBeforeAndPutsItBack()
    {
        const string theirs = "{11111111-2222-3333-4444-555555555555}";
        using (var key = Registry.CurrentUser.CreateSubKey($@"{testKey}\Classes\.md\{Shellex}")) key.SetValue(null, theirs);
        Previewer.Register(Exe, [".md", ".cs"]);

        Previewer.Bind(".md");
        Previewer.Bind(".cs");
        Assert.True(Previewer.IsBound(".md"));
        Assert.Equal(Previewer.Clsid.ToString("B"), Value($@"Classes\.md\{Shellex}"));

        Previewer.Unbind(".md");   // theirs again
        Previewer.Unbind(".cs");   // none before: none again
        Assert.False(Previewer.IsBound(".md"));
        Assert.Equal(theirs, Value($@"Classes\.md\{Shellex}"));
        Assert.Null(Value($@"Classes\.cs\{Shellex}"));
    }

    // IInitializeWithItem (3.1): a shell item of a file on disk gives its path; one that is no file on disk (in a zip)
    // its content and name, as a stream does.
    [Fact]
    public void AShellItemGivesItsFilesPathElseItsContent()
    {
        var dir = Path.Combine(Path.GetTempPath(), "lexpen-item-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var file = Path.Combine(dir, "note.md");
            File.WriteAllText(file, "# Hello");
            var item = ParsingName(file);
            try { Assert.Equal(file, ShellItem.FileSystemPath(item), ignoreCase: true); }
            finally { System.Runtime.InteropServices.Marshal.Release(item); }

            var zip = Path.Combine(dir, "pack.zip");
            using (var archive = System.IO.Compression.ZipFile.Open(zip, System.IO.Compression.ZipArchiveMode.Create))
            using (var w = new StreamWriter(archive.CreateEntry("inner.md").Open())) w.Write("# Inside");
            var inner = ParsingName(Path.Combine(zip, "inner.md"));
            try
            {
                Assert.Null(ShellItem.FileSystemPath(inner));
                var read = ShellItem.Read(inner);
                Assert.NotNull(read);
                Assert.Equal("# Inside", read.Value.Text);
                Assert.StartsWith("inner", read.Value.Name);
            }
            finally { System.Runtime.InteropServices.Marshal.Release(inner); }
        }
        finally { Directory.Delete(dir, true); }
    }

    static nint ParsingName(string path)
    {
        var iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");   // IShellItem
        Assert.Equal(0, SHCreateItemFromParsingName(path, 0, ref iid, out var item));
        return item;
    }

    [System.Runtime.InteropServices.DllImport("shell32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    static extern int SHCreateItemFromParsingName(string path, nint bindContext, ref Guid iid, out nint item);

    [Fact]
    public void UnregisterTakesTheClassAndItsListingOff()
    {
        Previewer.Register(Exe, [".md"]);
        Previewer.Bind(".md");
        Previewer.Unregister([".md"]);
        Assert.Null(Value($@"Classes\.md\{Shellex}"));   // unbound first
        Assert.Null(Value(Class));
        Assert.Null(Value(@"Microsoft\Windows\CurrentVersion\PreviewHandlers", Previewer.Clsid.ToString("B")));
        Assert.Null(Previewer.RegisteredExe);
    }
}
