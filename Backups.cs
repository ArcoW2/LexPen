using System.Runtime.InteropServices;

namespace LexPen;

/// <summary>
/// The backups LexPen makes on save (name.ext.bak next to name.ext, TextFile.Write): found in a folder (and its
/// subfolders) and deleted to the Recycle Bin (docs/plans/executed/PLAN-delete-backups.md). A .bak without its original next
/// to it is not one of LexPen's: it is left alone.
/// </summary>
static class Backups
{
    const string Ext = ".bak";

    /// <summary>Is this a backup LexPen made: name.ext.bak with name.ext next to it.</summary>
    public static bool IsBackup(string path) =>
        path.EndsWith(Ext, StringComparison.OrdinalIgnoreCase) && File.Exists(path[..^Ext.Length]);

    /// <summary>The backup of a file, or null when it has none.</summary>
    public static string? Of(string file) => File.Exists(file + Ext) ? file + Ext : null;

    /// <summary>The backups in a folder, with `subfolders` also in every folder below it (hidden and system folders,
    /// such as .git, left out).</summary>
    public static IEnumerable<string> In(string folder, bool subfolders)
    {
        if (!Directory.Exists(folder)) return [];
        var options = new EnumerationOptions { RecurseSubdirectories = subfolders, IgnoreInaccessible = true, MatchType = MatchType.Simple };
        return Directory.EnumerateFiles(folder, "*" + Ext, options).Where(IsBackup);
    }

    /// <summary>Does the folder, or a folder below it, have a backup (stops at the first one).</summary>
    public static bool Any(string folder) => In(folder, true).Any();

    /// <summary>Each file to the Recycle Bin; the ones that could not go (locked, gone) are given back.</summary>
    public static (int Deleted, List<string> Left) Delete(IEnumerable<string> paths)
    {
        var deleted = 0;
        var left = new List<string>();
        foreach (var path in paths)
            if (File.Exists(path) && Recycle(path)) deleted++;
            else left.Add(path);
        return (deleted, left);
    }

    /// <summary>The tests delete for real instead (no Recycle Bin in a test run).</summary>
    internal static Func<string, bool> Recycle = ToRecycleBin;

    // The shell's delete with undo (the Recycle Bin), no question, no progress, no error dialog of its own.
    static bool ToRecycleBin(string path)
    {
        var op = new ShFileOp
        {
            wFunc = FO_DELETE,
            pFrom = path + "\0\0",
            fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT,
        };
        return SHFileOperation(ref op) == 0 && !op.fAnyOperationsAborted && !File.Exists(path);
    }

    const uint FO_DELETE = 3;
    const ushort FOF_SILENT = 0x4, FOF_NOCONFIRMATION = 0x10, FOF_ALLOWUNDO = 0x40, FOF_NOERRORUI = 0x400;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ShFileOp
    {
        public IntPtr hwnd;
        public uint wFunc;
        public string pFrom;
        public string? pTo;
        public ushort fFlags;
        [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHFileOperation(ref ShFileOp op);
}
