namespace LexPen.Tests;

public class GitCompareTests
{
    static string Rows(string diff, string untracked) =>
        string.Join(" ", GitCompare.FolderRows(diff, untracked).Select(r => $"{r!["rel"]}{((bool)r["dir"]! ? "/" : ":" + r["state"])}"));

    [Fact]
    public void ChangedAddedDeletedAndUntrackedFiles()
    {
        var diff = "M\0b.md\0A\0new.md\0D\0gone.md\0T\0link\0";
        Assert.Equal("b.md:~ gone.md:< link:~ new.md:> todo.txt:>", Rows(diff, "todo.txt\0"));
    }

    [Fact]
    public void FoldersComeAsRowsBeforeFilesAtEveryLevel()
    {
        var diff = "M\0z.md\0M\0sub/deep/a.md\0D\0sub/b.md\0";
        Assert.Equal(@"sub/ sub\deep/ sub\deep\a.md:~ sub\b.md:< z.md:~", Rows(diff, ""));
        Assert.Equal(@"sub/ sub\deep/ sub\deep\a.md:~ sub\deep\new.txt:> sub\b.md:< z.md:~", Rows(diff, "sub/deep/new.txt\0"));
    }

    [Fact]
    public void NothingChanged() => Assert.Equal("", Rows("", ""));

    [Fact]
    public void CommitsAndBranches()
    {
        var log = "abc123\u001fabc\u001f2026-10-27\u001fA Writer\u001fFix: the thing\nfff000\u001ffff\u001f2026-10-01\u001fB\u001fFirst\n";
        var commits = GitCompare.Commits(log);
        Assert.Equal(2, commits.Count);
        Assert.Equal("abc", (string?)commits[0]!["short"]);
        Assert.Equal("Fix: the thing", (string?)commits[0]!["subject"]);
        Assert.Equal("main feature/x origin/main", string.Join(" ", GitCompare.Branches("main\nfeature/x\norigin/HEAD\norigin/main\n").Select(b => (string?)b)));
    }
}
