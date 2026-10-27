using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The preview of a Replace in the Search panel (docs/plans/executed/PLAN-replace-in-files.md, 3.4): a window of its own,
/// modal to the LexPen window that asks. Its page (web\replace.html, replace.js) lists every change per file, each
/// with a check box; Apply returns the ids still checked, Cancel (or closing it) null. The changes come from the page
/// of the asking window, which does the replacing.
/// </summary>
sealed class ReplacePreviewForm : Form
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly MainForm owner;
    readonly JsonNode changes;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };

    /// <summary>The ids of the changes to make (Apply); null: cancelled.</summary>
    public JsonArray? Kept { get; private set; }

    public ReplacePreviewForm(AppHost app, MainForm owner, JsonNode changes)
    {
        this.app = app;
        this.owner = owner;
        this.changes = changes;
        Text = "Replace - LexPen";
        Icon = owner.Icon;
        ShowInTaskbar = false;
        MinimumSize = new Size(420, 260);
        StartPosition = FormStartPosition.Manual;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Min(1000, at.Width), Math.Min(680, at.Height));
        Bounds = new Rectangle(at.X + (at.Width - size.Width) / 2, at.Y + (at.Height - size.Height) / 2, size.Width, size.Height);
        Controls.Add(web);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        BackColor = web.DefaultBackgroundColor = app.AppBackground(owner);
        var on = app.Mode == "dark" ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
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
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript(owner));
        core.Navigate($"{AppUrl}replace.html");
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    void OnMessage(string json)
    {
        if (IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        try
        {
            reply["result"] = msg["op"]?.GetValue<string>() switch
            {
                "init" => new JsonObject { ["settings"] = app.SettingsFor(owner)["values"]?.DeepClone(), ["look"] = app.Look(owner), ["changes"] = changes.DeepClone() },
                "apply" => Done(msg["kept"]!.AsArray().DeepClone().AsArray()),
                "cancel" => Done(null),
                var op => throw new InvalidOperationException($"Unknown request '{op}'."),
            };
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        if (!IsDisposed) web.CoreWebView2.PostWebMessageAsJson(reply.ToJsonString());
    }

    JsonNode? Done(JsonArray? kept)
    {
        Kept = kept;
        BeginInvoke(Close);
        return null;
    }
}
