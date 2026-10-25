using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The Manage projects window (docs/plans/executed/PLAN-manage-projects.md): one for the whole app, not modal,
/// movable and resizable, its place kept (AppState.ProjectsWindow). Its page (web\projects.html, projectsview.js)
/// lists every project with checkboxes, a search, sorting and details; its menus and buttons act on the checked
/// projects through AppHost (open, close, merge, rename, delete, new). The list follows every change of the
/// projects (AppHost.ProjectsChanged, a window opened or closed).
/// </summary>
sealed class ProjectsForm : Form, IWebPost
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    bool pageReady;
    readonly List<string> queue = [];

    public ProjectsForm(AppHost app, MainForm owner)
    {
        this.app = app;
        Text = "Manage projects - LexPen";
        Icon = owner.Icon;
        ShowInTaskbar = false;
        MinimumSize = new Size(480, 320);
        StartPosition = FormStartPosition.Manual;
        // The place it was left at, when that is still on a screen; else in the middle of its window.
        var kept = app.State.ProjectsWindow;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Min(900, at.Width), Math.Min(620, at.Height));
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
        app.SaveProjectsWindow([Bounds.X, Bounds.Y, Bounds.Width, Bounds.Height]);
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
        core.Navigate($"{AppUrl}projects.html");
    }

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        BackColor = web.DefaultBackgroundColor = app.AppBackground(app.LastActive);
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
        try { reply["result"] = await Dispatch(op, msg); }
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

    static List<int> Ids(JsonNode msg) => msg["projects"]?.AsArray().Select(n => n!.GetValue<int>()).ToList() ?? [];

    async Task<JsonNode?> Dispatch(string op, JsonNode msg)
    {
        switch (op)
        {
            case "init":
                return new JsonObject { ["settings"] = app.SettingsFor(app.LastActive)["values"]?.DeepClone(), ["look"] = app.Look(app.LastActive), ["list"] = app.ProjectList(null, true) };

            case "list":
                return app.ProjectList(null, true);

            case "open":
                foreach (var id in Ids(msg)) app.ProjectCommand(null, "open", new JsonObject { ["project"] = id });
                return true;

            case "window":
                app.ProjectCommand(null, "window", new JsonObject { ["key"] = msg["key"]!.GetValue<int>() });
                return true;

            case "new":
                app.ProjectCommand(null, "new", new JsonObject { ["name"] = msg["name"]?.GetValue<string>() ?? "" });
                return true;

            case "rename":
                app.RenameProject(msg["project"]!.GetValue<int>(), msg["name"]?.GetValue<string>() ?? "");
                return true;

            case "merge":
                return app.MergeProjects(this, Ids(msg));

            case "close":
                await app.CloseProjects(this, Ids(msg));
                return true;

            case "delete":
                await app.DeleteProjects(this, Ids(msg));
                return true;

            case "setting":
                app.SetSetting(msg["name"]!.GetValue<string>(), msg["value"]?.DeepClone());
                return true;

            // Esc with an empty search: back to the LexPen window last worked in.
            case "back":
                if (app.LastActive is MainForm last) AppHost.BringToFront(last);
                return true;

            case "close-window":
                BeginInvoke(Close);
                return null;

            default:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }
}
