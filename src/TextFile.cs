using System.Globalization;
using System.Text;

namespace LexPen;

/// <summary>
/// The text files LexPen opens and saves. A file is written back in the encoding it was read in,
/// byte order mark included, and saving can keep the previous version next to it as name.ext.bak.
/// </summary>
static class TextFile
{
    // The names the page shows in its bottom bar and sends back when saving.
    public const string Utf8 = "UTF-8", Utf8Bom = "UTF-8 BOM", Utf16Le = "UTF-16 LE", Utf16Be = "UTF-16 BE", Ansi = "ANSI";

    static TextFile() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    // The Windows code page (Windows-1252 on a western setup). Saving refuses characters it cannot hold.
    static Encoding AnsiEncoding(bool strict) => Encoding.GetEncoding(CultureInfo.CurrentCulture.TextInfo.ANSICodePage,
        strict ? EncoderFallback.ExceptionFallback : EncoderFallback.ReplacementFallback, DecoderFallback.ReplacementFallback);

    /// <summary>The text and the encoding it was in: by byte order mark, else UTF-8 when the bytes are
    /// valid UTF-8, else ANSI (older files, written before UTF-8 was the default). A byte the encoding cannot
    /// read is kept as a stand-in character (see <see cref="StandIn"/>), so saving writes it back.</summary>
    public static (string Text, string Encoding) Decode(byte[] bytes)
    {
        if (bytes is [0xEF, 0xBB, 0xBF, ..]) return (Read(new UTF8Encoding(false), bytes, 3), Utf8Bom);
        if (bytes is [0xFF, 0xFE, ..]) return (Read(new UnicodeEncoding(false, false), bytes, 2), Utf16Le);
        if (bytes is [0xFE, 0xFF, ..]) return (Read(new UnicodeEncoding(true, false), bytes, 2), Utf16Be);
        try { new UTF8Encoding(false, true).GetCharCount(bytes); }
        catch (DecoderFallbackException) { return (Read(AnsiEncoding(false), bytes, 0), Ansi); }
        return (Read(new UTF8Encoding(false), bytes, 0), Utf8);
    }

    /// <summary>The bytes read in a known encoding (a text tab changed in Hex, docs/plans/executed/PLAN-hex-view.md): its byte
    /// order mark left out when there; a byte it cannot read kept as a stand-in, as <see cref="Decode"/> does.</summary>
    public static string DecodeAs(byte[] bytes, string encoding) => encoding switch
    {
        Utf8Bom => Read(new UTF8Encoding(false), bytes, bytes is [0xEF, 0xBB, 0xBF, ..] ? 3 : 0),
        Utf16Le => Read(new UnicodeEncoding(false, false), bytes, bytes is [0xFF, 0xFE, ..] ? 2 : 0),
        Utf16Be => Read(new UnicodeEncoding(true, false), bytes, bytes is [0xFE, 0xFF, ..] ? 2 : 0),
        Ansi => Read(AnsiEncoding(false), bytes, 0),
        _ => Read(new UTF8Encoding(false), bytes, 0),
    };

    // A byte that cannot be read becomes the stand-in StandIn + the byte, a private-use character (U+F780 to
    // U+F87F; the page shows it as 0xAB), and Encode writes the byte back: reading and saving an untouched file
    // gives the same bytes. A real character in that range is kept the same way, as the stand-ins of its own bytes,
    // so a stand-in is never taken for one. (Not a lone surrogate, as Python's surrogateescape: the JSON to and
    // from the page cannot carry one.)
    public const char StandIn = '\uF780';
    public static bool IsStandIn(char c) => c >= StandIn && c <= StandIn + 255;

    static string Read(Encoding encoding, byte[] bytes, int start)
    {
        string With(int first)
        {
            var e = (Encoding)encoding.Clone();
            e.DecoderFallback = new KeepBytes(first);
            return e.GetString(bytes, start, bytes.Length - start);
        }
        var text = With(StandIn);
        if (!text.Any(IsStandIn)) return text;
        // Read again with other stand-ins: where the two differ is a byte that could not be read, where they are
        // the same a real character of the range (one character per byte both times, so the two line up).
        var other = With(StandIn - 256);
        var result = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            if (!IsStandIn(text[i]) || text[i] != other[i]) result.Append(text[i]);
            else foreach (var b in encoding.GetBytes(text[i].ToString())) result.Append((char)(StandIn + b));
        }
        return result.ToString();
    }

    sealed class KeepBytes(int first) : DecoderFallback
    {
        public override int MaxCharCount => 4;
        public override DecoderFallbackBuffer CreateFallbackBuffer() => new Buffer(first);

        sealed class Buffer(int first) : DecoderFallbackBuffer
        {
            byte[] unknown = [];
            int at;
            public override bool Fallback(byte[] bytesUnknown, int index) { unknown = bytesUnknown; at = 0; return true; }
            public override char GetNextChar() => at < unknown.Length ? (char)(first + unknown[at++]) : '\0';
            public override bool MovePrevious() { if (at == 0) return false; at--; return true; }
            public override int Remaining => unknown.Length - at;
            public override void Reset() { unknown = []; at = 0; }
        }
    }

    // The text in an encoding, the stand-ins as their bytes.
    static byte[] Write(Encoding encoding, string text)
    {
        if (!text.Any(IsStandIn)) return encoding.GetBytes(text);
        var bytes = new List<byte>(text.Length);
        var run = new StringBuilder();
        foreach (var c in text)
        {
            if (!IsStandIn(c)) { run.Append(c); continue; }
            bytes.AddRange(encoding.GetBytes(run.ToString()));
            run.Clear();
            bytes.Add((byte)(c - StandIn));
        }
        bytes.AddRange(encoding.GetBytes(run.ToString()));
        return [.. bytes];
    }

    public static byte[] Encode(string text, string encoding, string name)
    {
        switch (encoding)
        {
            case Utf8Bom: return [0xEF, 0xBB, 0xBF, .. Write(new UTF8Encoding(false), text)];
            case Utf16Le: return [0xFF, 0xFE, .. Write(new UnicodeEncoding(false, false), text)];
            case Utf16Be: return [0xFE, 0xFF, .. Write(new UnicodeEncoding(true, false), text)];
            case Ansi:
                try { return Write(AnsiEncoding(true), text); }
                catch (EncoderFallbackException ex)
                {
                    throw new IOException($"{name} is an ANSI file and cannot hold the character '{ex.CharUnknown}'. " +
                        "Remove it, or save the file under another name (that saves it as UTF-8).");
                }
            default: return Write(new UTF8Encoding(false), text);
        }
    }

    /// <summary>Writes the file: the new text goes to a temporary file in the same folder first, which then
    /// replaces the old file in one step (a crash or a full disk half-way leaves the old file intact).
    /// <paramref name="backup"/>: the old file becomes name.ext.bak, overwriting an earlier one.</summary>
    public static void Write(string path, string text, string encoding, bool backup) =>
        WriteBytes(path, Encode(text, encoding, Path.GetFileName(path)), backup);   // encoded before anything on disk changes

    /// <summary>The same for bytes as they are (a PDF with its highlight annotations, plan 38).</summary>
    public static void WriteBytes(string path, byte[] bytes, bool backup)
    {
        var temp = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(path))!, $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
        File.WriteAllBytes(temp, bytes);
        try
        {
            if (File.Exists(path)) File.Replace(temp, path, backup ? path + ".bak" : null, ignoreMetadataErrors: true);
            else File.Move(temp, path);
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }
}
