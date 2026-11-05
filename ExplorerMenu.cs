using Microsoft.Win32;

namespace LexPen;

/// <summary>
/// LexPen in Windows Explorer's right-click menu (docs/plans/executed/PLAN-explorer-compare.md,
/// docs/plans/executed/PLAN-view-window.md). Compare: "Select left side to compare" on files and folders, and once a left side
/// is chosen "Compare to &lt;its name&gt;", which runs --compare. View: "View in LexPen" on files and folders (--view).
/// Edit: "Edit in LexPen" on files (--edit). Backups: "Delete .bak file" on files, "Delete all .bak files" on folders
/// (--delete-backups, plan 33; a fixed entry, so it shows on every file and does nothing on one without a backup).
/// Which of them, and where (Choice): next to each other between two lines, or in a submenu "LexPen". Registry entries for the current user only (HKCU\Software\Classes, or
/// LEXPEN_REGISTRY_ROOT below HKCU for the tests), written when the settings change (Apply). The left side is a file in
/// the state folder, shared by every LexPen process (also the one that only selects it and exits).
/// </summary>
static class ExplorerMenu
{
    const string LeftVerb = "LexPen.CompareLeft";
    const string ToVerb = "LexPen.CompareTo";
    const string PairVerb = "LexPen.ComparePair";   // the extension's Compare: two items
    const string EditVerb = "LexPen.Edit";
    const string ViewVerb = "LexPen.View";
    const string BackupsVerb = "LexPen.DeleteBackups";
    const string MenuVerb = "LexPen.Menu";
    static readonly string[] Kinds = ["*", "Directory"];   // files, folders
    // Explorer puts the entries of a kind in the order of their key names: compare, delete backups, edit, view.
    static readonly string[] Verbs = [LeftVerb, PairVerb, ToVerb, BackupsVerb, EditVerb, ViewVerb];

    // The Explorer extension (LexPenShell.dll, shell\LexPenShell.cpp; docs/plans/40-PLAN-explorer-compare-two.md): its
    // three commands, each a class of its own, shown by what is selected. What they need from LexPen is in ShellKey.
    public const string ShellDll = "LexPenShell.dll";
    static readonly (string Verb, string Clsid)[] ShellCommands = [
        (LeftVerb, "{E47540AF-B66D-4FAF-849E-D0B2D0D28E65}"), (ToVerb, "{1658ED18-A409-45B4-B31F-C2E8895D23A9}"),
        (PairVerb, "{367A334E-ECD6-4031-AC52-899B5F49C42C}")];
    const string ShellKey = "LexPen.Shell";
    const string AllKind = "AllFilesystemObjects";   // files and folders in one: a file with a folder selected too

    /// <summary>The settings explorerCompare, explorerView, explorerEdit, explorerPlace ("submenu") and explorerBackups.
    /// The compare items are the Explorer extension's when LexPenShell.dll is next to the exe, else registry entries.</summary>
    public sealed record Choice(bool Compare, bool View, bool Edit, bool Submenu, bool Backups = false)
    {
        public bool Any => Compare || View || Edit || Backups;
    }

    static string Root => Environment.GetEnvironmentVariable("LEXPEN_REGISTRY_ROOT") is { Length: > 0 } root ? root : @"Software\Classes";
    static string LeftFile => LeftFileForTests ?? DataFolder.StatePath(AppHost.DataDir, "compare-left.txt");
    internal static string? LeftFileForTests;

    // The submenu's items: a key of LexPen's own per kind, its shell holding them (ExtendedSubCommandsKey, a key below
    // HKEY_CLASSES_ROOT).
    static string SubKey(string kind) => kind == "*" ? "LexPen.Menu.Files" : "LexPen.Menu.Folders";
    static string ShellOf(string kind, bool submenu) => submenu ? $@"{Root}\{SubKey(kind)}\shell" : $@"{Root}\{kind}\shell";

    static bool Has(string path)
    {
        using var key = Registry.CurrentUser.OpenSubKey(path);
        return key is not null;
    }

    /// <summary>The left side chosen, or null.</summary>
    public static string? Left
    {
        get
        {
            try { return File.ReadAllText(LeftFile).Trim() is { Length: > 0 } p ? p : null; }
            catch (IOException) { return null; }
        }
    }

    /// <summary>What the entries are now (from the registry), or null when there are none.</summary>
    public static Choice? Installed
    {
        get
        {
            var submenu = Kinds.Any(kind => Has($@"{Root}\{kind}\shell\{MenuVerb}"));
            var c = new Choice(Has($@"{ShellOf("*", submenu)}\{LeftVerb}") || Has($@"{Root}\{AllKind}\shell\{LeftVerb}"),
                Kinds.Any(kind => Has($@"{ShellOf(kind, submenu)}\{ViewVerb}")), Has($@"{ShellOf("*", submenu)}\{EditVerb}"), submenu,
                Kinds.Any(kind => Has($@"{ShellOf(kind, submenu)}\{BackupsVerb}")));
            return c.Any ? c : null;
        }
    }

    /// <summary>The exe the entries run, or null when they are not there.</summary>
    public static string? InstalledExe
    {
        get
        {
            if (Installed is not Choice c) return null;
            using (var shell = Registry.CurrentUser.OpenSubKey($@"{Root}\{ShellKey}"))
                if (shell?.GetValue("Exe") is string exe) return exe;
            foreach (var verb in Verbs)
            {
                using var key = Registry.CurrentUser.OpenSubKey($@"{ShellOf("*", c.Submenu)}\{verb}\command");
                if (key?.GetValue(null) is string command) return ExeOf(command);
            }
            return null;
        }
    }

    // The exe of a command line: the quoted first part.
    internal static string ExeOf(string command) =>
        command.StartsWith('"') && command.IndexOf('"', 1) is var end and > 0 ? command[1..end] : command.Split(' ')[0];

    /// <summary>The settings changed: the entries they choose, running this exe; none chosen, none there.</summary>
    public static void Apply(string exe, Choice choice)
    {
        Clear();
        if (choice.Any) Write(exe, choice, Left);
    }

    /// <summary>The compare entries only, next to each other (the setting explorerCompare on its own).</summary>
    public static void Install(string exe) => Apply(exe, new Choice(true, false, false, false));

    /// <summary>Every entry and the left side gone.</summary>
    public static void Remove()
    {
        Clear();
        try { File.Delete(LeftFile); } catch (IOException) { }
    }

    /// <summary>A left side chosen (Explorer, the folder pane, a tab): kept, and the entries say so.</summary>
    public static void SelectLeft(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(LeftFile)!);
        File.WriteAllText(LeftFile, path);
        if (Installed is Choice c && InstalledExe is string exe) { Clear(); Write(exe, c, path); }
    }

    /// <summary>The left side forgotten (it no longer exists).</summary>
    public static void ClearLeft()
    {
        try { File.Delete(LeftFile); } catch (IOException) { }
        if (Installed is Choice c && InstalledExe is string exe) { Clear(); Write(exe, c, null); }
    }

    /// <summary>How a left side is named in the entries: its file or folder name (a drive: as it is).</summary>
    public static string NameOf(string path) => Path.GetFileName(path.TrimEnd('\\')) is { Length: > 0 } name ? name : path;

    // Every entry of LexPen, in either place.
    static void Clear()
    {
        foreach (var kind in Kinds)
        {
            foreach (var verb in Verbs.Append(MenuVerb))
                Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\{kind}\shell\{verb}", throwOnMissingSubKey: false);
            Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\{SubKey(kind)}", throwOnMissingSubKey: false);
        }
        // The extension: its items, its classes (Explorer no longer loads the DLL then) and what it reads.
        foreach (var (verb, clsid) in ShellCommands)
        {
            Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\{AllKind}\shell\{verb}", throwOnMissingSubKey: false);
            Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\CLSID\{clsid}", throwOnMissingSubKey: false);
        }
        Registry.CurrentUser.DeleteSubKeyTree($@"{Root}\{ShellKey}", throwOnMissingSubKey: false);
    }

    // Select left side on files and folders, Compare to on the kind the left side is (a file against a folder is no
    // compare); Edit on files; View on both. Next to each other: a line before the first and after the last. In a
    // submenu: one entry "LexPen" per kind, its items in a key of their own.
    static void Write(string exe, Choice c, string? left)
    {
        var leftIsFolder = left is not null && Directory.Exists(left);
        var lexpen = $"\"{exe}\",0";   // LexPen's own icon
        // The compare items by the extension when it is next to the exe (not built: the registry entries).
        var dll = Path.Combine(Path.GetDirectoryName(exe)!, ShellDll);
        var byShell = c.Compare && (File.Exists(dll) || ShellDllForTests);
        if (byShell) WriteShell(exe, dll, c.Submenu);
        foreach (var kind in Kinds)
        {
            var shell = ShellOf(kind, c.Submenu);
            var written = new List<string>();
            if (byShell && c.Submenu)   // in the submenu of files and of folders (a file with a folder: none)
                foreach (var (verb, clsid) in ShellCommands)
                {
                    ShellVerb(shell, verb, clsid);
                    written.Add(verb);
                }
            if (c.Compare && !byShell)
            {
                Verb(shell, LeftVerb, left is null ? "Select left side to compare" : "Select as new left side to compare",
                    lexpen, $"\"{exe}\" --compare-left \"%1\"");
                written.Add(LeftVerb);
                if (left is not null && (kind == "Directory") == leftIsFolder)
                {
                    Verb(shell, ToVerb, $"Compare to {NameOf(left)}", lexpen, $"\"{exe}\" --compare \"{left}\" \"%1\"");
                    written.Add(ToVerb);
                }
            }
            if (c.Backups)
            {
                Verb(shell, BackupsVerb, kind == "*" ? "Delete .bak file" : "Delete all .bak files", lexpen, $"\"{exe}\" --delete-backups \"%1\"");
                written.Add(BackupsVerb);
            }
            if (c.Edit && kind == "*")
            {
                Verb(shell, EditVerb, "Edit in LexPen", lexpen, $"\"{exe}\" --edit \"%1\"");
                written.Add(EditVerb);
            }
            if (c.View)
            {
                Verb(shell, ViewVerb, "View in LexPen", lexpen, $"\"{exe}\" --view \"%1\"");
                written.Add(ViewVerb);
            }
            if (written.Count == 0) continue;
            if (c.Submenu)
            {
                using var menu = Registry.CurrentUser.CreateSubKey($@"{Root}\{kind}\shell\{MenuVerb}");
                menu.SetValue("MUIVerb", "LexPen");
                menu.SetValue("Icon", lexpen);
                menu.SetValue("ExtendedSubCommandsKey", SubKey(kind));
            }
            else
            {
                written.Sort(StringComparer.OrdinalIgnoreCase);   // the order Explorer shows them in
                using (var first = Registry.CurrentUser.OpenSubKey($@"{shell}\{written[0]}", writable: true)) first!.SetValue("SeparatorBefore", "");
                using (var last = Registry.CurrentUser.OpenSubKey($@"{shell}\{written[^1]}", writable: true)) last!.SetValue("SeparatorAfter", "");
            }
        }
    }

    internal static bool ShellDllForTests;

    // The extension: its classes (in-process, the DLL next to the exe), what it reads (the exe, the left side's file),
    // and between two lines its items once for files and folders together (in a submenu: Write puts them there).
    static void WriteShell(string exe, string dll, bool submenu)
    {
        foreach (var (_, clsid) in ShellCommands)
        {
            using var server = Registry.CurrentUser.CreateSubKey($@"{Root}\CLSID\{clsid}\InprocServer32");
            server.SetValue(null, dll);
            server.SetValue("ThreadingModel", "Apartment");
        }
        using (var config = Registry.CurrentUser.CreateSubKey($@"{Root}\{ShellKey}"))
        {
            config.SetValue("Exe", exe);
            config.SetValue("LeftFile", LeftFile);
        }
        if (submenu) return;
        foreach (var (verb, clsid) in ShellCommands)
        {
            var path = ShellVerb($@"{Root}\{AllKind}\shell", verb, clsid);
            // A line above and below each: Explorer shows one line where two meet, and an item not shown takes its
            // lines along.
            using var key = Registry.CurrentUser.OpenSubKey(path, writable: true);
            key!.SetValue("SeparatorBefore", "");
            key.SetValue("SeparatorAfter", "");
        }
    }

    static string ShellVerb(string shell, string verb, string clsid)
    {
        var path = $@"{shell}\{verb}";
        using var key = Registry.CurrentUser.CreateSubKey(path);
        key.SetValue("ExplorerCommandHandler", clsid);
        return path;
    }

    static void Verb(string shell, string verb, string label, string icon, string command)
    {
        using var key = Registry.CurrentUser.CreateSubKey($@"{shell}\{verb}");
        key.SetValue("MUIVerb", label);
        key.SetValue("Icon", icon);
        using var cmd = key.CreateSubKey("command");
        cmd.SetValue(null, command);
    }
}
