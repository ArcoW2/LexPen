using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// Compare with a git version (docs/plans/executed/PLAN-git-compare.md): git's output read into what the page shows. A
/// folder's changes against a version as the folder compare's rows (FolderCompare: rel, dir, state), each file
/// ~ changed, &gt; only in the folder (added, or not tracked), &lt; only in the version (deleted), its folders as rows too,
/// folders first at every level. The versions of a file or folder: its history and the branches.
/// </summary>
static class GitCompare
{
    /// <summary>The rows from `git diff --name-status -z --no-renames --relative` and `git ls-files --others -z`.</summary>
    public static JsonArray FolderRows(string diff, string untracked)
    {
        var files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var parts = diff.Split('\0');
        for (var i = 0; i + 1 < parts.Length; i += 2)
        {
            if (parts[i].Length == 0) continue;
            var state = parts[i][0] switch { 'A' => ">", 'D' => "<", _ => "~" };
            files[parts[i + 1].Replace('/', '\\')] = state;
        }
        foreach (var path in untracked.Split('\0'))
            if (path.Length > 0) files[path.Replace('/', '\\')] = ">";
        var rows = new List<(string Rel, bool Dir, string? State)>();
        var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (rel, state) in files)
        {
            rows.Add((rel, false, state));
            for (var cut = rel.LastIndexOf('\\'); cut > 0; cut = rel.LastIndexOf('\\', cut - 1))
                if (dirs.Add(rel[..cut])) rows.Add((rel[..cut], true, null));
        }
        rows.Sort((a, b) => Order(a.Rel, a.Dir, b.Rel, b.Dir));
        return new JsonArray(rows.Select(r => (JsonNode?)new JsonObject { ["rel"] = r.Rel, ["dir"] = r.Dir, ["state"] = r.State }).ToArray());
    }

    // Tree order: segment by segment; where they differ, a folder before a file, else by name.
    static int Order(string a, bool aDir, string b, bool bDir)
    {
        var x = a.Split('\\');
        var y = b.Split('\\');
        for (var i = 0; i < Math.Min(x.Length, y.Length); i++)
        {
            if (string.Equals(x[i], y[i], StringComparison.OrdinalIgnoreCase)) continue;
            bool xDir = i < x.Length - 1 || aDir, yDir = i < y.Length - 1 || bDir;
            if (xDir != yDir) return xDir ? -1 : 1;
            return string.Compare(x[i], y[i], StringComparison.OrdinalIgnoreCase);
        }
        return x.Length.CompareTo(y.Length);
    }

    /// <summary>The history from `git log --format=%H%x1f%h%x1f%ad%x1f%an%x1f%s`: [{ id, short, date, author, subject }].</summary>
    public static JsonArray Commits(string log) => new(log.Split('\n').Select(l => l.TrimEnd('\r').Split('\x1f'))
        .Where(f => f.Length == 5)
        .Select(f => (JsonNode?)new JsonObject { ["id"] = f[0], ["short"] = f[1], ["date"] = f[2], ["author"] = f[3], ["subject"] = f[4] }).ToArray());

    /// <summary>The branches from `git for-each-ref --format=%(refname:short) refs/heads refs/remotes`, without a
    /// remote's HEAD.</summary>
    public static JsonArray Branches(string refs) => new(refs.Split('\n').Select(l => l.Trim())
        .Where(l => l.Length > 0 && !l.EndsWith("/HEAD", StringComparison.Ordinal) && l != "origin")
        .Select(l => (JsonNode?)l).ToArray());
}
