using System.Runtime.InteropServices;

namespace LexPen;

/// <summary>
/// LexPen's own question window (docs/plans/41-PLAN-own-dialogs.md): modal, in the app theme of a window (its colours,
/// the app font, its caption), moved by its title bar. Placed just right of a point and a bit down (kept on that
/// screen), else in the middle of its window. A text, optional checkboxes (all checked), buttons: the first is the
/// default (Enter), one without a value is Cancel (Esc, as closing it).
/// </summary>
sealed class AskForm : Form
{
    readonly List<CheckBox> boxes = [];
    readonly Point? near;
    string? answer;

    AskForm(AppHost app, MainForm w, Point? near, string text, IReadOnlyList<(string Value, string Text)> items,
        IReadOnlyList<(string? Value, string Text)> buttons)
    {
        this.near = near;
        var colours = app.AppColours(w);
        Color Of(string name, Color fallback) => ThemeFile.Rgb(colours.GetValueOrDefault(name) ?? "") is var (r, g, b) ? Color.FromArgb(r, g, b) : fallback;
        var bg = Of("--bg", SystemColors.Window);
        var fg = Of("--fg", SystemColors.WindowText);
        var bar = Of("--bg-bar", SystemColors.Control);
        var border = Of("--border", SystemColors.ControlDark);
        var accent = Of("--accent", SystemColors.Highlight);
        static Color Mix(Color a, Color b, double t) => Color.FromArgb((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));

        Text = "LexPen";
        Icon = w.Icon;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = MaximizeBox = false;
        ShowInTaskbar = false;
        StartPosition = near is null ? FormStartPosition.CenterParent : FormStartPosition.Manual;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = bg;
        ForeColor = fg;
        Font = app.AppFont(w);
        Padding = new Padding(20, 16, 20, 16);

        var layout = new TableLayoutPanel { AutoSize = true, ColumnCount = 1, Location = new Point(Padding.Left, Padding.Top), Margin = Padding.Empty };
        // The question, then one empty line.
        layout.Controls.Add(new Label { Text = text, AutoSize = true, MaximumSize = new Size(LogicalToDeviceUnits(480), 0), Margin = new Padding(0, 0, 0, Font.Height) });
        foreach (var (value, label) in items)
        {
            var box = new CheckBox { Text = label, Tag = value, Checked = true, AutoSize = true, FlatStyle = FlatStyle.Flat, Margin = new Padding(0, 2, 0, 2) };
            box.FlatAppearance.BorderColor = border;
            box.FlatAppearance.CheckedBackColor = bg;
            box.FlatAppearance.MouseOverBackColor = Mix(bg, fg, .08);
            boxes.Add(box);
            layout.Controls.Add(box);
        }
        // The buttons at the right, the first one the accent's.
        var row = new FlowLayoutPanel { AutoSize = true, FlowDirection = FlowDirection.RightToLeft, Anchor = AnchorStyles.Right, Margin = new Padding(0, 16, 0, 0), WrapContents = false };
        foreach (var (value, label) in buttons.Reverse())
        {
            var first = (value, label) == buttons[0];
            var button = new Button
            {
                Text = label, AutoSize = true, MinimumSize = new Size(LogicalToDeviceUnits(80), 0), FlatStyle = FlatStyle.Flat,
                Padding = new Padding(8, 2, 8, 2), Margin = new Padding(8, 0, 0, 0), UseVisualStyleBackColor = false,
                BackColor = first ? accent : bar, ForeColor = first ? Color.White : fg,
            };
            button.FlatAppearance.BorderColor = first ? accent : border;
            button.FlatAppearance.MouseOverBackColor = first ? Mix(accent, Color.White, .15) : Mix(bar, fg, .1);
            button.Click += (_, _) => { answer = value; Close(); };
            if (first) AcceptButton = button;
            if (value is null) CancelButton = button;
            row.Controls.Add(button);
        }
        layout.Controls.Add(row);
        Controls.Add(layout);

        HandleCreated += (_, _) =>
        {
            var on = app.Mode == "dark" ? 1 : 0;
            DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
            app.ApplyCaption(this, w, true);
        };
        app.FollowCaption(this, () => w);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (near is not Point at) return;
        var area = Screen.FromPoint(at).WorkingArea;
        var x = Math.Min(at.X + LogicalToDeviceUnits(24), area.Right - Width);
        var y = Math.Min(at.Y + LogicalToDeviceUnits(12), area.Bottom - Height);
        Location = new Point(Math.Max(area.Left, x), Math.Max(area.Top, y));
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        (AcceptButton as Control)?.Focus();
    }

    /// <summary>Asks in window `w`'s look: the value of the button chosen (null: Cancel, Esc or closed) and the values of
    /// the checked items.</summary>
    public static (string? Answer, List<string> Checked) Ask(AppHost app, MainForm w, Point? near, string text,
        IReadOnlyList<(string Value, string Text)> items, params (string? Value, string Text)[] buttons)
    {
        using var form = new AskForm(app, w, near, text, items, buttons);
        form.ShowDialog(w);
        return (form.answer, form.boxes.Where(b => b.Checked).Select(b => (string)b.Tag!).ToList());
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
