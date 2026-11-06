using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The bottom bar of a floating panel's window (docs/plans/22-PLAN-floating-panel-scope.md 3.4): whose it is now. At
/// the far left the project (an italic lead first: "All projects - current project", "Held - playing", ...; or only
/// the italic "All projects"), next to it the document (or the italic "All documents"). In the look of the window it
/// names, in the app font (settings appFont, appSize); a click brings that window to the front. Not shown when the
/// setting panelBar is off. AppHost.UpdateBars fills it.
/// </summary>
sealed class PanelBar : Control
{
    /// <summary>The text of one part: italic, plain, or both (italic first).</summary>
    public readonly record struct Part(string? Italic, string? Plain);

    Part project, document;
    Color line = SystemColors.ControlDark, dim = SystemColors.GrayText;

    /// <summary>The LexPen window it names (a click: to the front), or null.</summary>
    public MainForm? Window { get; private set; }

    public PanelBar()
    {
        Dock = DockStyle.Bottom;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        Cursor = Cursors.Hand;
        SetFont("", 0);
    }

    // The app font: a name ("" is Segoe UI) and a size in points (0 is 9.75 pt, the pages' 13 px).
    void SetFont(string family, double size)
    {
        if (family == (familyNow ?? "-") && size == sizeNow) return;
        (familyNow, sizeNow) = (family, size);
        Font = new Font(family is { Length: > 0 } ? family : "Segoe UI", size > 0 ? (float)size : 9.75f);
        Height = TextRenderer.MeasureText("Ag", Font).Height + 6;
    }
    string? familyNow;
    double sizeNow;

    /// <summary>What it says, in the colours of window `colours` (its app theme: --bg-bar, --fg, --fg-dim, --border)
    /// and the font of its settings `values` (appFont, appSize); shown as panelBar says.</summary>
    public void Show(Part project, Part document, MainForm? window, IReadOnlyDictionary<string, string> colours, JsonObject values)
    {
        Visible = values["panelBar"]?.GetValueKind() != JsonValueKind.False;
        SetFont(values["appFont"]?.GetValueKind() == JsonValueKind.String ? values["appFont"]!.GetValue<string>() : "",
            values["appSize"]?.GetValueKind() == JsonValueKind.Number ? values["appSize"].Deserialize<double>() : 0);
        Color Of(string name, Color fallback) => ThemeFile.Rgb(colours.GetValueOrDefault(name) ?? "") is var (r, g, b) ? Color.FromArgb(r, g, b) : fallback;
        (this.project, this.document, Window) = (project, document, window);
        BackColor = Of("--bg-bar", SystemColors.Control);
        ForeColor = Of("--fg", SystemColors.ControlText);
        dim = Of("--fg-dim", SystemColors.GrayText);
        line = Of("--border", SystemColors.ControlDark);
        Invalidate();
    }

    /// <summary>The texts as shown, for the tests ("italic|plain || italic|plain").</summary>
    public string Said => $"{project.Italic}|{project.Plain} || {document.Italic}|{document.Plain}";

    protected override void OnClick(EventArgs e)
    {
        base.OnClick(e);
        if (Window is { IsDisposed: false } w) AppHost.BringToFront(w);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(BackColor);
        using (var pen = new Pen(line)) g.DrawLine(pen, 0, 0, Width, 0);
        using var italic = new Font(Font, FontStyle.Italic);
        const TextFormatFlags flags = TextFormatFlags.NoPadding | TextFormatFlags.SingleLine | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis;
        var x = 8;
        void Draw(string? text, Font font, Color colour)
        {
            if (string.IsNullOrEmpty(text) || x >= Width) return;
            var width = Math.Min(TextRenderer.MeasureText(g, text, font, Size.Empty, flags & ~TextFormatFlags.EndEllipsis).Width, Width - x);
            TextRenderer.DrawText(g, text, font, new Rectangle(x, 1, width, Height - 1), colour, flags);
            x += width;
        }
        void DrawPart(Part p)
        {
            Draw(p.Italic, italic, dim);
            if (p.Italic is { Length: > 0 } && p.Plain is { Length: > 0 }) x += 6;
            Draw(p.Plain, Font, ForeColor);
        }
        DrawPart(project);
        x += 20;
        DrawPart(document);
    }
}
