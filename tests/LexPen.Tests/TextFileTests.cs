namespace LexPen.Tests;

public class TextFileTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-textfile-" + Guid.NewGuid().ToString("N"));

    public TextFileTests() => Directory.CreateDirectory(dir);

    public void Dispose() => Directory.Delete(dir, true);

    string FileWith(byte[] bytes)
    {
        var path = Path.Combine(dir, "notes.md");
        File.WriteAllBytes(path, bytes);
        return path;
    }

    [Theory]
    [InlineData(new byte[] { 0x63, 0x61, 0x66, 0xC3, 0xA9 }, TextFile.Utf8)]
    [InlineData(new byte[] { 0xEF, 0xBB, 0xBF, 0x63, 0x61, 0x66, 0xC3, 0xA9 }, TextFile.Utf8Bom)]
    [InlineData(new byte[] { 0xFF, 0xFE, 0x63, 0, 0x61, 0, 0x66, 0, 0xE9, 0 }, TextFile.Utf16Le)]
    [InlineData(new byte[] { 0xFE, 0xFF, 0, 0x63, 0, 0x61, 0, 0x66, 0, 0xE9 }, TextFile.Utf16Be)]
    [InlineData(new byte[] { 0x63, 0x61, 0x66, 0xE9 }, TextFile.Ansi)]   // e-acute in Windows-1252, not valid UTF-8
    public void ReadsAndWritesBackInTheSameEncoding(byte[] bytes, string encoding)
    {
        var (text, found) = TextFile.Decode(bytes);
        Assert.Equal("caf\u00e9", text);
        Assert.Equal(encoding, found);

        var path = FileWith(bytes);
        TextFile.Write(path, text, found, backup: false);
        Assert.Equal(bytes, File.ReadAllBytes(path));
    }

    [Fact]
    public void AnsiRefusesCharactersItCannotHold()
    {
        var path = FileWith([0x61]);
        var ex = Assert.Throws<IOException>(() => TextFile.Write(path, "a\u4e2d", TextFile.Ansi, backup: true));
        Assert.Contains("ANSI", ex.Message);
        Assert.Equal([0x61], File.ReadAllBytes(path));   // nothing written, no backup either
        Assert.False(File.Exists(path + ".bak"));
    }

    [Fact]
    public void BackupKeepsThePreviousVersionAndIsOverwritten()
    {
        var path = FileWith("one"u8.ToArray());
        TextFile.Write(path, "two", TextFile.Utf8, backup: true);
        Assert.Equal("two", File.ReadAllText(path));
        Assert.Equal("one", File.ReadAllText(path + ".bak"));

        TextFile.Write(path, "three", TextFile.Utf8, backup: true);
        Assert.Equal("three", File.ReadAllText(path));
        Assert.Equal("two", File.ReadAllText(path + ".bak"));
    }

    [Fact]
    public void NoBackupWhenOffOrForANewFile()
    {
        var path = FileWith("one"u8.ToArray());
        TextFile.Write(path, "two", TextFile.Utf8, backup: false);
        Assert.False(File.Exists(path + ".bak"));

        var fresh = Path.Combine(dir, "new.md");
        TextFile.Write(fresh, "new", TextFile.Utf8, backup: true);
        Assert.Equal("new", File.ReadAllText(fresh));
        Assert.False(File.Exists(fresh + ".bak"));
    }

    [Fact]
    public void LeavesNoTemporaryFiles()
    {
        var path = FileWith("one"u8.ToArray());
        TextFile.Write(path, "two", TextFile.Utf8, backup: true);
        TextFile.Write(Path.Combine(dir, "new.md"), "new", TextFile.Utf8, backup: true);
        Assert.Equal(["new.md", "notes.md", "notes.md.bak"], Directory.GetFiles(dir).Select(Path.GetFileName).Order());
    }
}
