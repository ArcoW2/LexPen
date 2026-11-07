using System.Drawing;
using System.Drawing.Text;

namespace LexPen;

/// <summary>
/// The installed font families for the font settings, each marked monospaced or not. Monospaced is
/// measured: a row of narrow letters is as wide as a row of wide ones. Built once per run.
/// </summary>
static class Fonts
{
    static List<(string Name, bool Mono)>? list;
    static readonly object building = new();

    public static List<(string Name, bool Mono)> List()
    {
        lock (building)
        {
            if (list != null) return list;
            using var installed = new InstalledFontCollection();
            list = installed.Families
                .Where(f => !f.Name.StartsWith('@'))   // the vertical variants of East Asian fonts
                .Select(f => (f.Name, IsMonospaced(f)))
                .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            return list;
        }
    }

    /// <summary>Built already (List() returns at once).</summary>
    public static bool Ready => Volatile.Read(ref list) != null;

    /// <summary>Builds the list on another thread (measuring every font takes a moment), for a window that will
    /// ask for it without waiting (the Print window).</summary>
    public static void Warm() => Task.Run(List);

    static bool IsMonospaced(FontFamily family)
    {
        var style = new[] { FontStyle.Regular, FontStyle.Bold, FontStyle.Italic }.FirstOrDefault(family.IsStyleAvailable, (FontStyle)(-1));
        if (style == (FontStyle)(-1)) return false;
        using var font = new Font(family, 12, style, GraphicsUnit.Pixel);
        const TextFormatFlags flags = TextFormatFlags.NoPadding;
        var narrow = TextRenderer.MeasureText("iiiiiiiiii", font, Size.Empty, flags).Width;
        var wide = TextRenderer.MeasureText("WWWWWWWWWW", font, Size.Empty, flags).Width;
        return narrow == wide;
    }
}
