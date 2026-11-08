using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The Theme colours window (docs/plans/executed/PLAN-theme-colours.md, Tools > Theme colours...): one for the whole app, not
/// modal, its place kept (AppState.ThemeColoursWindow). Its page (web\themecolours.html, themecolours.js) lists every
/// colour of a theme chosen at its top, with what it is for, where it comes from and its value, and shows them all in
/// an example. It is in the look of the window last worked in, as the Manage theme sets window; a change of a theme file
/// reaches it with that look (AppHost.SendToolLook), and the page asks for the list again.
/// </summary>
sealed class ThemeColoursForm : Form, IWebPost
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    bool pageReady;
    readonly List<string> queue = [];

    public ThemeColoursForm(AppHost app, MainForm owner)
    {
        this.app = app;
        Text = "Theme colours - LexPen";
        Icon = owner.Icon;
        app.FollowCaption(this, () => app.LastActive);   // the caption: Windows' own or the theme's
        ShowInTaskbar = false;
        MinimumSize = new Size(560, 400);
        StartPosition = FormStartPosition.Manual;
        // The place it was left at, when that is still on a screen; else in the middle of its window.
        var kept = app.State.ThemeColoursWindow;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Min(1000, at.Width), Math.Min(800, at.Height));
        Bounds = kept is [var x, var y, var w, var h] && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(x, y, w, h)))
            ? new Rectangle(x, y, w, h)
            : new Rectangle(at.X + (at.Width - size.Width) / 2, at.Y + (at.Height - size.Height) / 2, size.Width, size.Height);
        Controls.Add(web);
        ResizeEnd += (_, _) => KeepBounds();
        FormClosing += (_, _) => KeepBounds();
    }

    void KeepBounds()
    {
        if (WindowState != FormWindowState.Normal) return;
        app.SaveThemeColoursWindow([Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height]);
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
        core.ContextMenuRequested += (_, m) => WebFiles.BrowserMenu(m);   // only on a text field or a selection
        core.WebMessageReceived += (_, m) =>
        {
            var json = m.WebMessageAsJson;
            BeginInvoke(() => OnMessage(json));
        };
        core.NavigationStarting += (_, n) => { if (!n.Uri.StartsWith(AppUrl)) n.Cancel = true; };
        core.NewWindowRequested += (_, n) => n.Handled = true;
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript(app.LastActive));
        core.Navigate($"{AppUrl}themecolours.html");
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
            reply["result"] = op switch
            {
                "init" => new JsonObject { ["settings"] = app.SettingsFor(app.LastActive)["values"]?.DeepClone(), ["look"] = app.Look(app.LastActive), ["list"] = app.ThemeColours() },
                "list" => app.ThemeColours(),
                "close" => CloseAndBack(),
                _ => throw new InvalidOperationException($"Unknown request '{op}'."),
            };
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

    // Esc: the window closes; the window last worked in comes to the front.
    JsonNode? CloseAndBack()
    {
        BeginInvoke(Close);
        if (app.LastActive is MainForm last) AppHost.BringToFront(last);
        return true;
    }
}
