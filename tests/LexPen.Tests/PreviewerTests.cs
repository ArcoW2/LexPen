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

    // The settings previewerFile, previewerItem, previewerStream (3.1): the handler offers a host only the ways checked,
    // and always the handler itself; none checked: no handler.
    [Theory]
    [InlineData(true, true, true)]
    [InlineData(true, false, true)]
    [InlineData(false, true, false)]
    [InlineData(false, false, true)]
    public void TheHandlerOffersOnlyTheWaysChecked(bool file, bool item, bool stream)
    {
        var handler = PreviewHandler.Make(null!, file, item, stream)!;
        var unknown = Previewer.Wrappers.GetOrCreateComInterfaceForObject(handler, System.Runtime.InteropServices.CreateComInterfaceFlags.None);
        try
        {
            bool Offers(string iid)
            {
                var g = new Guid(iid);
                if (System.Runtime.InteropServices.Marshal.QueryInterface(unknown, in g, out var p) != 0) return false;
                System.Runtime.InteropServices.Marshal.Release(p);
                return true;
            }
            Assert.Equal(file, Offers("b7d14566-0509-4cce-a71f-0a554233bd9b"));     // IInitializeWithFile
            Assert.Equal(item, Offers("7f73be3f-fb79-493c-a6c7-7ee14e245841"));     // IInitializeWithItem
            Assert.Equal(stream, Offers("b824b49d-22ac-4161-ac8a-9916e8fa3f7f"));   // IInitializeWithStream
            Assert.True(Offers("8895b1c6-b41f-4c1c-a562-0d564250836f"));            // IPreviewHandler
            Assert.True(Offers("FC4801A3-2BA9-11CF-A229-00AA003D7352"));            // IObjectWithSite
        }
        finally { System.Runtime.InteropServices.Marshal.Release(unknown); }
        Assert.Null(PreviewHandler.Make(null!, false, false, false));
    }

    // The previewer's place per file (3.6): kept by path (case ignored), read back after a restart, the most recent
    // PreviewPlaces.Max only.
    [Fact]
    public void APlaceIsKeptPerFileAndOnlyTheMostRecentOnes()
    {
        var file = Path.Combine(Path.GetTempPath(), "lexpen-places-" + Guid.NewGuid().ToString("N"), "preview-places.json");
        try
        {
            var places = new PreviewPlaces(file);
            places.Set(@"C:\Docs\A.md", new System.Text.Json.Nodes.JsonObject { ["line"] = 12, ["ch"] = 3 });
            Assert.Equal(12, new PreviewPlaces(file).Get(@"c:\docs\a.md")!["line"]!.GetValue<int>());   // another LexPen, another case
            for (var i = 0; i < PreviewPlaces.Max; i++) places.Set($@"C:\Docs\{i}.md", new System.Text.Json.Nodes.JsonObject { ["line"] = i });
            var again = new PreviewPlaces(file);
            Assert.Null(again.Get(@"C:\Docs\A.md"));   // the oldest gone
            Assert.Equal(PreviewPlaces.Max - 1, again.Get($@"C:\Docs\{PreviewPlaces.Max - 1}.md")!["line"]!.GetValue<int>());
            Assert.NotNull(again.Get(@"C:\Docs\0.md"));
        }
        finally { Directory.Delete(Path.GetDirectoryName(file)!, true); }
    }

    // The previewer's outline open or closed per language (3.3): kept, read back after a restart, case ignored; none
    // set: null (closed).
    [Fact]
    public void TheOutlineIsKeptOpenOrClosedPerLanguage()
    {
        var file = Path.Combine(Path.GetTempPath(), "lexpen-outline-" + Guid.NewGuid().ToString("N"), "preview-outline.json");
        try
        {
            var outline = new PreviewOutline(file);
            Assert.Null(outline.Get("markdown"));
            outline.Set("markdown", true);
            outline.Set("sql", false);
            var again = new PreviewOutline(file);
            Assert.True(again.Get("Markdown"));
            Assert.False(again.Get("sql"));
            Assert.Null(again.Get("json"));
        }
        finally { Directory.Delete(Path.GetDirectoryName(file)!, true); }
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
