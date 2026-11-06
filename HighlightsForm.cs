using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The highlights window (docs/plans/executed/PLAN-highlights.md, 3.5): one for the whole app, owned by the window it
/// serves (first the one it was opened from; it follows the focus, plan 22 3.2: AppHost.ToolServes), not modal,
/// movable and resizable, its place kept (AppState.HighlightsWindow). Its page (web\highlights.html,
/// highlightsview.js) lists the highlights of that window's document (each LexPen window tells the host,
/// highlightsShown) or of every file (the store), with a search; a click goes to the highlight in that window (the
/// event highlightGo), which comes to the front; this window stays open where it is.
/// </summary>
sealed class HighlightsForm : Form, IWebPost
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    public PanelBar Bar { get; } = new();   // whose it is now (docs/plans/executed/PLAN-floating-panel-scope.md 3.4)
    bool pageReady;
    readonly List<string> queue = [];

    public HighlightsForm(AppHost app, MainForm owner)
    {
        this.app = app;
        Text = "Highlights - LexPen";
        Icon = owner.Icon;
        app.FollowCaption(this, () => app.ToolServes(this));   // the caption: Windows' own or the theme's
        ShowInTaskbar = false;
        MinimumSize = new Size(360, 280);
        StartPosition = FormStartPosition.Manual;
        // The place it was left at, when that is still on a screen; else at the right of its window.
        var kept = app.State.HighlightsWindow;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Min(460, at.Width), Math.Min(640, at.Height));
        Bounds = kept is [var x, var y, var w, var h] && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(x, y, w, h)))
            ? new Rectangle(x, y, w, h)
            : new Rectangle(at.Right - size.Width - 40, at.Y + 80, size.Width, size.Height);
        Controls.Add(web);
        Controls.Add(Bar);
        ResizeEnd += (_, _) => KeepBounds();
        FormClosing += (_, _) => KeepBounds();
        DockMoves.Report(this, () => Owner as MainForm, "hls");   // moved over its window: the place to dock it
    }

    void KeepBounds()
    {
        if (WindowState != FormWindowState.Normal) return;
        app.SaveHighlightsWindow([Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height]);
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
        core.WebMessageReceived += (_, m) =>
        {
            var json = m.WebMessageAsJson;
            BeginInvoke(() => OnMessage(json));
        };
        core.NavigationStarting += (_, n) => { if (!n.Uri.StartsWith(AppUrl)) n.Cancel = true; };
        core.NewWindowRequested += (_, n) => n.Handled = true;
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript(app.ToolServes(this)));
        core.Navigate($"{AppUrl}highlights.html");
    }

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        BackColor = web.DefaultBackgroundColor = app.AppBackground(app.ToolServes(this));
        var on = app.Mode == "dark" ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        app.ApplyCaption(this, app.ToolServes(this));
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    public void Post(JsonObject message)
    {
        var json = message.ToJsonString();
        if (pageReady && !IsDisposed) web.CoreWebView2.PostWebMessageAsJson(json);
        else queue.Add(json);
    }

    async void OnMessage(string json)
    {
        if (IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        var op = msg["op"]?.GetValue<string>() ?? "";
        try
        {
            // Its requests as a docked one's, for the window last worked in (AppHost.HighlightsRequest); close: it closes.
            if (op == "close") BeginInvoke(Close);
            else reply["result"] = await app.HighlightsRequest(null, msg, null);
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        if (IsDisposed) return;
        web.CoreWebView2.PostWebMessageAsJson(reply.ToJsonString());
        if (op == "init")
        {
            pageReady = true;
            foreach (var queued in queue) web.CoreWebView2.PostWebMessageAsJson(queued);
            queue.Clear();
        }
    }

}
