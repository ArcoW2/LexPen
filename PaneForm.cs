using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// A tool pane floating in a window of its own (docs/plans/24-PLAN-docking.md 3.3, 3.5): the same page as in its
/// LexPen window's frame (outline.html, ...), from the panes' site. Its messages go to that window's page (the event
/// fromPane) and come from it (Send). Owned by its LexPen window, not modal, its place kept per kind of pane
/// (AppState.PaneWindows); closing it puts the pane back in its window (the event paneClosed).
/// </summary>
sealed class PaneForm : Form, IWebPost
{
    const string PaneUrl = "https://" + WebFiles.PaneHost + "/";

    readonly AppHost app;
    MainForm owner;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    public PanelBar Bar { get; } = new();   // whose it is now (docs/plans/22-PLAN-floating-panel-scope.md 3.4)
    readonly string page;
    readonly List<string> queue = [];
    bool loaded;

    /// <summary>The pane, as the window's page names it ("outline": the window's floating outline).</summary>
    public string Id { get; }
    string Kind => Id.Split(':')[0];

    /// <param name="place">Where its top left goes (a pane dropped outside its window: at the cursor); else its kept place.</param>
    public PaneForm(AppHost app, MainForm owner, string id, string page, Point? place = null)
    {
        (this.app, this.owner, Id, this.page) = (app, owner, id, page);
        Text = "LexPen";
        Icon = owner.Icon;
        app.FollowCaption(this, () => owner);   // the caption: Windows' own or the theme's
        ShowInTaskbar = false;
        MinimumSize = new Size(200, 160);
        StartPosition = FormStartPosition.Manual;
        // The place one of its kind was left at, when that is still on a screen; else beside its window's right edge.
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var fallback = new Rectangle(at.Right - 300, at.Y + 80, 280, Math.Min(600, at.Height - 120));
        Bounds = app.State.PaneWindows?.GetValueOrDefault(Kind) is [var x, var y, var w, var h]
            && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(x, y, w, h)))
            ? new Rectangle(x, y, w, h) : fallback;
        if (place is { } point) Location = point;
        Controls.Add(web);
        Controls.Add(Bar);
        ResizeEnd += (_, _) => KeepBounds();
        DockMoves.Report(this, () => owner, Id);
        FormClosing += (_, _) => KeepBounds();
    }

    void KeepBounds()
    {
        if (WindowState != FormWindowState.Normal) return;
        app.SavePaneWindow(Kind, [Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height]);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        ApplyTheme();
        await web.EnsureCoreWebView2Async(await app.WebEnvironment());
        var core = web.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
#endif
        core.Settings.IsZoomControlEnabled = false;
        WebFiles.Serve(core);
        // What the pane says goes to its window's page, as a frame's message would.
        core.WebMessageReceived += (_, m) =>
        {
            var json = m.WebMessageAsJson;
            BeginInvoke(() =>
            {
                if (IsDisposed || owner.IsDisposed || JsonNode.Parse(json)?["fromPane"] is not JsonNode msg) return;
                owner.Post(new JsonObject { ["event"] = "fromPane", ["pane"] = Id, ["msg"] = msg.DeepClone() });
            });
        };
        core.NavigationStarting += (_, n) => { if (!n.Uri.StartsWith(PaneUrl)) n.Cancel = true; };
        core.NewWindowRequested += (_, n) => n.Handled = true;
        core.DocumentTitleChanged += (_, _) => Text = core.DocumentTitle is { Length: > 0 } t ? $"{t} - LexPen" : "LexPen";
        core.NavigationCompleted += (_, _) =>
        {
            loaded = true;
            foreach (var json in queue) core.PostWebMessageAsJson(json);
            queue.Clear();
        };
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript(owner));
        core.Navigate(PaneUrl + page);
    }

    /// <summary>A message of its window's page for the pane.</summary>
    public void Send(JsonNode msg)
    {
        var json = new JsonObject { ["toPane"] = msg.DeepClone() }.ToJsonString();
        if (loaded && !IsDisposed) web.CoreWebView2.PostWebMessageAsJson(json);
        else queue.Add(json);
    }

    public void Post(JsonObject message) => Send(message);

    /// <summary>Another LexPen window's now (the one floating outline, plan 24 7.3): its messages go there, its look.</summary>
    public void SetOwner(MainForm window)
    {
        owner = window;
        Owner = window;
        Icon = window.Icon;
        ApplyTheme();
    }

    /// <summary>
    /// Getting or losing the focus is told to its window's page (paneWindowFocus): a click back on that window after
    /// one here is not a click that brings the window back from elsewhere (setting ignoreActivationClick), so it acts.
    /// Losing it, the message says which window gets it (lParam): its own window, or another.
    /// </summary>
    protected override void WndProc(ref Message m)
    {
        const int WM_ACTIVATE = 0x0006;
        if (m.Msg == WM_ACTIVATE && !owner.IsDisposed)
        {
            var active = (m.WParam.ToInt64() & 0xFFFF) != 0;   // WA_INACTIVE is 0
            owner.Post(new JsonObject { ["event"] = "paneWindowFocus", ["active"] = active, ["toOwner"] = !active && m.LParam == owner.Handle });
        }
        base.WndProc(ref m);
    }

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        BackColor = web.DefaultBackgroundColor = app.AppBackground(owner);
        var on = app.Mode == "dark" ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        app.ApplyCaption(this, owner);
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
