using System.Text;
using System.Text.RegularExpressions;

namespace LexPen;

/// <summary>
/// Two folders compared (docs/plans/executed/PLAN-file-compare.md 3.5). First by what the file system says: both trees
/// listed, a file in one only, another size, or the same size and date (equal for now), or the same size and another
/// date (to check). Then, in the background, the contents of the ones to check, byte by byte (and as text with the
/// compare's options when those are on). Read-only: nothing is changed on disk.
/// </summary>
static class FolderCompare
{
    /// <summary>A file or folder of either tree: its path relative to the compared folders and what is known so far.</summary>
    /// <param name="State">"=" equal, "~" different, "?" to check (same size, another date), "&lt;" only on the
    /// left, "&gt;" only on the right; a folder: "" (its rows say it), or "&lt;" / "&gt;" for a folder on one side.</param>
    public sealed record Row(string Rel, bool Dir, string State, long? LeftSize, DateTime? LeftTime, long? RightSize, DateTime? RightTime);

    // Git's own data, not the files compared.
    static readonly HashSet<string> Skipped = new(StringComparer.OrdinalIgnoreCase) { ".git" };

    /// <summary>Both trees, merged and sorted (folders first within a folder, then by name, ignoring case).</summary>
    public static List<Row> List(string left, string right)
    {
        var a = Entries(left);
        var b = Entries(right);
        var rows = new List<Row>();
        foreach (var rel in a.Keys.Union(b.Keys, StringComparer.OrdinalIgnoreCase))
        {
            a.TryGetValue(rel, out var x);
            b.TryGetValue(rel, out var y);
            var dir = (x ?? y)!.Dir;
            string state;
            if (x is null) state = ">";
            else if (y is null) state = "<";
            else if (dir) state = "";
            else if (x.Size != y.Size) state = "~";
            else state = Math.Abs((x.Time - y.Time).TotalSeconds) <= 2 ? "=" : "?";   // FAT keeps time to 2 seconds
            rows.Add(new Row(rel, dir, state, x?.Size, x?.Time, y?.Size, y?.Time));
        }
        rows.Sort((p, q) => CompareRel(p, q));
        return rows;
    }

    // Folders before files within the same folder, then by name.
    static int CompareRel(Row p, Row q)
    {
        var ps = p.Rel.Split('\\');
        var qs = q.Rel.Split('\\');
        for (var i = 0; i < Math.Min(ps.Length, qs.Length); i++)
        {
            var c = string.Compare(ps[i], qs[i], StringComparison.OrdinalIgnoreCase);
            if (c == 0) continue;
            var pDir = i < ps.Length - 1 || p.Dir;
            var qDir = i < qs.Length - 1 || q.Dir;
            return pDir != qDir ? (pDir ? -1 : 1) : c;
        }
        return ps.Length.CompareTo(qs.Length);
    }

    sealed record Entry(bool Dir, long Size, DateTime Time);

    static Dictionary<string, Entry> Entries(string root)
    {
        var found = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
        var options = new EnumerationOptions { RecurseSubdirectories = false, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
        var stack = new Stack<string>([root]);
        while (stack.Count > 0)
        {
            var dir = stack.Pop();
            foreach (var info in new DirectoryInfo(dir).EnumerateFileSystemInfos("*", options))
            {
                var rel = Path.GetRelativePath(root, info.FullName);
                if (info is DirectoryInfo d)
                {
                    if (Skipped.Contains(d.Name)) continue;
                    found[rel] = new Entry(true, 0, d.LastWriteTimeUtc);
                    stack.Push(d.FullName);
                }
                else if (info is FileInfo f) found[rel] = new Entry(false, f.Length, f.LastWriteTimeUtc);
            }
        }
        return found;
    }

    /// <summary>True when the two files hold the same bytes (streamed; stops at the first difference).</summary>
    public static bool SameBytes(string a, string b, CancellationToken stop = default)
    {
        using var x = new FileStream(a, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16);
        using var y = new FileStream(b, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16);
        if (x.Length != y.Length) return false;
        var bx = new byte[1 << 16];
        var by = new byte[1 << 16];
        while (true)
        {
            stop.ThrowIfCancellationRequested();
            var n = x.ReadAtLeast(bx, bx.Length, throwOnEndOfStream: false);
            var m = y.ReadAtLeast(by, by.Length, throwOnEndOfStream: false);
            if (n != m || !bx.AsSpan(0, n).SequenceEqual(by.AsSpan(0, m))) return false;
            if (n == 0) return true;
        }
    }

    /// <summary>
    /// True when two text files are the same with the compare's options: whitespace (its amount inside a line and the
    /// spaces at the ends do not count, nor empty lines) and case. A file that is not text (a NUL byte), or larger than
    /// TextLimit, is not compared this way: false.
    /// </summary>
    public static bool SameText(string a, string b, bool whitespace, bool ignoreCase)
    {
        const long TextLimit = 20 << 20;
        if (new FileInfo(a).Length > TextLimit || new FileInfo(b).Length > TextLimit) return false;
        var ta = File.ReadAllText(a);
        var tb = File.ReadAllText(b);
        if (ta.Contains('\0') || tb.Contains('\0')) return false;
        return Keys(ta, whitespace, ignoreCase).SequenceEqual(Keys(tb, whitespace, ignoreCase));
    }

    // The lines as the compare sees them (as compareLines in web/diff.js): line endings never count.
    static IEnumerable<string> Keys(string text, bool whitespace, bool ignoreCase)
    {
        foreach (var raw in Regex.Split(text, "\r\n|\r|\n"))
        {
            var k = whitespace ? Regex.Replace(raw, "[ \t]+", " ").Trim() : raw;
            if (ignoreCase) k = k.ToLowerInvariant();
            if (whitespace && k.Length == 0) continue;
            yield return k;
        }
    }
}
