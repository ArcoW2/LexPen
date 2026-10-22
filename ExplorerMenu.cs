using Microsoft.Win32;

namespace LexPen;

/// <summary>
/// Compare from Windows Explorer's right-click menu (docs/plans/executed/PLAN-explorer-compare.md): "Select left side to
/// compare" on files and folders, and once a left side is chosen "Compare to &lt;its name&gt;", which runs
/// --compare. Registry entries for the current user only (HKCU\Software\Classes, or LEXPEN_REGISTRY_ROOT below
/// HKCU for the tests), written when the setting explorerCompare is turned on, removed when it is turned off. The left
/// side is a file in the state folder, shared by every LexPen process (also the one that only selects it and exits).
/// </summary>
static class ExplorerMenu
{
    const string LeftVerb = "LexPen.CompareLeft";
    const string ToVerb = "LexPen.CompareTo";
    static readonly string[] Kinds = ["*", "Directory"];   // files, folders

    static string Root => Environment.GetEnvironmentVariable("LEXPEN_REGISTRY_ROOT") is { Length: > 0 } root ? root : @"Software\Classes";
    static string LeftFile => LeftFileForTests ?? DataFolder.StatePath(AppHost.DataDir, "compare-left.txt");
    internal static string? LeftFileForTests;

    /// <summary>The left side chosen, or null.</summary>
    public static string? Left
    {
        get
        {
            try { return File.ReadAllText(LeftFile).Trim() is { Length: > 0 } p ? p : null; }
            catch (IOException) { return null; }
        }
    }

    /// <summary>The exe the entries run, or null when they are not there.</summary>
    public static string? InstalledExe
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey($@"{Root}\*\shell\{LeftVerb}\command");
            return key?.GetValue(null) is string command ? ExeOf(command) : null;
        }
    }

    // The exe of a command line: the quoted first part.
    internal static string ExeOf(string command) =>
        command.StartsWith('"') && command.IndexOf('"', 1) is var end and > 0 ? command[1..end] : command.Split(' ')[0];

    /// <summary>The setting turned on: the entries, running this exe.</summary>
    public static void Install(string exe) => Write(exe, Left);

    /// <summary>The setting turned off: the entries and the left side gone.</summary>
    public static void Remove()
    {
        foreach (var kind in Kinds)
            foreach (var verb in new[] { LeftVerb, ToVerb })
                Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\{kind}\shell\{verb}", throwOnMissingSubKey: false);
        try { File.Delete(LeftFile); } catch (IOException) { }
    }

    /// <summary>A left side chosen (Explorer, the folder pane, a tab): kept, and the entries say so.</summary>
    public static void SelectLeft(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(LeftFile)!);
        File.WriteAllText(LeftFile, path);
        if (InstalledExe is string exe) Write(exe, path);
    }

    /// <summary>The left side forgotten (it no longer exists).</summary>
    public static void ClearLeft()
    {
        try { File.Delete(LeftFile); } catch (IOException) { }
        if (InstalledExe is string exe) Write(exe, null);
    }

    /// <summary>How a left side is named in the entries: its file or folder name (a drive: as it is).</summary>
    public static string NameOf(string path) => Path.GetFileName(path.TrimEnd('\\')) is { Length: > 0 } name ? name : path;

    // Select left side on files and folders; Compare to on the kind the left side is (a file against a folder is no
    // compare).
    static void Write(string exe, string? left)
    {
        var leftIsFolder = left is not null && Directory.Exists(left);
        foreach (var kind in Kinds)
        {
            Verb(kind, LeftVerb, left is null ? "Select left side to compare" : "Select as new left side to compare",
                Icon(exe, "compare-left.ico"), $"\"{exe}\" --compare-left \"%1\"");
            if (left is not null && (kind == "Directory") == leftIsFolder)
                Verb(kind, ToVerb, $"Compare to {NameOf(left)}", Icon(exe, "compare-to.ico"), $"\"{exe}\" --compare \"{left}\" \"%1\"");
            else Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\{kind}\shell\{ToVerb}", throwOnMissingSubKey: false);
        }
    }

    // The entries' icons (made from img\icon\compare-*.svg) ship next to the exe.
    static string Icon(string exe, string file) => Path.Combine(Path.GetDirectoryName(exe)!, file);

    static void Verb(string kind, string verb, string label, string icon, string command)
    {
        using var key = Registry.CurrentUser.CreateSubKey($@"{Root}\{kind}\shell\{verb}");
        key.SetValue("MUIVerb", label);
        key.SetValue("Icon", $"\"{icon}\"");
        using var cmd = key.CreateSubKey("command");
        cmd.SetValue(null, command);
    }
}
