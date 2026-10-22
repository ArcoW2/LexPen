using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The character picker (docs/plans/15-PLAN-character-picker-window.md): one window for the whole app, owned by the
/// window it was opened from, not modal, movable and resizable, its place kept (AppState.CharPicker). Its page
/// (web\charpicker.html, charpage.js) shows the characters (CharInfo); Insert goes to the LexPen window last worked
/// in (AppHost.LastActive) as the event insertText, and that window comes to the front, so typing goes on there.
/// </summary>
sealed class CharPickerForm : Form
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    bool pageReady;
    readonly List<string> queue = [];
    int? startCode;

    public CharPickerForm(AppHost app, MainForm owner, int? code)
    {
        this.app = app;
        startCode = code;
        Text = "Characters - LexPen";
        Icon = owner.Icon;
        ShowInTaskbar = false;
        MinimumSize = new Size(460, 340);
        StartPosition = FormStartPosition.Manual;
        // The place it was left at, when that is still on a screen; else in the middle of its window.
        var kept = app.State.CharPicker;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Min(860, at.Width), Math.Min(600, at.Height));
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
        app.SaveCharPicker([Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height]);
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
        core.Navigate($"{AppUrl}charpicker.html");
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

    void OnMessage(string json)
    {
        if (IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        try { reply["result"] = Dispatch(msg); }
        catch (Exception ex) { reply["error"] = ex.Message; }
        if (IsDisposed) return;
        web.CoreWebView2.PostWebMessageAsJson(reply.ToJsonString());
        if (msg["op"]?.GetValue<string>() == "init")
        {
            pageReady = true;
            foreach (var queued in queue) web.CoreWebView2.PostWebMessageAsJson(queued);
            queue.Clear();
        }
    }

    JsonNode? Dispatch(JsonNode msg)
    {
        var op = msg["op"]?.GetValue<string>() ?? "";
        if (CharInfo.Request(op, msg) is { Handled: true } done) return done.Result;
        switch (op)
        {
            case "init":
            {
                var code = startCode;
                startCode = null;
                return new JsonObject { ["settings"] = app.Settings["values"]?.DeepClone(), ["look"] = app.Look(), ["code"] = code };
            }

            // Into the LexPen window last worked in, at its cursors; that window comes to the front.
            case "insert":
            {
                if (app.LastActive is not MainForm w) return false;
                w.Post(new JsonObject { ["event"] = "insertText", ["text"] = msg["text"]!.GetValue<string>() });
                AppHost.BringToFront(w);
                return true;
            }

            case "close":
                BeginInvoke(Close);
                return null;

            default:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }
}
