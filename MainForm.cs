using System.ComponentModel;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// Native shell: one window hosting a WebView2 that runs the UI (the page's files: WebFiles).
/// The page talks to this class through JSON messages (see OnMessage) for
/// everything that needs the file system or a native dialog. What windows share
/// (settings, drafts, edit locks, moving tabs) goes through AppHost.
/// </summary>
sealed class MainForm : Form
{
    const string AppUrl = "https://lexpen.example/";
    // Local images referenced by a document are served from this fake host.
    const string FileUrl = "https://file.lexpen.example/";

    // The clipboard format that marks a text as a block (column), as Visual Studio and Notepad++ write and read it.
    const string ColumnFormat = "MSDEVColumnSelect";

    // Larger files are not opened.
    const long MaxFileSize = 10 * 1024 * 1024;

    static readonly Dictionary<string, string> ImageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif", [".svg"] = "image/svg+xml", [".webp"] = "image/webp",
        [".bmp"] = "image/bmp", [".ico"] = "image/x-icon", [".avif"] = "image/avif",
    };

    /// <summary>What a window opens with. <see cref="Key"/>: its window in a project (ProjectStore), with its session;
    /// <see cref="ToDesktop"/>: back on the virtual desktop it was on (at start).</summary>
    // Compare: two files or two folders to compare (--compare), the page starts it. View: the files and the folder come
    // from View in LexPen (the files in Preview, the folder in the Folder pane). Edit: the files come from Edit in LexPen (in
    // the editor).
    public sealed record Start(string? Folder, List<string> Files, int Key = 0, bool ToDesktop = false, string[]? Compare = null, bool View = false, bool Edit = false);

    readonly AppHost app;
    Start start;
    public int Id { get; }
    /// <summary>The window's key in its project (ProjectStore).</summary>
    public int Key => start.Key;
    /// <summary>The layout this window shows now, as its page last said (layoutShown): for its settings window.</summary>
    public JsonObject? PageLayout { get; private set; }
    /// <summary>The monitor this window is on (Monitors): its key and name, for the zoom per screen (AppHost.ScreenOf).</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public string? ScreenKey { get; set; }
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public string? ScreenName { get; set; }

    /// <summary>Becomes another window of a project, before the page has asked what to open (AppHost.WindowShown).</summary>
    public void Rekey(int key) => start = start with { Key = key };

    /// <summary>A window opened at start: back on the desktop it was on (AppHost.WindowShown).</summary>
    public bool ToDesktop => start.ToDesktop;

    /// <summary>Set by AppHost: a new window that may become the project closed last on its desktop.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public bool ReopenHere { get; set; }

    /// <summary>Done when the window is on its desktop and knows its project (AppHost.WindowShown); the page loads
    /// after that, so it asks for the right session.</summary>
    public TaskCompletionSource Settled { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>The open folder; used to route launches to the window that shows it.</summary>
    public string? Root { get; private set; }

    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    // Covers the window until the page has loaded; after that the page shows its own busy bar.
    readonly Label loading = new()
    {
        Dock = DockStyle.Fill,
        Text = "Loading...",
        TextAlign = ContentAlignment.MiddleCenter,
        ForeColor = Color.Gray,
        Font = new Font("Segoe UI", 11f),
    };

    // Messages for the page wait here until it has asked for "init".
    bool pageReady;
    readonly List<string> queue = [];
    // Closing asks the page first (unsaved files, drafts); it answers with "closeNow".
    bool closeApproved, closeAsked;

    /// <summary>Closing with its project (Manage projects): the answer about unsaved documents, already given
    /// ("save" or "discard"), so the page does not ask; null for a close by hand.</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public string? CloseAnswer { get; set; }
    /// <summary>Called when the page cancels such a close (a save failed or was cancelled).</summary>
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Action? CloseCancelled { get; set; }
    volatile bool active;

    // Auto refresh: one watcher for the folder tree (files and folders appearing or disappearing,
    // documents edited, git's index rewritten), one per folder holding open files. Changes are
    // collected for a moment and then reported to the page in one message.
    readonly FileSystemWatcher treeWatcher = new()
    {
        IncludeSubdirectories = true,
        NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite,
        InternalBufferSize = 64 * 1024,
    };
    readonly Dictionary<string, FileSystemWatcher> fileWatchers = new(StringComparer.OrdinalIgnoreCase);
    HashSet<string> watchedFiles = new(StringComparer.OrdinalIgnoreCase);
    // The watchers' events come in on a thread of their own, not the UI thread (every window shares that one, and a
    // build or a sync can raise thousands of events): they are collected under `changes`, and the UI thread is asked
    // once, to start the timer; it reports when nothing came in for ChangeQuiet ms.
    readonly System.Windows.Forms.Timer changeTimer = new() { Interval = 100 };
    const int ChangeQuiet = 300;
    readonly object changes = new();
    bool treeChanged, gitChanged, changeAsked;
    long lastChange;
    readonly Dictionary<string, string> changedFiles = new(StringComparer.OrdinalIgnoreCase);   // path -> changed / removed
    // Files that changed while the window was not active, for the tree highlight.
    readonly HashSet<string> freshFiles = new(StringComparer.OrdinalIgnoreCase);
    // Our own saves are not news for the tree highlight.
    readonly System.Collections.Concurrent.ConcurrentDictionary<string, DateTime> ownWrites = new(StringComparer.OrdinalIgnoreCase);

    public MainForm(AppHost app, int id, Start start)
    {
        this.app = app;
        this.start = start;
        Id = id;
        Root = start.Folder;

        Text = "LexPen";
        Icon = new Icon(typeof(MainForm).Assembly.GetManifestResourceStream("app.ico")!);
        Size = new Size(1280, 820);

        Controls.Add(web);
        Controls.Add(loading);
        loading.BringToFront();

        Activated += (_, _) => active = true;
        Deactivate += (_, _) => active = false;

        treeWatcher.Created += (_, e) => OnTreeEvent(e.FullPath);
        treeWatcher.Deleted += (_, e) => OnTreeEvent(e.FullPath);
        treeWatcher.Renamed += (_, e) => { OnTreeEvent(e.OldFullPath); OnTreeEvent(e.FullPath); };
        treeWatcher.Changed += (_, e) => OnTreeEvent(e.FullPath, content: true);
        treeWatcher.Error += (_, _) => NotifyChange(tree: true);   // too many events at once: just refresh
        changeTimer.Tick += (_, _) => FlushChanges();
    }

    /// <summary>Initial position, before the window is shown. Null bounds: the default size.</summary>
    public void Place(Rectangle? bounds, bool maximized)
    {
        if (bounds is Rectangle b)
        {
            StartPosition = FormStartPosition.Manual;
            Bounds = b;
        }
        if (maximized) WindowState = FormWindowState.Maximized;
    }

    bool Primary => app.IsPrimary(this);

    /// <summary>The [n] in the page, and the project in the title. All windows look the same.</summary>
    public void UpdateRole()
    {
        ApplyTheme();
        UpdateTitle();
        Post(new JsonObject { ["event"] = "role", ["primary"] = Primary, ["index"] = app.IndexOf(this) });
    }

    void UpdateTitle()
    {
        var title = web.CoreWebView2?.DocumentTitle is { Length: > 0 } t ? t : "LexPen";
        Text = app.ProjectInfo(this)["display"]?.GetValue<string>() is { Length: > 0 } project ? $"{title} - {project}" : title;
        app.SettingsTitle(this);
    }

    // Only what the tree shows matters: everything outside hidden folders and node_modules.
    // Edited files and a rewritten git index (stage, commit, checkout) only change the git marks.
    // On the watcher's thread.
    void OnTreeEvent(string path, bool content = false)
    {
        var parts = Path.GetRelativePath(treeWatcher.Path, path).Split(Path.DirectorySeparatorChar);
        if (parts is [".git", "index"]) NotifyChange(git: true);
        if (parts[..^1].Any(p => p.StartsWith('.') || p == "node_modules")) return;
        if (!active && File.Exists(path) && !IsOwnWrite(path)) lock (changes) freshFiles.Add(path);
        if (content) NotifyChange(git: true);
        else NotifyChange(tree: true);
    }

    // On the watcher's thread: whether the file is still there is asked here, not on the UI thread.
    void OnFileEvent(string path)
    {
        if (!watchedFiles.Contains(path)) return;
        var kind = File.Exists(path) ? "changed" : "removed";
        lock (changes) changedFiles[path] = kind;
        NotifyChange();
    }

    bool IsOwnWrite(string path) =>
        ownWrites.TryGetValue(path, out var at) && DateTime.UtcNow - at < TimeSpan.FromSeconds(3);

    // Any thread: noted; the UI thread is asked only once per batch to start the timer.
    void NotifyChange(bool tree = false, bool git = false)
    {
        lock (changes)
        {
            treeChanged |= tree;
            gitChanged |= git;
            lastChange = Environment.TickCount64;
            if (changeAsked) return;
            changeAsked = true;
        }
        try { BeginInvoke(() => changeTimer.Start()); }
        catch (InvalidOperationException) { lock (changes) changeAsked = false; }   // no window (yet, or any more): the next event asks again
    }

    // The UI thread: once nothing came in for ChangeQuiet ms, one message to the page with all of it.
    void FlushChanges()
    {
        JsonObject message;
        lock (changes)
        {
            if (Environment.TickCount64 - lastChange < ChangeQuiet) return;   // still coming in: wait on
            changeAsked = false;
            message = new JsonObject
            {
                ["event"] = "changed", ["tree"] = treeChanged, ["git"] = gitChanged,
                ["files"] = new JsonArray(changedFiles.Select(f => (JsonNode?)new JsonObject { ["path"] = f.Key, ["kind"] = f.Value }).ToArray()),
                ["fresh"] = new JsonArray(freshFiles.Select(f => (JsonNode?)f).ToArray()),
            };
            treeChanged = gitChanged = false;
            changedFiles.Clear();
            freshFiles.Clear();
        }
        changeTimer.Stop();
        using var _ = StallLog.Doing($"file changes for {Text}");
        Post(message);
    }

    static void Watch(FileSystemWatcher watcher, string? folder, string filter)
    {
        watcher.EnableRaisingEvents = false;
        if (!Directory.Exists(folder)) return;
        watcher.Path = folder;
        watcher.Filter = filter;
        watcher.EnableRaisingEvents = true;
    }

    // One watcher per folder that holds open files.
    void WatchFiles(IEnumerable<string> paths)
    {
        watchedFiles = new HashSet<string>(paths, StringComparer.OrdinalIgnoreCase);
        var dirs = watchedFiles.Select(Path.GetDirectoryName).OfType<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var dir in fileWatchers.Keys.Where(d => !dirs.Contains(d)).ToList())
        {
            fileWatchers[dir].Dispose();
            fileWatchers.Remove(dir);
        }
        foreach (var dir in dirs.Where(d => !fileWatchers.ContainsKey(d) && Directory.Exists(d)))
        {
            var w = new FileSystemWatcher(dir)
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            };
            w.Changed += (_, e) => OnFileEvent(e.FullPath);
            w.Created += (_, e) => OnFileEvent(e.FullPath);
            w.Deleted += (_, e) => OnFileEvent(e.FullPath);
            w.Renamed += (_, e) => { OnFileEvent(e.OldFullPath); OnFileEvent(e.FullPath); };
            // The folder itself went away (or too many events): check every file in it.
            w.Error += (_, _) =>
            {
                foreach (var f in watchedFiles.Where(f => string.Equals(Path.GetDirectoryName(f), dir, StringComparison.OrdinalIgnoreCase)))
                    OnFileEvent(f);
            };
            w.EnableRaisingEvents = true;
            fileWatchers[dir] = w;
        }
    }

    /// <summary>A folder is about to be renamed (AppHost.Rename): Windows refuses while a watcher holds it or a folder in
    /// it. Those watchers stop; the page asks for them again with the new paths, or ResumeWatching after a refusal.</summary>
    public void StopWatching(string folder)
    {
        foreach (var dir in fileWatchers.Keys.Where(d => FileRename.Renamed(d, folder, folder) is not null).ToList())
        {
            fileWatchers[dir].Dispose();
            fileWatchers.Remove(dir);
        }
        if (FileRename.Renamed(Root, folder, folder) is not null) treeWatcher.EnableRaisingEvents = false;
    }

    public void ResumeWatching()
    {
        WatchFiles(watchedFiles.ToList());
        Watch(treeWatcher, Root, "*");
    }

    // Window chrome follows the mode; the background shown before the page paints is the theme's.
    // Secondary windows get a dimmed caption and border (Windows 11; Windows 10 ignores it).
    public void ApplyTheme()
    {
        var dark = app.Mode == "dark";
        BackColor = web.DefaultBackgroundColor = app.AppBackground(this);
        UpdateFirstPaint();
        var on = dark ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        var color = unchecked((int)0xFFFFFFFF);   // DWMWA_COLOR_DEFAULT: every window the same
        DwmSetWindowAttribute(Handle, 35 /* DWMWA_CAPTION_COLOR */, ref color, sizeof(int));
        DwmSetWindowAttribute(Handle, 34 /* DWMWA_BORDER_COLOR */, ref color, sizeof(int));
    }

    // The theme's colours before the page's first paint (AppHost.FirstPaintScript), also after a reload.
    string? firstPaint, firstPaintScript;
    async void UpdateFirstPaint()
    {
        if (web.CoreWebView2 is not { } core || firstPaint is null) return;   // OnLoad registers the first one
        var script = app.FirstPaintScript(this);
        if (script == firstPaintScript) return;
        firstPaintScript = script;
        core.RemoveScriptToExecuteOnDocumentCreated(firstPaint);
        firstPaint = await core.AddScriptToExecuteOnDocumentCreatedAsync(script);
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    // The browser view. Right after a LexPen closed (a restart, an update), its browser processes can still hold the
    // browser's data folder for a moment, and WebView2 answers "the requested resource is in use" (0x800700AA). Then
    // wait and try again (the control starts over after a failed try); still in use after a few seconds: say so and
    // close this window instead of the exception dialog.
    const int ResourceInUse = unchecked((int)0x800700AA);

    async Task<bool> StartBrowser()
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await web.EnsureCoreWebView2Async(await app.WebEnvironment());
                return true;
            }
            catch (COMException ex) when (ex.HResult == ResourceInUse && attempt < 10)
            {
                await Task.Delay(500);
            }
            catch (COMException ex) when (ex.HResult == ResourceInUse)
            {
                MessageBox.Show(this, "LexPen could not start its browser view: the browser data folder is still in use, " +
                    "most likely by a LexPen that is closing. Start LexPen again in a moment.", "LexPen",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
        }
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);

        if (!await StartBrowser())
        {
            Close();
            return;
        }
        var core = web.CoreWebView2;

        core.Settings.IsStatusBarEnabled = false;
#if !DEBUG
        // Ctrl+Shift+C is the clipboard list, not the DevTools element picker (nor F12 / Ctrl+Shift+I).
        // The debug build keeps them: the tests drive the page through the debugging port.
        core.Settings.AreDevToolsEnabled = false;
#endif
        // The page zooms its previews itself (Ctrl+plus/minus/wheel); the browser zoom would scale everything.
        core.Settings.IsZoomControlEnabled = false;
        WebFiles.Serve(core);

        core.AddWebResourceRequestedFilter(FileUrl + "*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += OnFileRequested;

        // Dialogs must not run inside a WebView2 event handler, so handle the message afterwards.
        // Files dropped from Explorer come along as objects that carry their path.
        core.WebMessageReceived += (_, m) =>
        {
            string json;
            using (StallLog.Doing($"receiving a message from {Text}")) json = m.WebMessageAsJson;
            // A picture pasted from the clipboard is a file without a path: "".
            var files = m.AdditionalObjects?.OfType<CoreWebView2File>().Select(f =>
            {
                try { return f.Path ?? ""; }
                catch (Exception ex) when (ex is ArgumentException or COMException) { return ""; }
            }).ToArray();
            BeginInvoke(() => OnMessage(json, files));
        };
        // Printing is not a LexPen feature: the browser's right-click menu loses its Print item.
        core.ContextMenuRequested += (_, m) =>
        {
            foreach (var item in m.MenuItems.Where(i => i.Name == "print").ToList()) m.MenuItems.Remove(item);
            // Highlights (docs/plans/executed/PLAN-highlights.md): in the editor and the preview, on the selection or the cursor.
            var env = core.Environment;
            m.MenuItems.Add(env.CreateContextMenuItem("", null, CoreWebView2ContextMenuItemKind.Separator));
            foreach (var (label, action) in new[] { ("Highlight", "highlight.toggle"), ("Selection to highlight", "highlight.fromSelection"),
                ("Highlight note...", "highlight.note"), ("Remove highlight", "highlight.remove") })
            {
                var item = env.CreateContextMenuItem(label, null, CoreWebView2ContextMenuItemKind.Command);
                item.CustomItemSelected += (_, _) => Post(new JsonObject { ["event"] = "contextAction", ["action"] = action });
                m.MenuItems.Add(item);
            }
            // Occurrences (docs/plans/executed/PLAN-show-occurrences.md): on a selection, in the editor and the preview.
            if (m.ContextMenuTarget.HasSelection)
            {
                var occurrences = env.CreateContextMenuItem("Show all occurrences of this selection", null, CoreWebView2ContextMenuItemKind.Command);
                occurrences.CustomItemSelected += (_, _) => Post(new JsonObject { ["event"] = "contextAction", ["action"] = "occurrences.show" });
                m.MenuItems.Add(occurrences);
            }
        };
        core.DocumentTitleChanged += (_, _) => UpdateTitle();
        core.DOMContentLoaded += (_, _) => loading.Hide();

        // The page never navigates away; anything else is a link the user clicked.
        core.NavigationStarting += (_, n) =>
        {
            if (n.Uri.StartsWith(AppUrl)) return;
            n.Cancel = true;
            OpenExternal(n.Uri);
        };
        core.NewWindowRequested += (_, n) =>
        {
            n.Handled = true;
            OpenExternal(n.Uri);
        };

        await Settled.Task;   // on its desktop, in its project (AppHost.WindowShown)
        firstPaint = await core.AddScriptToExecuteOnDocumentCreatedAsync(firstPaintScript = app.FirstPaintScript(this));
        core.Navigate($"{AppUrl}index.html");
    }

    static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && u.Scheme is "http" or "https" or "mailto")
            Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true });
    }

    void OnFileRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (!e.Request.Uri.StartsWith(FileUrl, StringComparison.OrdinalIgnoreCase)) return;   // the page's own files: WebFiles
        var path = Uri.UnescapeDataString(e.Request.Uri[FileUrl.Length..].Split('?', '#')[0]);
        var env = web.CoreWebView2.Environment;
        e.Response = ImageTypes.TryGetValue(Path.GetExtension(path), out var type) && File.Exists(path)
            ? env.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(path)), 200, "OK", $"Content-Type: {type}")
            : env.CreateWebResourceResponse(null, 404, "Not Found", "");
    }

    /// <summary>An event for the page; held back until the page has started.</summary>
    public void Post(JsonObject message)
    {
        using var _ = StallLog.Doing($"the event {message["event"]} to {Text}");
        var json = message.ToJsonString();
        if (pageReady && !IsDisposed) web.CoreWebView2.PostWebMessageAsJson(json);
        else queue.Add(json);
    }

    // Requests that may carry a whole file: their answer is turned into text off the UI thread as well.
    static readonly HashSet<string> LargeAnswers = ["read", "gitHead", "search", "folderList", "format"];

    async void OnMessage(string json, string[]? files)
    {
        if (IsDisposed) return;
        JsonNode msg;
        using (StallLog.Doing($"a request of {json.Length / 1024} KB from {Text}")) msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        // Every window shares this one UI thread (StallLog): what can take a while (a folder search, git, reading or
        // writing a file, a large answer) runs off it, so this window and the others do not wait for it.
        var op = msg["op"]?.GetValue<string>();
        try
        {
            reply["result"] = op switch
            {
                "search" => await Task.Run(() => Search(msg)),
                // Highlights (HighlightStore): the store's files and the .lph files off the UI thread.
                "highlightsGet" => await Task.Run(() => app.Highlights.Get(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>())),
                "highlightsSet" => await SetHighlights(msg),
                "highlightsMoveAll" => await Task.Run(() => app.Highlights.MoveAll(msg["beside"]?.GetValue<bool>() == true)),
                "gitStatus" => await Task.Run(() => GitStatus(msg["path"]!.GetValue<string>())),
                "gitHead" => await Task.Run(() => GitHead(msg["path"]!.GetValue<string>())),
                "gitHeadId" => await Task.Run(() => GitHeadId(msg["path"]!.GetValue<string>())),
                // Compare with a git version (GitCompare): a file's text at a version, the versions, a folder's
                // changes, whether a file or folder is in git and changed.
                "gitShow" => await Task.Run(() => GitShow(msg["path"]!.GetValue<string>(), msg["rev"]!.GetValue<string>())),
                "gitVersions" => await Task.Run(() => GitVersions(msg["path"]!.GetValue<string>())),
                "gitFolderDiff" => await Task.Run(() => GitFolderDiff(msg["folder"]!.GetValue<string>(), msg["rev"]!.GetValue<string>())),
                "gitState" => await Task.Run(() => GitState(msg["path"]!.GetValue<string>())),
                "folderList" => await Task.Run(() => FolderList(msg)),
                "format" => await Task.Run(() => Format(msg)),
                "read" => await ReadFile(msg["path"]!.GetValue<string>()),
                "write" => await WriteFile(msg),
                _ => DispatchMarked(msg, files, op),
            };
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        if (IsDisposed) return;
        string answer;
        if (op is not null && LargeAnswers.Contains(op)) answer = await Task.Run(() => reply.ToJsonString());
        else using (StallLog.Doing($"the answer to {op} for {Text}")) answer = reply.ToJsonString();
        if (IsDisposed) return;
        using (StallLog.Doing($"the answer to {op} for {Text}")) web.CoreWebView2.PostWebMessageAsJson(answer);

        if (!pageReady && msg["op"]?.GetValue<string>() == "init")
        {
            pageReady = true;
            foreach (var queued in queue) web.CoreWebView2.PostWebMessageAsJson(queued);
            queue.Clear();
        }
    }

    readonly Dictionary<int, CancellationTokenSource> folderChecks = [];

    // Both trees of a folder compare: the rows as the page draws them.
    static JsonNode FolderList(JsonNode msg)
    {
        var rows = FolderCompare.List(msg["left"]!.GetValue<string>(), msg["right"]!.GetValue<string>());
        return new JsonArray(rows.Select(r => (JsonNode?)new JsonObject
        {
            ["rel"] = r.Rel, ["dir"] = r.Dir, ["state"] = r.State,
            ["leftSize"] = r.LeftSize, ["rightSize"] = r.RightSize,
            ["leftTime"] = r.LeftTime?.ToString("o"), ["rightTime"] = r.RightTime?.ToString("o"),
        }).ToArray());
    }

    void FolderCheck(int id, string left, string right, List<string> rels, bool whitespace, bool ignoreCase, CancellationToken stop)
    {
        var done = 0;
        void Send(JsonObject ev) => BeginInvoke(() => Post(ev));
        try
        {
            foreach (var rel in rels)
            {
                stop.ThrowIfCancellationRequested();
                string state;
                try
                {
                    var a = Path.Combine(left, rel);
                    var b = Path.Combine(right, rel);
                    state = FolderCompare.SameBytes(a, b, stop) ? "=" : (whitespace || ignoreCase) && FolderCompare.SameText(a, b, whitespace, ignoreCase) ? "=~" : "~";
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception) { state = "!"; }   // could not be read
                done++;
                Send(new JsonObject { ["event"] = "folderCheck", ["check"] = id, ["rel"] = rel, ["state"] = state, ["done"] = done, ["total"] = rels.Count });
            }
            Send(new JsonObject { ["event"] = "folderCheck", ["check"] = id, ["end"] = true, ["done"] = done, ["total"] = rels.Count });
        }
        catch (OperationCanceledException)
        {
            Send(new JsonObject { ["event"] = "folderCheck", ["check"] = id, ["end"] = true, ["stopped"] = true, ["done"] = done, ["total"] = rels.Count });
        }
        finally { BeginInvoke(() => folderChecks.Remove(id)); }
    }

    JsonNode? Dispatch(JsonNode msg, string[]? files)
    {
        if (CharInfo.Request(msg["op"]?.GetValue<string>() ?? "", msg) is { Handled: true } chars) return chars.Result;
        string Arg(string name) => msg[name]!.GetValue<string>();

        switch (Arg("op"))
        {
            case "init":
            {
                var init = new JsonObject
                {
                    ["id"] = Id,
                    ["primary"] = Primary,
                    ["index"] = app.IndexOf(this),
                    ["theme"] = app.Mode,
                    ["tabColours"] = app.TabColours(),
                    ["folder"] = start.Folder,
                    ["files"] = new JsonArray(start.Files.Select(f => (JsonNode?)f).ToArray()),
                    ["view"] = start.View,
                    ["edit"] = start.Edit,
                };
                if (start.Compare is [var left, var right])
                    init["compare"] = new JsonObject { ["left"] = left, ["right"] = right, ["folders"] = Directory.Exists(left) };
                // Its session (a window of a project opened again) and its drafts.
                var (session, drafts) = app.StartOf(this);
                if (session is not null) init["restore"] = session;
                if (drafts.Count > 0) init["drafts"] = drafts;
                init["project"] = app.ProjectInfo(this);
                return init;
            }

            case "pickFile":
            {
                var filter = app.FileFilter();   // from the language packs
                using var d = new OpenFileDialog
                {
                    Multiselect = msg["one"]?.GetValue<bool>() != true,
                    Filter = filter,
                    FilterIndex = filter.Split('|').Length / 2,   // starts on All files (the last)
                };
                // At a file (Manage, Change): its folder, the file chosen.
                if (msg["at"]?.GetValue<string>() is { Length: > 0 } at)
                {
                    d.InitialDirectory = Path.GetDirectoryName(at);
                    d.FileName = Path.GetFileName(at);
                }
                return d.ShowDialog(this) == DialogResult.OK
                    ? new JsonArray(d.FileNames.Select(f => (JsonNode?)f).ToArray())
                    : null;
            }

            case "pickImage":
            {
                using var d = new OpenFileDialog
                {
                    Multiselect = true,
                    Filter = "Images|" + string.Join(";", ImageLinks.Extensions.Select(e => "*" + e)) + "|All files|*.*",
                };
                return d.ShowDialog(this) == DialogResult.OK
                    ? new JsonArray(d.FileNames.Select(f => (JsonNode?)f).ToArray())
                    : null;
            }

            // Insert link: a URL on the clipboard becomes the link target (from the page, reading it may ask for permission).
            case "clipboardText":
                return Clipboard.ContainsText() ? Clipboard.GetText() : null;

            // Edit > Copy / Cut with the Windows clipboard active (the keys copy in the page itself), and every copy
            // of a block (column: the text plus the MSDEVColumnSelect marker Visual Studio and Notepad++ use).
            case "clipboardSetText":
                if (Arg("text").Length == 0) return null;
                if (msg["column"]?.GetValue<bool>() == true)
                {
                    var data = new DataObject();
                    data.SetText(Arg("text"));
                    data.SetData(ColumnFormat, new MemoryStream(new byte[1]));
                    Clipboard.SetDataObject(data, true);
                }
                else Clipboard.SetText(Arg("text"));
                return null;

            // Is the text on the Windows clipboard a block (column)? Paste then puts it in as a column.
            case "clipboardColumn":
                return Clipboard.ContainsText() && Clipboard.GetDataObject()?.GetDataPresent(ColumnFormat) == true;

            // Insert image from the clipboard: image files copied in Explorer, or a picture (as base64 PNG).
            case "clipboardImage":
            {
                var result = new JsonObject();
                if (Clipboard.ContainsFileDropList())
                    result["paths"] = new JsonArray(Clipboard.GetFileDropList().Cast<string>()
                        .Where(ImageLinks.IsImage).Select(p => (JsonNode?)p).ToArray());
                else if (Clipboard.GetImage() is Image image)
                {
                    using (image)
                    using (var png = new MemoryStream())
                    {
                        image.Save(png, System.Drawing.Imaging.ImageFormat.Png);
                        result["png"] = Convert.ToBase64String(png.ToArray());
                    }
                }
                return result;
            }

            case "keys":
                return KeysFile.Load(AppHost.DataDir);

            case "fonts":
                return new JsonArray(Fonts.List().Select(f => (JsonNode)new JsonObject { ["name"] = f.Name, ["mono"] = f.Mono }).ToArray());

            // The numbered clipboards (ClipboardStore), shared by all windows; 0 is the Windows clipboard.
            case "clipState":
            {
                var state = app.Clipboards.State();
                state["previews"]![0] = Clipboard.ContainsText() ? ClipboardStore.Preview(Clipboard.GetText()) : "";
                return state;
            }

            case "clipSelect":
                app.Clipboards.Select(msg["n"]!.GetValue<int>());
                app.ClipboardsChanged();
                return null;

            case "clipSet":
                app.Clipboards.Set(msg["n"]!.GetValue<int>(), Arg("text"), msg["column"]?.GetValue<bool>() == true);
                app.ClipboardsChanged();
                return null;

            // The character picker (CharPickerForm): opened at a character; the character after the cursor, while it
            // is open.
            case "openHighlights":
                app.OpenHighlights(this);
                return null;

            // Projects > Manage projects (ProjectsForm).
            case "openProjects":
                app.OpenProjects(this);
                return null;

            // The page's answer to a question of the host (AppHost.Ask: the unsaved work of this window).
            case "answer":
                app.Answer(msg["ask"]!.GetValue<int>(), msg["result"]);
                return null;

            // Which document's highlights this window shows (the highlights window lists them).
            case "highlightsShown":
                app.HighlightsShown(this, msg.AsObject().DeepClone().AsObject());
                return null;

            case "openCharPicker":
                app.OpenCharPicker(this, msg["code"]?.GetValue<int>());
                return null;

            case "pickerCursor":
                app.CharPickerCursor(msg["code"]?.GetValue<int>());
                return null;

            case "clipGet":
                return app.Clipboards.Get(msg["n"]!.GetValue<int>());

            // Bookmarks of a file or draft (BookmarkStore), placed in its current text.
            // The stored bookmarks; placed in the text (Resolve) only when the page sends it along (bookmarksResolve
            // otherwise, and only when there are any: a large file's text is not sent for nothing).
            case "bookmarksGet":
            {
                var list = app.Bookmarks.Get(BookmarkStore.Key(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>()));
                return msg["text"] is null ? list : BookmarkStore.Resolve(list, Arg("text"));
            }

            // A line of the page's own for the stall log: a script that ran long.
            case "stallNote":
                StallLog.Note($"{Arg("text")} in {Text}");
                return null;

            case "bookmarksSet":
                app.Bookmarks.Set(BookmarkStore.Key(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>()), msg["list"]!.AsArray());
                return null;

            // The ruler's lines of a file or draft (RulerStore): opening it puts it first in the list kept.
            case "rulersGet":
                return app.Rulers.Open(BookmarkStore.Key(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>()));

            case "rulersSet":
                app.Rulers.Set(BookmarkStore.Key(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>()), msg["lines"]!.AsArray());
                return null;

            // After a reload from disk: the bookmarks the file had, placed in its new text.
            case "bookmarksResolve":
                return BookmarkStore.Resolve(msg["list"]!.AsArray(), Arg("text"));

            // The folder compare's second pass (FolderCompare.cs): the contents of the files to check, in the
            // background; each answer as an event folderCheck, the last one with end. Stopped by folderCheckStop.
            case "folderCheck":
            {
                var id = msg["check"]!.GetValue<int>();   // not "id": the bridge's own call number
                var left = Arg("left");
                var right = Arg("right");
                var rels = msg["files"]!.AsArray().Select(r => r!.GetValue<string>()).ToList();
                var whitespace = msg["whitespace"]?.GetValue<bool>() == true;
                var ignoreCase = msg["case"]?.GetValue<bool>() == true;
                var stop = new CancellationTokenSource();
                folderChecks[id] = stop;
                Task.Run(() => FolderCheck(id, left, right, rels, whitespace, ignoreCase, stop.Token));
                return true;
            }

            case "folderCheckStop":
            {
                if (folderChecks.TryGetValue(msg["check"]!.GetValue<int>(), out var stop)) stop.Cancel();
                return true;
            }

            // The left side to compare (ExplorerMenu): shared with Explorer's menu and every window.
            case "compareLeft":
            {
                var left = ExplorerMenu.Left;
                return left is null ? null : new JsonObject
                {
                    ["path"] = left, ["name"] = ExplorerMenu.NameOf(left), ["exists"] = Path.Exists(left), ["folder"] = Directory.Exists(left),
                };
            }

            case "compareLeftSet":
                ExplorerMenu.SelectLeft(Arg("path"));
                return true;

            case "pickFolder":
            {
                using var d = new FolderBrowserDialog();
                if (msg["at"]?.GetValue<string>() is { Length: > 0 } at) d.SelectedPath = at;   // Manage, Change
                return d.ShowDialog(this) == DialogResult.OK ? d.SelectedPath : null;
            }

            case "pickSave":
            {
                // Starts on the filter that matches the file's own type (from the language packs).
                var ext = "*" + Path.GetExtension(Arg("name")).ToLowerInvariant();
                var filter = app.FileFilter();
                var pairs = filter.Split('|');
                var index = Enumerable.Range(0, pairs.Length / 2).FirstOrDefault(i => pairs[i * 2 + 1].Split(';').Contains(ext), pairs.Length / 2 - 1);
                using var d = new SaveFileDialog
                {
                    Filter = filter,
                    FilterIndex = index + 1,
                    FileName = Arg("name"),
                    InitialDirectory = Arg("dir"),
                };
                return d.ShowDialog(this) == DialogResult.OK ? d.FileName : null;
            }

            case "list":
                return List(Arg("path"));

            // Macros (MacroStore, plan 17): the named ones, one's text, written, renamed, deleted, its file (to edit it in a
            // tab), and a key for one added to your keys.json.
            case "macroList":
                return new JsonArray(MacroStore.List(AppHost.DataDir).Select(n => (JsonNode?)n).ToArray());

            case "macroRead":
                return MacroStore.Read(AppHost.DataDir, Arg("name"));

            case "macroWrite":
                MacroStore.Write(AppHost.DataDir, Arg("name"), Arg("text"));
                return null;

            case "macroRename":
                return MacroStore.Rename(AppHost.DataDir, Arg("from"), Arg("to"));

            case "macroDelete":
                MacroStore.Delete(AppHost.DataDir, Arg("name"));
                return null;

            case "macroPath":   // `create`: an empty file when there is none yet (New macro, Open)
            {
                var path = MacroStore.PathOf(AppHost.DataDir, Arg("name"));
                if (path is not null && msg["create"]?.GetValue<bool>() == true && !File.Exists(path))
                {
                    Directory.CreateDirectory(MacroStore.Dir(AppHost.DataDir));
                    File.WriteAllText(path, "");
                }
                return path;
            }

            case "macroReference":
                return AppHost.ShippedFile("macros", "reference.md");

            case "macroNameRefusal":
                return MacroStore.Refusal(Arg("name"));

            case "macroKey":
                return KeysFile.AddMacroKey(AppHost.DataDir, Arg("key"), Arg("name"));

            // The backups LexPen made (Backups, plan 33): a folder has some (below it too); which to delete; deleted to
            // the Recycle Bin, a file's own or a folder's (with its subfolders or not).
            case "hasBackups":
                return Backups.Any(Arg("path"));

            case "askBackups":
                return AskBackups(Arg("path"));

            case "deleteBackups":
            {
                var path = Arg("path");
                List<string> list = File.Exists(path) ? (Backups.Of(path) is string own ? [own] : [])
                    : Backups.In(path, msg["subfolders"]?.GetValue<bool>() == true).ToList();
                var (deleted, left) = Backups.Delete(list);
                return new JsonObject { ["deleted"] = deleted, ["left"] = new JsonArray(left.Select(p => (JsonNode?)p).ToArray()) };
            }

            case "watch":
                Root = Arg("root") is { Length: > 0 } root ? root : null;
                Watch(treeWatcher, Root, "*");
                return null;

            case "watchFiles":
                WatchFiles(msg["paths"]!.AsArray().Select(p => p!.GetValue<string>()));
                return null;

            case "about":
                return About();

            case "exit":
                BeginInvoke(() => Close());   // later, so this reply still reaches the page
                return null;

            case "confirm":
                return MessageBox.Show(this, Arg("text"), "LexPen",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes;

            // The preview of a Replace in the Search panel (ReplacePreviewForm): the ids of the changes to make, or null.
            case "confirmReplace":
            {
                using var preview = new ReplacePreviewForm(app, this, msg["changes"]!);
                preview.ShowDialog(this);
                return preview.Kept;
            }

            // Save before closing: "yes" | "no" | null (Cancel).
            case "askSave":
                return MessageBox.Show(this, Arg("text"), "LexPen",
                    MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question) switch
                {
                    DialogResult.Yes => "yes",
                    DialogResult.No => "no",
                    _ => null,
                };

            // Pretty print of JSON with comments: keep them, remove them, or (null) do not format.
            case "askKeepComments":
                return MessageBox.Show(this, "This JSON has comments. Keep the comments?\n\nYes keeps them, No removes them, Cancel changes nothing.",
                    "LexPen", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question) switch
                {
                    DialogResult.Yes => "keep",
                    DialogResult.No => "drop",
                    _ => null,
                };

            // Settings (SettingsFile): read, change one (every window follows), the rows of the settings window.
            case "settings":
            {
                var merged = app.SettingsFor(this);   // with its theme set's values (docs/plans/executed/PLAN-theme-sets.md)
                merged["pageSettingsMoved"] = app.PageSettingsMoved;
                merged["layoutMoved"] = app.LayoutMoved;
                return merged;
            }

            case "settingSet":
                return app.SetSetting(Arg("name"), msg["value"]?.DeepClone(), this);   // a colour: into this window's set

            case "openThemeSets":
                app.OpenThemeSets(this);
                return null;

            // F1 > File types: this window's settings with the File types dialog open (docs/plans/executed/PLAN-file-types.md).
            case "openFileTypes":
                app.OpenSettings(this);
                app.SettingsWindowPost(this, new JsonObject { ["event"] = "fileTypes" });
                return null;

            // Save as default: what to save (asks when the theme set is part of it); the Undo of the set part.
            case "saveAsDefault":
                return app.SaveAsDefault(this, this);

            case "themeSetCommand":
                return app.ThemeSetCommand(this, msg);

            // This project's own theme set (null: none, the desktop's or the app's default).
            case "themeSet":
                app.SetProjectSet(this, msg["set"]?.GetValue<string>());
                return null;

            case "settingsImport":
                app.ImportPageSettings(msg["values"]!.AsObject());
                return null;

            // This window's layout (docs/plans/executed/PLAN-settings-layers.md): what it opens with; what it shows now (for
            // its settings window); the old values of the page's storage, moved to the settings once.
            case "windowLayout":
                return app.LayoutFor(this);

            case "layoutShown":
                PageLayout = msg["layout"]?.DeepClone() as JsonObject;
                app.LayoutShown(this);
                return null;

            case "layoutImport":
                app.ImportLayout(msg["values"]!.AsObject());
                return null;

            // The zoom of the monitor this window is on (docs/plans/executed/PLAN-settings-layers.md, 3.6).
            case "screen":
                return app.ScreenOf(this);

            // Windows' double-click time (ms): the page ignores the presses of a double click that brings the window
            // back (setting ignoreActivationClick), and the user can set it slower than the default.
            case "doubleClickTime":
                return (int)GetDoubleClickTime();

            case "screenZoom":
                app.SetScreenZoom(this, msg["editorStep"]?.GetValue<double>(), msg["previewFactor"]?.GetValue<double>());
                return null;

            case "screenZoomClear":
                app.ClearScreenZooms();
                return null;

            case "settingDefs":
                app.SettingDefs = msg["defs"]?.DeepClone();
                app.DefsChanged();
                return null;

            // The look (themes, light / dark mode); Day / night while following Windows.
            case "look":
                return app.Look(this);

            // Language packs: all of them, and a language chosen for a file.
            case "languages":
                return app.Languages.DeepClone();

            case "setFileRanges":
                app.SetFileRanges(Arg("path"), msg["ranges"] as JsonArray);
                return null;

            case "setFileLanguage":
                app.SetFileLanguage(Arg("path"), msg["language"]?.GetValue<string>());
                return null;

            case "switchMode":
                app.SwitchMode();
                return null;

            case "openSettings":
                app.OpenSettings(this);
                return null;

            case "newDraft":
                return app.Drafts.NewId();

            case "draftWrite":
                app.Drafts.Write(Arg("draft"), Arg("text"));
                return null;

            case "draftName":
                app.Drafts.SetName(Arg("draft"), msg["name"]?.GetValue<string>());
                return null;

            case "draftDelete":
                app.Drafts.Delete(Arg("draft"));
                app.Rulers.Set(BookmarkStore.Key(null, Arg("draft")), []);   // its ruler lines (saved: they went to the file)
                return null;

            case "closePrompt":
                return ClosePrompt(Strings(msg["dirty"]), Strings(msg["drafts"]));

            case "closeNow":
                closeApproved = true;
                BeginInvoke(() => Close());
                return null;

            case "closeCancel":
                closeAsked = false;
                CloseCancelled?.Invoke();
                CloseCancelled = null;
                return null;

            case "session":
                app.SaveSession(this, msg["data"]!);
                return null;

            case "projects":
                return app.ProjectList(this);

            case "project":
                app.ProjectCommand(this, Arg("kind"), msg);
                return null;

            case "lock":
                return app.Lock(Arg("path"), this);

            case "unlock":
                app.Unlock(Arg("path"), this);
                return null;

            case "docText":
                app.DocText(Arg("path"), this, Arg("text"));
                return null;

            case "moveTab":
            {
                Point? at = msg["screenX"] is JsonNode x ? new Point(x.GetValue<int>(), msg["screenY"]!.GetValue<int>()) : null;
                app.MoveTab(this, msg["target"]!, msg["tab"]!, msg["pane"]?.GetValue<int>(), msg["transfer"]?.GetValue<string>(), at);
                return true;
            }

            case "pullTab":
                app.Find(msg["win"]!.GetValue<int>())?.Post(new JsonObject
                {
                    ["event"] = "giveTab", ["tab"] = msg["tab"]!.GetValue<int>(), ["to"] = Id, ["pane"] = msg["pane"]?.GetValue<int>(),
                });
                return null;

            case "droppedFiles":
                return new JsonArray((files ?? []).Select(f => (JsonNode?)new JsonObject
                    { ["path"] = f, ["dir"] = f.Length > 0 && Directory.Exists(f) }).ToArray());

            case "rename":
                return app.Rename(Arg("path"), Arg("name"));

            case "recent":
                return app.Recent();

            case "findHistory":
                return app.FindHistoryState();

            case "findHistoryAdd":
                app.FindHistoryAdd(Arg("kind"), msg["entry"]!);
                return null;

            case "findHistoryClear":
                app.FindHistoryClear(Arg("kind"));
                return null;

            case "recentAdd":
                app.RecentAdd(Arg("kind"), Arg("path"));
                return null;

            case "recentRemove":
                app.RecentRemove(Arg("path"));
                return null;

            // Favourite files or folders (kind: "files", the default, or "folders"); set: the whole list in an order.
            case "favouriteAdd":
                app.FavouriteAdd(msg["kind"]?.GetValue<string>() ?? "files", Arg("path"));
                return null;

            case "favouriteRemove":
                app.FavouriteRemove(msg["kind"]?.GetValue<string>() ?? "files", Arg("path"));
                return null;

            case "favouriteSet":
                app.SetFavourites(msg["kind"]?.GetValue<string>() ?? "files", Strings(msg["list"]).ToList());
                return null;

            case "placeImages":
                return PlaceImages(Arg("doc"), Strings(msg["paths"]), msg["data"]?.GetValue<string>(), msg["ask"]?.GetValue<bool>() == true);

            default:
                throw new ArgumentException($"Unknown operation '{Arg("op")}'.");
        }
    }

    // Pretty print (Formatters): { text } or { error, line, column }; { ask: true } for JSON with comments when the
    // page is to ask first (comments: "ask"; else "keep" or "drop").
    static JsonObject Format(JsonNode msg)
    {
        string kind = msg["kind"]!.GetValue<string>(), text = msg["text"]!.GetValue<string>(), indent = msg["indent"]!.GetValue<string>();
        var comments = msg["comments"]?.GetValue<string>() ?? "keep";
        if (kind == "json" && comments == "ask" && Formatters.JsonHasComments(text)) return new JsonObject { ["ask"] = true };
        var r = kind == "xml" ? Formatters.Xml(text, indent) : Formatters.Json(text, indent, comments != "drop");
        return new JsonObject { ["text"] = r.Text, ["error"] = r.Error, ["line"] = r.Line, ["column"] = r.Column };
    }

    // Image files (and a pasted picture, as base64 PNG) for the document: the markdown to insert.
    // Null when the user cancelled the question.
    JsonArray? PlaceImages(string doc, List<string> paths, string? png, bool ask)
    {
        var images = paths.Where(p => p.Length > 0 && File.Exists(p) && ImageLinks.IsImage(p)).ToList();
        var mode = "auto";
        if (ask && images.Count > 0)
        {
            if (AskImageMode(doc, images) is not string chosen) return null;
            mode = chosen;
        }
        var result = new JsonArray();
        foreach (var image in images) result.Add(ImageLinks.Place(doc, image, mode));
        if (png is { Length: > 0 })
            result.Add(ImageLinks.SavePicture(doc, Convert.FromBase64String(png), DateTime.Now));
        return result;
    }

    // Shift held while dropping or pasting: how to link the images. Null: cancelled.
    // Delete a folder's backups: "here" (the folder itself), "all" (with its subfolders), or null (Cancel).
    string? AskBackups(string folder)
    {
        var here = new TaskDialogCommandLinkButton("Delete here", "The .bak files in this folder itself");
        var all = new TaskDialogCommandLinkButton("Delete with subfolders", "The .bak files in this folder and every folder below it");
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = $"Delete the .bak files in {ExplorerMenu.NameOf(folder)}?",
            Text = "Only backups LexPen made (name.ext.bak next to name.ext). They go to the Recycle Bin.",
            AllowCancel = true,
        };
        page.Buttons.Add(here);
        page.Buttons.Add(all);
        page.Buttons.Add(TaskDialogButton.Cancel);
        var result = Program.ShowTask(this, page);
        return result == here ? "here" : result == all ? "all" : null;
    }

    string? AskImageMode(string doc, List<string> images)
    {
        var buttons = new (string Mode, TaskDialogCommandLinkButton Button)[]
        {
            ("relative", new("Relative path", "Link to the image where it is, relative to the document")),
            ("absolute", new("Absolute path", "Link to the image where it is: " + ImageLinks.Absolute(images[0]))),
            ("copyHere", new("Copy to the document's folder", Path.GetDirectoryName(doc))),
            ("copyImages", new("Copy to the document's image folder", ImageLinks.ImagesFolder(doc))),
        };
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = images.Count == 1 ? $"Add {Path.GetFileName(images[0])}" : $"Add {images.Count} images",
            Text = "How should the document link to the image?",
            AllowCancel = true,
        };
        foreach (var (_, button) in buttons) page.Buttons.Add(button);
        page.Buttons.Add(TaskDialogButton.Cancel);
        var result = Program.ShowTask(this, page);
        return buttons.FirstOrDefault(b => b.Button == result).Mode;
    }

    static JsonObject Search(JsonNode msg) => FolderSearch.Search(
        msg["root"]!.GetValue<string>(), msg["pattern"]!.GetValue<string>(),
        msg["ignoreCase"]!.GetValue<bool>(),
        msg["extensions"] is JsonArray known ? new HashSet<string>(Strings(known), StringComparer.OrdinalIgnoreCase) : null,
        new HashSet<string>(Strings(msg["skip"]), StringComparer.OrdinalIgnoreCase));

    static List<string> Strings(JsonNode? node) => node?.AsArray().Select(n => n!.GetValue<string>()).ToList() ?? [];

    // One prompt for everything unsaved in this window: "save" | "discard" | "cancel".
    string ClosePrompt(List<string> dirty, List<string> drafts)
    {
        var text = new StringBuilder();
        if (dirty.Count > 0)
            text.AppendLine("Unsaved changes:").AppendJoin("", dirty.Select(d => $"    {d}\n"));
        if (dirty.Count > 0 && drafts.Count > 0)
            text.AppendLine();
        if (drafts.Count > 0)
            text.AppendLine("Drafts changed (kept as draft unless you save them as a file):")
                .AppendJoin("", drafts.Select(d => $"    {d}\n"));
        var save = new TaskDialogButton("Yes");
        var discard = new TaskDialogButton(drafts.Count > 0 ? "No (keep drafts)" : "No");
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = "Save before closing?",
            Text = text.ToString().TrimEnd(),
            Icon = TaskDialogIcon.Warning,
            Buttons = { save, discard, TaskDialogButton.Cancel },
            DefaultButton = save,
            AllowCancel = true,
        };
        var result = Program.ShowTask(this, page);
        return result == save ? "save" : result == discard ? "discard" : "cancel";
    }

    // Each file: name, path, folder or not, and last write time (ms since 1970) for sorting.
    // Hidden/dot folders, node_modules and hidden files are skipped.
    static JsonArray List(string path)
    {
        var dir = new DirectoryInfo(path);
        var folders = dir.EnumerateDirectories()
            .Where(d => !d.Name.StartsWith('.') && d.Name != "node_modules" && !d.Attributes.HasFlag(FileAttributes.Hidden));
        var files = dir.EnumerateFiles().Where(f => !f.Attributes.HasFlag(FileAttributes.Hidden));

        var result = new JsonArray();
        foreach (var item in folders.Cast<FileSystemInfo>().Concat(files))
            result.Add(new JsonObject
            {
                ["name"] = item.Name, ["path"] = item.FullName, ["dir"] = item is DirectoryInfo,
                ["modified"] = new DateTimeOffset(item.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
            });
        return result;
    }

    // The tree lists every file, so refuse what cannot be shown as text.
    static (string Text, string Encoding) ReadText(string path)
    {
        if (new FileInfo(path).Length > MaxFileSize)
            throw new IOException($"{Path.GetFileName(path)} is too large to open (over {MaxFileSize / 1024 / 1024} MB).");
        // Shared: a file another program has open for writing (a log) can be read all the same.
        byte[] bytes;
        using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            bytes = new byte[file.Length];
            file.ReadExactly(bytes);
        }
        // A zero byte means binary, except in UTF-16 text, which starts with a byte order mark.
        var utf16 = bytes is [0xFF, 0xFE, ..] or [0xFE, 0xFF, ..];
        if (!utf16 && Array.IndexOf(bytes, (byte)0, 0, Math.Min(bytes.Length, 8000)) >= 0)
            throw new IOException($"{Path.GetFileName(path)} is not a text file.");
        return TextFile.Decode(bytes);
    }

    // What the About window shows: this build, the platform it runs on and the bundled libraries.
    JsonObject About()
    {
        var assembly = typeof(MainForm).Assembly;
        var os = Environment.OSVersion.Version;
        string? Metadata(string key) =>
            assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == key)?.Value;
        return new JsonObject
        {
            ["version"] = assembly.GetName().Version!.ToString(3),
            ["commit"] = Metadata("Commit"),
            ["built"] = Metadata("BuildTime"),
            ["os"] = $"Windows {(os.Build >= 22000 ? 11 : 10)} (build {os.Build}), {RuntimeInformation.ProcessArchitecture}",
            ["dotnet"] = RuntimeInformation.FrameworkDescription,
            ["webView2"] = web.CoreWebView2.Environment.BrowserVersionString,
            ["webView2Sdk"] = typeof(CoreWebView2).Assembly.GetName().Version!.ToString(),
            ["libraries"] = JsonNode.Parse(WebFiles.ReadText("vendor/versions.json")),
        };
    }

    // Changed files under the folder as {path, status}, status being M (modified), A (added),
    // U (untracked), D (deleted), R (renamed) or ! (conflict). Null outside a repository or without git.
    static JsonArray? GitStatus(string folder)
    {
        var top = Git(folder, "rev-parse", "--show-toplevel")?.Trim();
        var output = top is null ? null : Git(folder, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".");
        if (output is null) return null;

        var result = new JsonArray();
        var entries = output.Split('\0');
        for (var i = 0; i < entries.Length; i++)
        {
            var entry = entries[i];   // "XY path": X = staged, Y = working tree
            if (entry.Length < 4) continue;
            var (x, y) = (entry[0], entry[1]);
            if (x is 'R' or 'C') i++;   // followed by the original path
            var status = x == '?' ? 'U'
                : x == 'U' || y == 'U' || (x == y && x is 'A' or 'D') ? '!'
                : x == 'D' || y == 'D' ? 'D'
                : x == 'A' ? 'A'
                : x is 'R' or 'C' ? 'R'
                : 'M';
            result.Add(new JsonObject
            {
                ["path"] = Path.GetFullPath(Path.Combine(top!, entry[3..])),
                ["status"] = status.ToString(),
            });
        }
        return result;
    }

    // The file as it is in the last commit (the git markers in the gutter compare with it). Null when the
    // file is not in a repository, not committed yet, or git is not installed.
    static string? GitHead(string path) =>
        Path.GetDirectoryName(path) is string dir ? Git(dir, "show", "HEAD:./" + Path.GetFileName(path)) : null;

    // The file as it is in a version (a commit, a branch, HEAD); null when it is not in it.
    static string? GitShow(string path, string rev) =>
        Path.GetDirectoryName(path) is string dir ? Git(dir, "show", $"{rev}:./{Path.GetFileName(path)}") : null;

    // A file's or folder's own history (the last 50 commits that changed it) and the branches; null outside git.
    static JsonNode? GitVersions(string path)
    {
        var folder = Directory.Exists(path);
        var dir = folder ? path : Path.GetDirectoryName(path);
        if (dir is null || Git(dir, "log", "-n", "50", "--date=short", "--format=%H%x1f%h%x1f%ad%x1f%an%x1f%s", "--",
            folder ? "." : "./" + Path.GetFileName(path)) is not string log) return null;
        return new JsonObject
        {
            ["commits"] = GitCompare.Commits(log),
            ["branches"] = GitCompare.Branches(Git(dir, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes") ?? ""),
            ["current"] = Git(dir, "rev-parse", "--abbrev-ref", "HEAD")?.Trim(),
        };
    }

    // A folder against a version: the folder compare's rows (GitCompare.FolderRows). Throws outside git.
    static JsonNode GitFolderDiff(string folder, string rev)
    {
        var diff = Git(folder, "diff", "--name-status", "-z", "--no-renames", "--relative", rev, "--", ".")
            ?? throw new InvalidOperationException($"{folder} is not in a git repository, or it has no version {rev}.");
        return GitCompare.FolderRows(diff, Git(folder, "ls-files", "--others", "--exclude-standard", "-z", "--", ".") ?? "");
    }

    // { changed } for a file git tracks (changed: differs from the last commit on disk) or a folder in a repository
    // (changed: something in it differs or is new); null otherwise.
    static JsonNode? GitState(string path)
    {
        var folder = Directory.Exists(path);
        var dir = folder ? path : Path.GetDirectoryName(path);
        if (dir is null) return null;
        var target = folder ? "." : "./" + Path.GetFileName(path);
        if (folder ? Git(dir, "rev-parse", "--is-inside-work-tree")?.Trim() != "true" : Git(dir, "ls-files", "--error-unmatch", "--", target) is null)
            return null;
        var status = Git(dir, "status", "--porcelain", "--untracked-files=all", "--", target);
        return new JsonObject { ["changed"] = !string.IsNullOrWhiteSpace(status) };
    }

    // Which version of the file the last commit holds (its blob id), so the page asks for the text (GitHead) only
    // when that changed: a large file is not sent again on every change in the repository.
    static string? GitHeadId(string path) =>
        Path.GetDirectoryName(path) is string dir ? Git(dir, "rev-parse", "HEAD:./" + Path.GetFileName(path))?.Trim() : null;

    // A file read off the UI thread. Read-only on disk: the tab opens read-only (it cannot be saved anyway). A
    // language chosen for this file before (the selector), else null: by extension.
    async Task<JsonNode?> ReadFile(string path)
    {
        var (text, encoding, readOnly) = await Task.Run(() =>
        {
            var (t, e) = ReadText(path);
            return (t, e, (File.GetAttributes(path) & FileAttributes.ReadOnly) != 0);
        });
        return new JsonObject { ["text"] = text, ["encoding"] = encoding, ["readOnly"] = readOnly, ["language"] = app.FileLanguage(path),
            ["ranges"] = app.FileRanges(path) };
    }

    // A file written off the UI thread, in the encoding it was read in; `backup`: the old file becomes name.bak. Noted
    // as our own write first, so the watcher does not report it as changed elsewhere.
    async Task<JsonNode?> WriteFile(JsonNode msg)
    {
        var path = msg["path"]!.GetValue<string>();
        var text = msg["text"]!.GetValue<string>();
        var encoding = msg["encoding"]?.GetValue<string>() ?? TextFile.Utf8;
        var backup = msg["backup"]?.GetValue<bool>() == true;
        ownWrites[path] = DateTime.UtcNow;
        await Task.Run(() => TextFile.Write(path, text, encoding, backup));
        return true;
    }

    // A file's highlights written (off the UI thread), then the other windows told.
    async Task<JsonNode?> SetHighlights(JsonNode msg)
    {
        var path = msg["path"]?.GetValue<string>();
        var draft = msg["draft"]?.GetValue<string>();
        var list = msg["list"]!.AsArray().DeepClone().AsArray();
        var beside = msg["beside"]?.GetValue<bool>() == true;
        if (path is not null) ownWrites[HighlightStore.BesidePath(path)] = DateTime.UtcNow;   // not news for the tree
        var where = await Task.Run(() => app.Highlights.Set(path, draft, list, beside));
        app.HighlightsChanged(this, path, draft);
        return where;
    }

    // A request answered on the UI thread, marked for the stall log.
    JsonNode? DispatchMarked(JsonNode msg, string[]? files, string? op)
    {
        using var _ = StallLog.Doing($"{op} for {Text}");
        return Dispatch(msg, files);
    }

    static string? Git(string folder, params string[] args)
    {
        var start = new ProcessStartInfo("git")
        {
            WorkingDirectory = folder,
            RedirectStandardOutput = true,
            StandardOutputEncoding = Encoding.UTF8,
            CreateNoWindow = true,
        };
        // Otherwise status rewrites the index, which the watcher reports, which asks for status again.
        start.Environment["GIT_OPTIONAL_LOCKS"] = "0";
        foreach (var arg in args) start.ArgumentList.Add(arg);
        try
        {
            using var git = Process.Start(start)!;
            var output = git.StandardOutput.ReadToEnd();
            git.WaitForExit();
            return git.ExitCode == 0 ? output : null;
        }
        catch (Win32Exception) { return null; }   // git not installed
    }

    // Whether the Windows clipboard holds a block (column) must be known in the page at once: a paste does not wait for
    // the host. Windows says when the clipboard changes; the page is told (and once at the start).
    const int WM_CLIPBOARDUPDATE = 0x031D;

    [DllImport("user32.dll")]
    static extern uint GetDoubleClickTime();

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool AddClipboardFormatListener(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RemoveClipboardFormatListener(IntPtr hwnd);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        AddClipboardFormatListener(Handle);
        PostClipboardColumn();
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        RemoveClipboardFormatListener(Handle);
        base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_CLIPBOARDUPDATE) PostClipboardColumn();
        base.WndProc(ref m);
    }

    // Asked without opening the clipboard (IsClipboardFormatAvailable): opening it waits, and retries, while another
    // program holds it, and every window would wait on this shared thread.
    void PostClipboardColumn()
    {
        var column = IsClipboardFormatAvailable(CF_UNICODETEXT) && IsClipboardFormatAvailable(ColumnFormatId);
        Post(new JsonObject { ["event"] = "clipboardColumn", ["column"] = column });
    }

    const uint CF_UNICODETEXT = 13;
    static readonly uint ColumnFormatId = RegisterClipboardFormat(ColumnFormat);

    [DllImport("user32.dll")]
    static extern bool IsClipboardFormatAvailable(uint format);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern uint RegisterClipboardFormat(string name);

    // Its place and desktop are kept with the window's session (AppHost.WindowPlaceChanged), once it is shown.
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        Move += (_, _) => app.WindowPlaceChanged(this);
        Resize += (_, _) => app.WindowPlaceChanged(this);
        app.WindowShown(this);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // The page decides first: it may ask to save, and answers with "closeNow".
        if (!closeApproved && pageReady && e.CloseReason is not (CloseReason.WindowsShutDown or CloseReason.TaskManagerClosing))
        {
            e.Cancel = true;
            if (closeAsked && MessageBox.Show(this, "The window does not respond. Close it anyway?", "LexPen",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
            {
                closeApproved = true;
                BeginInvoke(() => Close());
                return;
            }
            closeAsked = true;
            // Pinned tabs go to another open window of this project, if there is one (the page decides, per setting);
            // closing with the project, they stay (the whole project closes) and the answer is given.
            Post(CloseAnswer is null
                ? new JsonObject { ["event"] = "closeRequest", ["peer"] = app.PeerOf(this)?.Id }
                : new JsonObject { ["event"] = "closeRequest", ["answer"] = CloseAnswer });
            return;
        }

        app.ReleaseOwned(this);

        if (Primary)
            app.SaveBounds(WindowState == FormWindowState.Normal ? Bounds : RestoreBounds,
                WindowState == FormWindowState.Maximized);
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            treeWatcher.Dispose();
            foreach (var w in fileWatchers.Values) w.Dispose();
            changeTimer.Dispose();
        }
        base.Dispose(disposing);
    }
}
