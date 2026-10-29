namespace LexPen.Tests;

public class BackupsTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-backups-" + Guid.NewGuid().ToString("N"));
    readonly Func<string, bool> recycle = Backups.Recycle;

    public BackupsTests()
    {
        Directory.CreateDirectory(dir);
        // Deleted for real: a test run does not fill the Recycle Bin.
        Backups.Recycle = p => { try { File.Delete(p); return !File.Exists(p); } catch (IOException) { return false; } };
    }

    public void Dispose()
    {
        Backups.Recycle = recycle;
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    string Made(string rel)
    {
        var path = Path.Combine(dir, rel);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, "x");
        return path;
    }

    static string[] Names(IEnumerable<string> paths) => paths.Select(Path.GetFileName).Order().ToArray()!;

    [Fact]
    public void OnlyBackupsWithTheirOriginal()
    {
        Made("a.md"); Made("a.md.bak");
        Made("b.txt"); Made("b.txt.BAK");
        Made("orphan.md.bak");            // no orphan.md: another program's
        Made("c.bakx");                    // not a .bak
        Assert.Equal(["a.md.bak", "b.txt.BAK"], Names(Backups.In(dir, subfolders: false)));
    }

    [Fact]
    public void SubfoldersOnlyWhenAsked()
    {
        Made("a.md"); Made("a.md.bak");
        Made(@"sub\deep\d.md"); Made(@"sub\deep\d.md.bak");
        Assert.Equal(["a.md.bak"], Names(Backups.In(dir, subfolders: false)));
        Assert.Equal(["a.md.bak", "d.md.bak"], Names(Backups.In(dir, subfolders: true)));
        Assert.True(Backups.Any(Path.Combine(dir, "sub")));
    }

    [Fact]
    public void NoneFound()
    {
        Made("a.md");
        Made("orphan.md.bak");
        Assert.False(Backups.Any(dir));
        Assert.Empty(Backups.In(Path.Combine(dir, "missing"), true));
    }

    [Fact]
    public void BackupOfAFile()
    {
        var a = Made("a.md");
        var b = Made("b.md");
        Made("a.md.bak");
        Assert.Equal(a + ".bak", Backups.Of(a));
        Assert.Null(Backups.Of(b));
    }

    [Fact]
    public void LockedFileLeftTheOthersDeleted()
    {
        Made("a.md"); var aBak = Made("a.md.bak");
        Made("b.md"); var bBak = Made("b.md.bak");
        using (new FileStream(aBak, FileMode.Open, FileAccess.Read, FileShare.None))
        {
            var (deleted, left) = Backups.Delete(Backups.In(dir, false).ToList());
            Assert.Equal(1, deleted);
            Assert.Equal([aBak], left);
        }
        Assert.False(File.Exists(bBak));
        Assert.True(File.Exists(aBak));
    }

    [Fact]
    public void GoneMeanwhileIsLeft()
    {
        var (deleted, left) = Backups.Delete([Path.Combine(dir, "gone.md.bak")]);
        Assert.Equal(0, deleted);
        Assert.Single(left);
    }
}
