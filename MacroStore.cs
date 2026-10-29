namespace LexPen;

/// <summary>
/// The macros (docs/plans/executed/PLAN-macros.md 3.7): one file per macro in the data folder, macros\&lt;name&gt;.lpm, so a
/// macro is edited in a LexPen tab as any file and the files can be copied. A recording is a macro of its own, "Macro N"
/// with the lowest free number (docs/plans/executed/PLAN-macro-window.md).
/// </summary>
static class MacroStore
{
    public const string Folder = "macros", Extension = ".lpm";
    const string Recorded = "Macro ";
    // The one last recording of before (plan 17), turned into a Macro N once (MigrateLast).
    const string Last = "~last";

    public static string Dir(string dataDir) => Path.Combine(dataDir, Folder);

    /// <summary>The file of a macro; null when the name cannot be a file name.</summary>
    public static string? PathOf(string dataDir, string name) =>
        Refusal(name) is null ? Path.Combine(Dir(dataDir), name + Extension) : null;

    /// <summary>Why a name cannot be a macro's, or null.</summary>
    public static string? Refusal(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "a macro needs a name";
        if (name != name.Trim()) return "a name does not start or end with a space";
        if (name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return "a name cannot hold \\ / : * ? \" < > |";
        if (name.StartsWith('~') || name.StartsWith('.')) return "a name does not start with ~ or .";
        if (name.EndsWith('.')) return "a name does not end with a dot";
        return null;
    }

    /// <summary>The macros, by name.</summary>
    public static List<string> List(string dataDir)
    {
        var dir = Dir(dataDir);
        if (!Directory.Exists(dir)) return [];
        return Directory.EnumerateFiles(dir, "*" + Extension).Select(Path.GetFileNameWithoutExtension).OfType<string>()
            .Where(n => Refusal(n) is null).Order(StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>The name a new recording gets: "Macro N", N the lowest number no macro has.</summary>
    public static string NextName(string dataDir)
    {
        var taken = new HashSet<string>(List(dataDir), StringComparer.OrdinalIgnoreCase);
        var n = 1;
        while (taken.Contains(Recorded + n)) n++;
        return Recorded + n;
    }

    /// <summary>A recording saved as a macro of its own; gives its name.</summary>
    public static string WriteRecording(string dataDir, string text)
    {
        var name = NextName(dataDir);
        Write(dataDir, name, text);
        return name;
    }

    /// <summary>The macro written last (a recording, an edit), or null: what Play plays when nothing was played yet.</summary>
    public static string? Newest(string dataDir) =>
        List(dataDir).Select(n => (Name: n, At: File.GetLastWriteTimeUtc(PathOf(dataDir, n)!))).OrderByDescending(m => m.At)
            .Select(m => m.Name).FirstOrDefault();

    /// <summary>The last recording of before (~last.lpm) becomes a Macro N, once; gives its name, or null.</summary>
    public static string? MigrateLast(string dataDir)
    {
        var old = Path.Combine(Dir(dataDir), Last + Extension);
        if (!File.Exists(old)) return null;
        var name = NextName(dataDir);
        File.Move(old, PathOf(dataDir, name)!);
        return name;
    }

    public static string? Read(string dataDir, string name) =>
        PathOf(dataDir, name) is string path && File.Exists(path) ? File.ReadAllText(path) : null;

    public static void Write(string dataDir, string name, string text)
    {
        var path = PathOf(dataDir, name) ?? throw new ArgumentException(Refusal(name));
        Directory.CreateDirectory(Dir(dataDir));
        File.WriteAllText(path, text);
    }

    /// <summary>A macro under another name; null when done, else why not.</summary>
    public static string? Rename(string dataDir, string from, string to)
    {
        if (Refusal(to) is string why) return why;
        var source = PathOf(dataDir, from);
        if (source is null || !File.Exists(source)) return $"there is no macro \"{from}\"";
        var target = PathOf(dataDir, to)!;
        if (File.Exists(target) && !string.Equals(source, target, StringComparison.OrdinalIgnoreCase)) return $"a macro \"{to}\" exists already";
        File.Move(source, target, overwrite: true);
        return null;
    }

    public static void Delete(string dataDir, string name)
    {
        if (PathOf(dataDir, name) is string path && File.Exists(path)) File.Delete(path);
    }
}
