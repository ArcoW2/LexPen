using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// Options > Settings: one window for the whole app, owned by the window it was opened from, not modal. Its page
/// (web\settings.html, WebFiles) shows every setting as a row; a change goes to AppHost.SetSetting at once, and every
/// LexPen window follows. The rows come from a main window's page (AppHost.SettingDefs), so a setting is
/// described in one place (actions.js).
/// </summary>
sealed class SettingsForm : Form
{
    const string AppUrl = "https://lexpen.example/";
    const string KeysTemplate = "// Your own keys, on top of the defaults (F1 lists every action and key). For example:\n" +
        "//   \"Ctrl+Shift+D\": \"bookmarkList\",\n{\n}\n";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    bool pageReady;
    readonly List<string> queue = [];

    public SettingsForm(AppHost app, MainForm owner)
    {
        this.app = app;
        Text = "Settings - LexPen";
        Icon = owner.Icon;
        ShowInTaskbar = false;
        MinimumSize = new Size(480, 400);
        StartPosition = FormStartPosition.Manual;
        var size = new Size(Math.Min(920, owner.Width), Math.Min(880, owner.Height));
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        Bounds = new Rectangle(at.X + (at.Width - size.Width) / 2, at.Y + (at.Height - size.Height) / 2, size.Width, size.Height);
        Controls.Add(web);
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
        firstPaint = await core.AddScriptToExecuteOnDocumentCreatedAsync(firstPaintScript = app.FirstPaintScript());
        core.Navigate($"{AppUrl}settings.html");
    }

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        var dark = app.Mode == "dark";
        BackColor = web.DefaultBackgroundColor = app.AppBackground();
        var on = dark ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        UpdateFirstPaint();
    }

    // The theme's colours before the page's first paint (AppHost.FirstPaintScript), also after a reload.
    string? firstPaint, firstPaintScript;
    async void UpdateFirstPaint()
    {
        if (web.CoreWebView2 is not { } core || firstPaint is null) return;   // OnLoad registers the first one
        var script = app.FirstPaintScript();
        if (script == firstPaintScript) return;
        firstPaintScript = script;
        core.RemoveScriptToExecuteOnDocumentCreated(firstPaint);
        firstPaint = await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
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
        string Arg(string name) => msg[name]!.GetValue<string>();
        switch (msg["op"]?.GetValue<string>())
        {
            case "init":
            {
                var init = (JsonObject)app.Settings.DeepClone();
                init["defs"] = app.SettingDefs?.DeepClone();
                init["look"] = app.Look();
                init["languageProblems"] = app.Languages["problems"]?.DeepClone();
                return init;
            }

            case "fonts":
                return new JsonArray(Fonts.List().Select(f => (JsonNode)new JsonObject { ["name"] = f.Name, ["mono"] = f.Mono }).ToArray());

            case "settingSet":
                app.SetSetting(Arg("name"), msg["value"]?.DeepClone());
                return null;

            // Opens your keys.json or settings.json in a tab of the most recently active LexPen window.
            case "openFile":
            {
                var name = Arg("file") == "keys" ? KeysFile.Name : SettingsFile.Name;
                var path = Path.Combine(AppHost.DataDir, name);
                if (!File.Exists(path)) File.WriteAllText(path, name == KeysFile.Name ? KeysTemplate : "{\n}\n");
                ToWindow(new JsonObject { ["event"] = "open", ["files"] = new JsonArray(path) });
                return null;
            }

            // F1 (keyboard shortcuts and commands) in the most recently active LexPen window.
            case "showCommands":
                ToWindow(new JsonObject { ["event"] = "runAction", ["name"] = "commands" });
                return null;

            case "close":
                BeginInvoke(Close);
                return null;

            default:
                throw new InvalidOperationException($"Unknown request '{msg["op"]}'.");
        }
    }

    void ToWindow(JsonObject message)
    {
        if (app.LastActive is not MainForm w) return;
        w.Post(message);
        AppHost.BringToFront(w);
    }
}
