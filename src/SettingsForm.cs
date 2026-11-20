using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// Options > Settings: one window per main window, owned by it (on its desktop, closed with it), not modal. Its page
/// (web\settings.html, WebFiles) shows every setting as a row; a change goes to AppHost.SetSetting at once, and every
/// LexPen window follows. The rows come from a main window's page (AppHost.SettingDefs), so a setting is
/// described in one place (actions.js).
/// </summary>
sealed class SettingsForm : Form, IWebPost
{
    const string AppUrl = "https://lexpen.example/";

    readonly AppHost app;
    readonly MainForm window;   // the main window this one belongs to
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    public PanelBar Bar { get; } = new();   // whose it is now (docs/plans/executed/PLAN-floating-panel-scope.md 3.4)
    bool pageReady;
    readonly List<string> queue = [];

    public SettingsForm(AppHost app, MainForm owner)
    {
        this.app = app;
        window = owner;
        UpdateTitle();
        Icon = owner.Icon;
        app.FollowCaption(this, () => window);   // the caption: Windows' own or the theme's
        ShowInTaskbar = false;
        MinimumSize = new Size(480, 400);
        StartPosition = FormStartPosition.Manual;
        var size = new Size(Math.Min(920, owner.Width), Math.Min(880, owner.Height));
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        Bounds = new Rectangle(at.X + (at.Width - size.Width) / 2, at.Y + (at.Height - size.Height) / 2, size.Width, size.Height);
        Controls.Add(web);
        Controls.Add(Bar);
        DockMoves.Report(this, () => window, "settings");   // moved over its window: the place to dock it
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
        firstPaint = await core.AddScriptToExecuteOnDocumentCreatedAsync(firstPaintScript = app.FirstPaintScript(window));
        core.Navigate($"{AppUrl}settings.html");
    }

    /// <summary>The caption names the main window's project, as that window's own caption does.</summary>
    public void UpdateTitle() =>
        Text = app.ProjectInfo(window)["display"]?.GetValue<string>() is { Length: > 0 } project ? $"Settings - LexPen - {project}" : "Settings - LexPen";

    /// <summary>The caption follows the theme, as the main windows do.</summary>
    public void ApplyTheme()
    {
        var dark = app.Mode == "dark";
        BackColor = web.DefaultBackgroundColor = app.AppBackground(window);
        var on = dark ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        app.ApplyCaption(this, window);
        UpdateFirstPaint();
    }

    // The theme's colours before the page's first paint (AppHost.FirstPaintScript), also after a reload.
    string? firstPaint, firstPaintScript;
    async void UpdateFirstPaint()
    {
        if (web.CoreWebView2 is not { } core || firstPaint is null) return;   // OnLoad registers the first one
        var script = app.FirstPaintScript(window);
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
        try
        {
            if (msg["op"]?.GetValue<string>() == "close") BeginInvoke(Close);
            else reply["result"] = Request(app, this, this, window, msg);
        }
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

    /// <summary>A request of a settings page for main window `window`: its window of its own (`page`, `owner`: the
    /// form), or the one docked in that window (docs/plans/executed/PLAN-docking.md 7b: `page` the frame, `owner` the main
    /// window, for the questions it asks).</summary>
    public static JsonNode? Request(AppHost app, IWebPost page, IWin32Window owner, MainForm window, JsonNode msg)
    {
        string Arg(string name) => msg[name]!.GetValue<string>();
        void ToWindow(JsonObject message)
        {
            if (window.IsDisposed) return;
            window.Post(message);
            AppHost.BringToFront(window);
        }
        switch (msg["op"]?.GetValue<string>())
        {
            case "init":
            {
                var init = app.SettingsFor(window);   // the main window's: its theme set's values
                init["defs"] = app.SettingDefs?.DeepClone();
                init["look"] = app.Look(window);
                init["languageProblems"] = app.Languages["problems"]?.DeepClone();
                init["layout"] = window.PageLayout?.DeepClone();   // the rows of "this window" (docs/plans/executed/PLAN-settings-layers.md)
                init["window"] = app.ProjectInfo(window)["display"]?.DeepClone();   // its name in the rows' tooltips
                init["screen"] = app.ScreenOf(window);   // the zoom of its monitor
                app.SettingsPageStarted(window, page);   // what was meant for it while it was being opened
                return init;
            }

            case "fonts":
                return new JsonArray(Fonts.List().Select(f => (JsonNode)new JsonObject { ["name"] = f.Name, ["mono"] = f.Mono }).ToArray());

            case "settingSet":
                return app.SetSetting(Arg("name"), msg["value"]?.DeepClone(), window);   // a colour: into the window's set

            case "openThemeSets":
                if (!window.IsDisposed) app.OpenThemeSets(window);
                return null;

            // Save as default for the main window (asks when its theme set is part of it); the Undo of the set part.
            case "saveAsDefault":
                return window.IsDisposed ? null : app.SaveAsDefault(owner, window);

            case "themeSetCommand":
                return app.ThemeSetCommand(owner, msg);

            // The main window's project gets a set of its own (null: none).
            case "themeSet":
                if (!window.IsDisposed) app.SetProjectSet(window, msg["set"]?.GetValue<string>());
                return null;

            // A row of "this window": its main window sets it in its layout (and says so: layoutShown).
            case "layoutSet":
                if (!window.IsDisposed) window.Post(new JsonObject { ["event"] = "layoutSet", ["name"] = Arg("name"), ["value"] = msg["value"]?.DeepClone() });
                return null;

            // Opens your keys.json or settings.json in a tab of the main window this one belongs to.
            case "openFile":
            {
                var name = Arg("file") == "keys" ? KeysFile.Name : SettingsFile.Name;
                var path = Path.Combine(AppHost.DataDir, name);
                if (!File.Exists(path)) File.WriteAllText(path, name == KeysFile.Name ? KeysFile.Template : "{\n}\n");
                ToWindow(new JsonObject { ["event"] = "open", ["files"] = new JsonArray(path) });
                return null;
            }

            // The zoom of the main window's monitor back to the base (the editor's, the preview's or both).
            case "screenZoomReset":
                app.SetScreenZoom(window, msg["editor"]?.GetValue<bool>() == true ? 0 : null, msg["preview"]?.GetValue<bool>() == true ? 1 : null);
                return null;

            // The project for viewing (docs/plans/executed/PLAN-view-window.md): the projects to choose from; its reset.
            case "projects":
                return app.ProjectNames();

            case "viewReset":
                window.BeginInvoke(() => app.ResetViewLayout(owner));   // after this reply: it asks first
                return null;

            // Remove LexPen's previewer (docs/plans/PLAN-preview-handler.md 3.8): asked first; every extension unbound.
            case "previewerRemove":
                window.BeginInvoke(() =>
                {
                    if (AskForm.Answer(app, owner, new AskForm.Question
                        {
                            Text = "Remove LexPen as a previewer? Explorer then previews every file type with what it had before.",
                            Sign = AskForm.Sign.Question,
                            Buttons = [("yes", "Remove", null), (null, "Cancel", null)],
                        }) == "yes")
                        Previewer.Unregister((app.Languages["extensions"] as JsonObject ?? []).Select(e => e.Key));
                });
                return null;

            // File types (docs/plans/executed/PLAN-file-types.md): every extension of the language packs, how LexPen opens it and
            // what Windows starts now; Assign asks first, then registers, and names what Windows keeps for another app.
            case "fileTypes":
                return FileTypes.List(app.Languages, Environment.ProcessPath ?? Application.ExecutablePath);

            case "assignFileTypes":
                return AssignFileTypes(app, owner, msg["chosen"]?.AsArray() ?? [], msg["previews"]?.AsArray() ?? []);

            // An action of the main window this one belongs to, without bringing it to the front (Reset to default).
            case "runInWindow":
                if (!window.IsDisposed) window.Post(new JsonObject { ["event"] = "runAction", ["name"] = Arg("name") });
                return null;

            // F1 (keyboard shortcuts and commands) in the most recently active LexPen window.
            case "showCommands":
                ToWindow(new JsonObject { ["event"] = "runAction", ["name"] = "commands" });
                return null;

            default:
                throw new InvalidOperationException($"Unknown request '{msg["op"]}'.");
        }
    }

    // Assign of the File types dialog: the extensions checked, each "edit" or "view"; the others LexPen had are taken off.
    // `previews`: the extensions Explorer previews in LexPen (docs/plans/PLAN-preview-handler.md 3.8); the others LexPen's
    // preview is taken off.
    static JsonObject AssignFileTypes(AppHost app, IWin32Window owner, JsonArray chosen, JsonArray previews)
    {
#if DEBUG
        throw new InvalidOperationException("Assign registers the LexPen that runs it: a debug build does not. Use the published LexPen.");
#else
        var exe = Environment.ProcessPath ?? Application.ExecutablePath;
        var extensions = app.Languages["extensions"] as JsonObject ?? [];
        var packs = app.Languages["packs"] as JsonObject;
        var list = chosen.OfType<JsonObject>().Select(c => c["extension"]!.GetValue<string>()).Where(e => extensions.ContainsKey(e))
            .Select(e => (Extension: e, Mode: chosen.OfType<JsonObject>().First(c => c["extension"]!.GetValue<string>() == e)["mode"]?.GetValue<string>() == "view" ? "view" : "edit"))
            .Select(c =>
            {
                var language = extensions[c.Extension]!.GetValue<string>();
                return new FileTypes.Choice(c.Extension, language, packs?[language]?["name"]?.GetValue<string>() ?? language, c.Mode);
            }).ToList();
        var off = extensions.Select(e => e.Key).Where(e => FileTypes.ModeOf(e) is not null && list.All(c => c.Extension != e)).ToList();
        static string Some(IEnumerable<string> names)
        {
            var all = names.ToList();
            return all.Count <= 12 ? string.Join(", ", all) : string.Join(", ", all.Take(12)) + $" and {all.Count - 12} more";
        }
        var question = new List<string>();
        if (list.Any(c => c.Mode == "edit")) question.Add("Open in LexPen to edit: " + Some(list.Where(c => c.Mode == "edit").Select(c => c.Extension)));
        if (list.Any(c => c.Mode == "view")) question.Add("Open in LexPen to view: " + Some(list.Where(c => c.Mode == "view").Select(c => c.Extension)));
        if (off.Count > 0) question.Add("Take LexPen off: " + Some(off));
        var preview = previews.Select(p => p?.GetValue<string>()).OfType<string>().Where(extensions.ContainsKey).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var bind = extensions.Select(e => e.Key).Where(e => preview.Contains(e) && !Previewer.IsBound(e)).ToList();
        var unbind = extensions.Select(e => e.Key).Where(e => !preview.Contains(e) && Previewer.IsBound(e)).ToList();
        if (bind.Count > 0) question.Add("Preview in LexPen (Explorer's preview pane): " + Some(bind));
        if (unbind.Count > 0) question.Add("Take LexPen's preview off: " + Some(unbind));
        if (question.Count == 0) question.Add("No extension opens in LexPen.");
        if (AskForm.Answer(app, owner, new AskForm.Question
            {
                Text = "Assign these file types?\n\n" + string.Join("\n\n", question),
                Sign = AskForm.Sign.Question,
                Buttons = [("yes", "Yes", null), (null, "No", null)],
            }) != "yes") return new JsonObject { ["cancelled"] = true };
        foreach (var e in bind) Previewer.Bind(e);
        foreach (var e in unbind) Previewer.Unbind(e);
        FileTypes.Assign(exe, list, extensions.Select(e => e.Key));   // also tells Explorer the associations changed
        // What Windows starts now: an association it protects stays with another app; Default apps for those.
        var kept = list.Where(c => !FileTypes.OpensWith(c.Extension, exe).Ours).Select(c => c.Extension).ToList();
        if (kept.Count > 0)
        {
            AskForm.Tell(app, owner, AskForm.Sign.Information, $"LexPen could not set every file type: Windows keeps another app for\n\n{Some(kept)}\n\n" +
                "After OK, Windows Settings opens at Apps > Default apps > LexPen. Choose LexPen there for each of these file types.\n\n" +
                "Only LexPen is chosen there: whether a file type opens to edit or to view is what you set here, in LexPen's File types; " +
                "Windows has no setting for it.");
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("ms-settings:defaultapps?registeredAppUser=LexPen") { UseShellExecute = true });
        }
        // A preview Windows still takes from elsewhere (the file type's own handler comes first): said, not forced.
        var otherPreview = preview.Where(e => !Previewer.PreviewsWith(e).Ours).ToList();
        if (otherPreview.Count > 0)
            AskForm.Tell(app, owner, AskForm.Sign.Information, $"Windows still previews these with another previewer:

{Some(otherPreview)}

" +
                "Their file type names a previewer of its own, which comes before LexPen's.");
        return new JsonObject { ["assigned"] = list.Count, ["off"] = off.Count, ["kept"] = new JsonArray(kept.Select(k => (JsonNode?)k).ToArray()) };
#endif
    }
}
