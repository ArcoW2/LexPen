using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The characters of a font and their names, for the character picker (docs/plans/15-PLAN-character-tools.md):
/// which characters a font has (GDI GetFontUnicodeRanges, up to U+FFFF) and the names Windows gives them (GetUName in
/// getuname.dll, as the Character Map has them; up to U+FFFF, in English). Control characters, surrogates, private
/// use and unassigned codes are left out.
/// </summary>
static class CharInfo
{
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateFontW(int height, int width, int escapement, int orientation, int weight, uint italic,
        uint underline, uint strikeOut, uint charSet, uint outPrecision, uint clipPrecision, uint quality, uint pitchAndFamily, string face);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] static extern uint GetFontUnicodeRanges(IntPtr dc, IntPtr glyphSet);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern int GetTextFaceW(IntPtr dc, int count, StringBuilder face);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("getuname.dll", CharSet = CharSet.Unicode)] static extern int GetUName(ushort code, StringBuilder name);

    /// <summary>Not a character to show: a control character, a surrogate, private use (the stand-ins of
    /// TextFile live there) or a noncharacter.</summary>
    public static bool Skipped(int code) => code < 0x20 || code is >= 0x7F and < 0xA0 || code is >= 0xD800 and < 0xF900
        || code is 0xFFFE or 0xFFFF;

    /// <summary>The characters the font has, in code order; null when Windows has no font of that name (it would
    /// give another one instead).</summary>
    public static List<int>? FontChars(string face)
    {
        var dc = CreateCompatibleDC(IntPtr.Zero);
        var font = CreateFontW(-16, 0, 0, 0, 400, 0, 0, 0, 1 /* DEFAULT_CHARSET */, 0, 0, 0, 0, face);
        var old = SelectObject(dc, font);
        try
        {
            var got = new StringBuilder(64);
            GetTextFaceW(dc, got.Capacity, got);
            if (!string.Equals(got.ToString(), face, StringComparison.OrdinalIgnoreCase)) return null;
            var size = GetFontUnicodeRanges(dc, IntPtr.Zero);
            if (size == 0) return null;
            var buffer = Marshal.AllocHGlobal((int)size);
            try
            {
                GetFontUnicodeRanges(dc, buffer);
                // GLYPHSET: cbThis, flAccel, cGlyphsSupported, cRanges (4 bytes each), then cRanges WCRANGE
                // { WCHAR wcLow; USHORT cGlyphs }.
                var ranges = Marshal.ReadInt32(buffer, 12);
                var chars = new List<int>();
                for (var i = 0; i < ranges; i++)
                {
                    int low = (ushort)Marshal.ReadInt16(buffer, 16 + i * 4), count = (ushort)Marshal.ReadInt16(buffer, 18 + i * 4);
                    for (var c = low; c < low + count; c++) if (!Skipped(c)) chars.Add(c);
                }
                return chars;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        finally
        {
            SelectObject(dc, old);
            DeleteObject(font);
            DeleteDC(dc);
        }
    }

    /// <summary>The name Windows gives a character; null above U+FFFF or for an unassigned code.</summary>
    public static string? Name(int code)
    {
        if (code is < 0 or > 0xFFFF) return null;
        var name = new StringBuilder(256);
        try { if (GetUName((ushort)code, name) <= 0) return null; }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException) { return null; }
        var text = name.ToString().Trim();
        return text is "" or "Undefined" ? null : text;
    }

    // The fonts' lists, asked once per font.
    static readonly Dictionary<string, List<int>?> fonts = new(StringComparer.OrdinalIgnoreCase);
    public static List<int>? FontCharsKept(string face)
    {
        lock (fonts) return fonts.TryGetValue(face, out var chars) ? chars : fonts[face] = FontChars(face);
    }

    /// <summary>The Unicode blocks up to U+FFFF, in code order: (first code, length, name), from .NET's
    /// UnicodeRanges ("LatinExtendedA" -> "Latin Extended A").</summary>
    public static IEnumerable<(int First, int Length, string Name)> Blocks() =>
        typeof(System.Text.Unicode.UnicodeRanges).GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static)
            .Where(p => p.PropertyType == typeof(System.Text.Unicode.UnicodeRange) && p.Name is not ("All" or "None"))
            .Select(p => (Range: (System.Text.Unicode.UnicodeRange)p.GetValue(null)!, p.Name))
            .Select(x => (x.Range.FirstCodePoint, x.Range.Length, BlockName(x.Name)))
            .OrderBy(b => b.FirstCodePoint);

    // "GreekandCoptic" -> "Greek and Coptic", "IpaExtensions" -> "IPA Extensions", "Latin1Supplement" -> "Latin 1 Supplement".
    static string BlockName(string name)
    {
        var spaced = System.Text.RegularExpressions.Regex.Replace(
            System.Text.RegularExpressions.Regex.Replace(name, "(?<=[a-z])and(?=[A-Z])", "And"),
            "(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z])", " ");
        return string.Join(" ", spaced.Split(' ').Select(w => w switch { "And" => "and", "Cjk" => "CJK", "Ipa" => "IPA", "Nko" => "NKo", _ => w }));
    }

    /// <summary>The characters whose name holds every word (any case), of the font's list or of all.</summary>
    public static List<int> Search(IEnumerable<int> chars, string[] words) =>
        chars.Where(c => Name(c) is { } name && words.All(w => name.Contains(w, StringComparison.OrdinalIgnoreCase))).ToList();

    /// <summary>The picker's requests, from the picker window and the main windows (the bottom bar's names):
    /// charList (the characters of a font, or all with those of the font apart, and the blocks), charName, charSearch.</summary>
    public static (bool Handled, JsonNode? Result) Request(string op, JsonNode msg)
    {
        string Arg(string name) => msg[name]!.GetValue<string>();
        switch (op)
        {
            case "charList":
            {
                var font = FontCharsKept(Arg("font"));
                var all = msg["all"]?.GetValue<bool>() == true;
                return (true, new JsonObject
                {
                    ["found"] = font is not null,
                    ["chars"] = new JsonArray([.. (all ? AllChars() : font ?? []).Select(c => (JsonNode?)c)]),
                    ["inFont"] = all ? new JsonArray([.. (font ?? []).Select(c => (JsonNode?)c)]) : null,
                    ["blocks"] = new JsonArray([.. Blocks().Select(b => (JsonNode?)new JsonArray(b.First, b.Length, b.Name))]),
                });
            }
            case "charName":
                return (true, Name(msg["code"]!.GetValue<int>()));
            case "charSearch":
            {
                var words = Arg("words").Split(' ', StringSplitOptions.RemoveEmptyEntries);
                var chars = msg["all"]?.GetValue<bool>() == true ? AllChars() : FontCharsKept(Arg("font")) ?? [];
                return (true, new JsonArray([.. Search(chars, words).Select(c => (JsonNode?)c)]));
            }
            default:
                return (false, null);
        }
    }

    // Every assigned character up to U+FFFF (for "All characters"): made once, kept.
    static List<int>? all;
    public static List<int> AllChars() => all ??= Enumerable.Range(0, 0x10000).Where(c => !Skipped(c) && Name(c) is not null).ToList();
}
