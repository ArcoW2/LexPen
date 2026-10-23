using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The highlights window (docs/plans/executed/PLAN-highlights.md, 3.5): one for the whole app, owned by the window it was
/// opened from, not modal, movable and resizable, its place kept (AppState.HighlightsWindow). Its page
/// (web\highlights.html, highlightsview.js) lists the highlights of the document last worked in (each LexPen window
/// tells the host, highlightsShown) or of every file (the store), with a search; a click goes to the highlight in the
/// LexPen window last worked in (AppHost.LastActive: the event highlightGo), which comes to the front; this window
/// stays open where it is.
/// </summary>
sealed class HighlightsForm : Form
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    bool pageReady;
    readonly List<string> queue = [];

    public HighlightsForm(AppHost app, MainForm owner)
    {
        this.app = app;
        Text = "Highlights - LexPen";
        Icon = owner.Icon;
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
        ResizeEnd += (_, _) => KeepBounds();
        FormClosing += (_, _) => KeepBounds();
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
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript());
        core.Navigate($"{AppUrl}highlights.html");
    }

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        BackColor = web.DefaultBackgroundColor = app.AppBackground();
        var on = app.Mode == "dark" ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
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
            // The store's files are read off the UI thread (every window shares it).
            reply["result"] = op switch
            {
                "all" => await Task.Run(AllFiles),
                _ => Dispatch(op, msg),
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

    // Every file with highlights, each with its list (for All files and its search).
    JsonArray AllFiles()
    {
        var all = new JsonArray();
        foreach (var file in app.Highlights.All())
        {
            var path = file?["path"]?.GetValue<string>();
            var draft = file?["draft"]?.GetValue<string>();
            var got = app.Highlights.Get(path, draft);
            all.Add(new JsonObject
            {
                ["path"] = path, ["draft"] = draft, ["beside"] = file?["beside"]?.DeepClone(),
                ["missing"] = path is not null && !File.Exists(path), ["list"] = got["list"]?.DeepClone(),
            });
        }
        return all;
    }

    JsonNode? Dispatch(string op, JsonNode msg)
    {
        switch (op)
        {
            case "init":
                return new JsonObject { ["settings"] = app.Settings["values"]?.DeepClone(), ["look"] = app.Look(), ["shown"] = app.HighlightsShownNow?.DeepClone() };

            // To a highlight, in the LexPen window last worked in; that window comes to the front, this one stays.
            case "go":
            case "action":
            {
                if (app.LastActive is not MainForm w) return false;
                var ev = new JsonObject { ["event"] = op == "go" ? "highlightGo" : "highlightAction" };
                foreach (var (key, value) in msg.AsObject()) if (key is not ("op" or "id")) ev[key] = value?.DeepClone();
                if (msg["hid"] is JsonNode hid) ev["id"] = hid.DeepClone();
                w.Post(ev);
                if (op == "go") AppHost.BringToFront(w);
                return true;
            }

            // A file's highlights dropped (All files: a file that is gone).
            case "forget":
                app.Highlights.Set(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>(), [], false);
                return true;

            // Esc with an empty search: back to the LexPen window last worked in.
            case "back":
                if (app.LastActive is MainForm last) AppHost.BringToFront(last);
                return true;

            case "close":
                BeginInvoke(Close);
                return null;

            default:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }
}
