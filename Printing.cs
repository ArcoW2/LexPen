using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The printers for the Print window (docs/plans/executed/PLAN-printing.md 3.3, 3.7): the installed ones, a printer's papers
/// and what it can (two-sided, colour), its own settings dialog (the driver's), and printing page images with those
/// settings. A printer's settings are a Windows DEVMODE, kept by the page as base64 with a stored set of print settings:
/// the driver's private part (a paper bin, an intensity) survives that way. The options LexPen shows itself (paper,
/// orientation, copies, two-sided, colour) are put into the DEVMODE before the dialog and read back from it after, so
/// the two stay in step.
/// </summary>
static class Printing
{
    /// <summary>{ list: [name], default: name or null }; none installed: an empty list.</summary>
    public static JsonObject Printers()
    {
        var list = new JsonArray();
        string? standard = null;
        try
        {
            foreach (string name in PrinterSettings.InstalledPrinters) list.Add(name);
            standard = new PrinterSettings().PrinterName;
        }
        catch (Exception ex) when (ex is InvalidPrinterException or System.ComponentModel.Win32Exception or ExternalException) { }
        return new JsonObject { ["list"] = list, ["default"] = list.Any(n => (string)n! == standard) ? standard : null };
    }

    /// <summary>A printer's papers ({ name, w, h } in mm, portrait), whether it can print two-sided and in colour; null
    /// when there is no such printer.</summary>
    public static JsonObject? Info(string printer)
    {
        try
        {
            var ps = new PrinterSettings { PrinterName = printer };
            if (!ps.IsValid) return null;
            var papers = new JsonArray();
            foreach (PaperSize p in ps.PaperSizes)
                if (p.Width > 0 && p.Height > 0 && papers.All(q => (string)q!["name"]! != p.PaperName))
                    papers.Add(new JsonObject { ["name"] = p.PaperName, ["w"] = Mm(Math.Min(p.Width, p.Height)), ["h"] = Mm(Math.Max(p.Width, p.Height)) });
            return new JsonObject
            {
                ["papers"] = papers, ["duplex"] = ps.CanDuplex, ["colour"] = ps.SupportsColor,
                ["paper"] = ps.DefaultPageSettings.PaperSize.PaperName,
            };
        }
        catch (Exception ex) when (ex is InvalidPrinterException or System.ComponentModel.Win32Exception or ExternalException) { return null; }
    }

    static double Mm(int hundredthsInch) => Math.Round(hundredthsInch * 0.254, 1);

    /// <summary>
    /// The printer's own dialog, filled with `devmode` (base64, or null: the printer's defaults) and LexPen's options
    /// ({ paper, landscape, copies, duplex: "one" | "long" | "short", colour }). OK: { devmode, options } as the dialog
    /// left them; Cancel: null.
    /// </summary>
    public static JsonObject? Dialog(IntPtr owner, string printer, string? devmode, JsonObject options)
    {
        var ps = Settings(printer, devmode, options);
        var hIn = ps.GetHdevmode(ps.DefaultPageSettings);
        IntPtr hOut = IntPtr.Zero, hPrinter = IntPtr.Zero;
        try
        {
            if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) return null;
            var size = DocumentProperties(owner, hPrinter, printer, IntPtr.Zero, IntPtr.Zero, 0);
            if (size <= 0) return null;
            hOut = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, (UIntPtr)size);
            var pIn = GlobalLock(hIn);
            var pOut = GlobalLock(hOut);
            int answer;
            try { answer = DocumentProperties(owner, hPrinter, printer, pOut, pIn, DM_IN_BUFFER | DM_OUT_BUFFER | DM_IN_PROMPT); }
            finally { GlobalUnlock(hIn); GlobalUnlock(hOut); }
            if (answer != IDOK) return null;
            ps.SetHdevmode(hOut);
            ps.DefaultPageSettings.SetHdevmode(hOut);
            return new JsonObject { ["devmode"] = Base64(hOut), ["options"] = Options(ps) };
        }
        finally
        {
            if (hPrinter != IntPtr.Zero) ClosePrinter(hPrinter);
            if (hOut != IntPtr.Zero) GlobalFree(hOut);
            GlobalFree(hIn);
        }
    }

    /// <summary>The settings for a printer: its defaults, the stored DEVMODE over them (when it is one of this printer's),
    /// then LexPen's options over that.</summary>
    static PrinterSettings Settings(string printer, string? devmode, JsonObject options)
    {
        var ps = new PrinterSettings { PrinterName = printer };
        if (devmode is { Length: > 0 })
        {
            var bytes = Convert.FromBase64String(devmode);
            var h = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)bytes.Length);
            try
            {
                Marshal.Copy(bytes, 0, GlobalLock(h), bytes.Length);
                GlobalUnlock(h);
                // Its printer's name is its first 32 characters: another printer's is not used.
                if (string.Equals(System.Text.Encoding.Unicode.GetString(bytes, 0, Math.Min(64, bytes.Length)).TrimEnd('\0'),
                        printer.Length > 31 ? printer[..31] : printer, StringComparison.OrdinalIgnoreCase))
                {
                    ps.SetHdevmode(h);
                    ps.DefaultPageSettings.SetHdevmode(h);
                }
            }
            catch (ArgumentException) { }   // not a DEVMODE of this driver: its defaults
            finally { GlobalFree(h); }
        }
        if (options["paper"]?.GetValue<string>() is { } paper && ps.PaperSizes.Cast<PaperSize>().FirstOrDefault(p => p.PaperName == paper) is { } size)
            ps.DefaultPageSettings.PaperSize = size;
        if (options["landscape"] is { } landscape) ps.DefaultPageSettings.Landscape = landscape.GetValue<bool>();
        if (options["copies"] is { } copies) ps.Copies = (short)Math.Clamp(copies.GetValue<int>(), 1, 999);
        if (options["duplex"]?.GetValue<string>() is { } duplex && ps.CanDuplex)
            ps.Duplex = duplex switch { "long" => Duplex.Vertical, "short" => Duplex.Horizontal, _ => Duplex.Simplex };
        if (options["colour"] is { } colour && ps.SupportsColor) ps.DefaultPageSettings.Color = colour.GetValue<bool>();
        return ps;
    }

    static JsonObject Options(PrinterSettings ps) => new()
    {
        ["paper"] = ps.DefaultPageSettings.PaperSize.PaperName,
        ["landscape"] = ps.DefaultPageSettings.Landscape,
        ["copies"] = (int)ps.Copies,
        ["duplex"] = ps.Duplex switch { Duplex.Vertical => "long", Duplex.Horizontal => "short", _ => "one" },
        ["colour"] = ps.DefaultPageSettings.Color,
    };

    static string Base64(IntPtr h)
    {
        var size = (int)GlobalSize(h);
        var bytes = new byte[size];
        Marshal.Copy(GlobalLock(h), bytes, 0, size);
        GlobalUnlock(h);
        return Convert.ToBase64String(bytes);
    }

    /// <summary>
    /// Prints page images (PNG files, each a whole sheet: the margins are in the image) with the printer's settings: the
    /// stored DEVMODE and the options over it. Each image fills the sheet; the printer's unprintable edge is left out.
    /// Returns null when printed, else what went wrong.
    /// </summary>
    public static string? PrintImages(string title, string printer, string? devmode, JsonObject options, IReadOnlyList<string> pages)
    {
        try
        {
            using var doc = new PrintDocument { DocumentName = title, PrinterSettings = Settings(printer, devmode, options),
                PrintController = new StandardPrintController(), OriginAtMargins = false };
            doc.DefaultPageSettings = (PageSettings)doc.PrinterSettings.DefaultPageSettings.Clone();
            var at = 0;
            doc.PrintPage += (_, e) =>
            {
                using (var image = Image.FromFile(pages[at]))
                {
                    var g = e.Graphics!;
                    var sheet = e.PageSettings.Bounds;   // the whole sheet, in hundredths of an inch
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.DrawImage(image, new RectangleF(-e.PageSettings.HardMarginX, -e.PageSettings.HardMarginY, sheet.Width, sheet.Height));
                }
                e.HasMorePages = ++at < pages.Count;
            };
            if (pages.Count > 0) doc.Print();
            return null;
        }
        catch (Exception ex) when (ex is InvalidPrinterException or System.ComponentModel.Win32Exception or ExternalException or IOException or OutOfMemoryException)
        {
            return ex.Message;
        }
    }

    const int DM_IN_BUFFER = 8, DM_OUT_BUFFER = 2, DM_IN_PROMPT = 4, IDOK = 1;
    const uint GMEM_MOVEABLE = 0x0002, GMEM_ZEROINIT = 0x0040;

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "OpenPrinterW")]
    static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr printer);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, EntryPoint = "DocumentPropertiesW")]
    static extern int DocumentProperties(IntPtr owner, IntPtr printer, string name, IntPtr output, IntPtr input, int mode);

    [DllImport("kernel32.dll")] static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr h);
    [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);
}
