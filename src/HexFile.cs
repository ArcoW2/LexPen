namespace LexPen;

/// <summary>A file as bytes, for the Hex view (docs/plans/executed/PLAN-hex-view.md): whether it is text at all, and its
/// bytes, read whole (shared, as a text file is read: a file another program writes can be read all the same).</summary>
static class HexFile
{
    /// <summary>The largest file Hex opens; its bytes travel to the page whole.</summary>
    public const long MaxSize = 64L * 1024 * 1024;

    /// <summary>How far a file is looked into for a zero byte.</summary>
    const int Probe = 8000;

    /// <summary>Not text: a zero byte in its first bytes, unless it is UTF-16 (which starts with a byte order mark).</summary>
    public static bool IsBinary(string path)
    {
        using var file = Open(path);
        var head = new byte[Math.Min(file.Length, Probe)];
        file.ReadExactly(head);
        return head is not ([0xFF, 0xFE, ..] or [0xFE, 0xFF, ..]) && Array.IndexOf(head, (byte)0) >= 0;
    }

    /// <summary>The file's bytes; over <see cref="MaxSize"/>: refused.</summary>
    public static byte[] Read(string path)
    {
        using var file = Open(path);
        if (file.Length > MaxSize)
            throw new IOException($"{Path.GetFileName(path)} is too large for Hex (over {MaxSize / 1024 / 1024} MB).");
        var bytes = new byte[file.Length];
        file.ReadExactly(bytes);
        return bytes;
    }

    static FileStream Open(string path) => new(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
}
