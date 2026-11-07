using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The Manage theme sets window (docs/plans/executed/PLAN-theme-sets.md, 3.10): one for the whole app, not modal, its place
/// kept (AppState.ThemeSetsWindow), as the Manage projects window. Its page (web\themesets.html, themesets.js) lists the
/// sets ("Default" first) with their look and what uses them, and the desktops with their default set; it makes,
/// duplicates, renames and deletes sets, and uses one for the project of the window last worked in, its desktop or the
/// app (AppHost.ThemeSetCommand). It follows every change (AppHost.Restyle).
/// </summary>
sealed class ThemeSetsForm : Form, IWebPost
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    public PanelBar Bar { get; } = new();   // whose it is now (docs/plans/executed/PLAN-floating-panel-scope.md 3.4)
    bool pageReady;
    readonly List<string> queue = [];

    public ThemeSetsForm(AppHost app, MainForm owner)
    {
        this.app = app;
        Text = "Manage theme sets - LexPen";
        Icon = owner.Icon;
        app.FollowCaption(this, () => app.LastActive);   // the caption: Windows' own or the theme's
        ShowInTaskbar = false;
        MinimumSize = new Size(480, 320);
        StartPosition = FormStartPosition.Manual;
        // The place it was left at, when that is still on a screen; else in the middle of its window.
        var kept = app.State.ThemeSetsWindow;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Min(820, at.Width), Math.Min(600, at.Height));
        Bounds = kept is [var x, var y, var w, var h] && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(x, y, w, h)))
            ? new Rectangle(x, y, w, h)
            : new Rectangle(at.X + (at.Width - size.Width) / 2, at.Y + (at.Height - size.Height) / 2, size.Width, size.Height);
        Controls.Add(web);
        Controls.Add(Bar);
        ResizeEnd += (_, _) => KeepBounds();
        FormClosing += (_, _) => KeepBounds();
        DockMoves.Report(this, () => Owner as MainForm, "themesets");   // moved over its window: the place to dock it
    }

    void KeepBounds()
    {
        if (WindowState != FormWindowState.Normal) return;
        app.SaveThemeSetsWindow([Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height]);
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
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript(app.LastActive));
        core.Navigate($"{AppUrl}themesets.html");
    }

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        BackColor = web.DefaultBackgroundColor = app.AppBackground(app.LastActive);
        var on = app.Mode == "dark" ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        app.ApplyCaption(this, app.LastActive);
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    public void Post(JsonObject message)
    {
        var json = message.ToJsonString();
        if (pageReady && !IsDisposed) web.CoreWebView2.PostWebMessageAsJson(json);
        else queue.Add(json);
    }

    void OnMessage(string json)
    {
        if (IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        var op = msg["op"]?.GetValue<string>() ?? "";
        try
        {
            if (op == "close-window") BeginInvoke(Close);
            else reply["result"] = Request(app, this, null, msg);
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

    /// <summary>A request of a Manage theme sets page: its window's (`window` null), or the one docked in `window`
    /// (docs/plans/executed/PLAN-docking.md 7b; `owner`: whom its questions belong to). Esc: back to the LexPen window last
    /// worked in (docked: to its window's document).</summary>
    public static JsonNode? Request(AppHost app, IWin32Window owner, MainForm? window, JsonNode msg)
    {
        var op = msg["op"]?.GetValue<string>() ?? "";
        var to = window ?? app.LastActive;
        switch (op)
        {
            case "init":
                return new JsonObject { ["settings"] = app.SettingsFor(to)["values"]?.DeepClone(), ["look"] = app.Look(to), ["list"] = app.ThemeSetList() };

            case "list":
                return app.ThemeSetList();

            // New, duplicate, rename, delete, use for the project / the desktop / the app, edit (AppHost.ThemeSetCommand).
            case "command":
                return app.ThemeSetCommand(owner, msg);

            case "back":
            case "close-window":
                if (window is not null) window.Post(new JsonObject { ["event"] = "toolEscape", ["kind"] = "themesets" });
                else if (app.LastActive is MainForm last) AppHost.BringToFront(last);
                return true;

            default:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }
}
