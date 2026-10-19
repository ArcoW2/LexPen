using System.Globalization;
using System.Text;

namespace LexPen;

/// <summary>
/// The text files LexPen opens and saves. A file is written back in the encoding it was read in,
/// byte order mark included, and saving can keep the previous version next to it as name.bak.
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
    /// valid UTF-8, else ANSI (older files, written before UTF-8 was the default).</summary>
    public static (string Text, string Encoding) Decode(byte[] bytes)
    {
        if (bytes is [0xEF, 0xBB, 0xBF, ..]) return (new UTF8Encoding(false).GetString(bytes, 3, bytes.Length - 3), Utf8Bom);
        if (bytes is [0xFF, 0xFE, ..]) return (Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2), Utf16Le);
        if (bytes is [0xFE, 0xFF, ..]) return (Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2), Utf16Be);
        try { return (new UTF8Encoding(false, true).GetString(bytes), Utf8); }
        catch (DecoderFallbackException) { return (AnsiEncoding(false).GetString(bytes), Ansi); }
    }

    public static byte[] Encode(string text, string encoding, string name)
    {
        switch (encoding)
        {
            case Utf8Bom: return [0xEF, 0xBB, 0xBF, .. new UTF8Encoding(false).GetBytes(text)];
            case Utf16Le: return [0xFF, 0xFE, .. Encoding.Unicode.GetBytes(text)];
            case Utf16Be: return [0xFE, 0xFF, .. Encoding.BigEndianUnicode.GetBytes(text)];
            case Ansi:
                try { return AnsiEncoding(true).GetBytes(text); }
                catch (EncoderFallbackException ex)
                {
                    throw new IOException($"{name} is an ANSI file and cannot hold the character '{ex.CharUnknown}'. " +
                        "Remove it, or save the file under another name (that saves it as UTF-8).");
                }
            default: return new UTF8Encoding(false).GetBytes(text);
        }
    }

    /// <summary>Writes the file: the new text goes to a temporary file in the same folder first, which then
    /// replaces the old file in one step (a crash or a full disk half-way leaves the old file intact).
    /// <paramref name="backup"/>: the old file becomes name.bak, overwriting an earlier one.</summary>
    public static void Write(string path, string text, string encoding, bool backup)
    {
        var bytes = Encode(text, encoding, Path.GetFileName(path));   // before anything on disk changes
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
