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
    public sealed record Start(string? Folder, List<string> Files, int Key = 0, bool ToDesktop = false);

    readonly AppHost app;
    Start start;
    public int Id { get; }
    /// <summary>The window's key in its project (ProjectStore).</summary>
    public int Key => start.Key;

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
    bool active;

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
    readonly System.Windows.Forms.Timer changeTimer = new() { Interval = 300 };
    bool treeChanged, gitChanged;
    readonly HashSet<string> changedFiles = new(StringComparer.OrdinalIgnoreCase);
    // Files that changed while the window was not active, for the tree highlight.
    readonly HashSet<string> freshFiles = new(StringComparer.OrdinalIgnoreCase);
    // Our own saves are not news for the tree highlight.
    readonly Dictionary<string, DateTime> ownWrites = new(StringComparer.OrdinalIgnoreCase);

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

        treeWatcher.SynchronizingObject = this;
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
    }

    // Only what the tree shows matters: everything outside hidden folders and node_modules.
    // Edited files and a rewritten git index (stage, commit, checkout) only change the git marks.
    void OnTreeEvent(string path, bool content = false)
    {
        var parts = Path.GetRelativePath(treeWatcher.Path, path).Split(Path.DirectorySeparatorChar);
        if (parts is [".git", "index"]) NotifyChange(git: true);
        if (parts[..^1].Any(p => p.StartsWith('.') || p == "node_modules")) return;
        if (!active && File.Exists(path) && !IsOwnWrite(path)) freshFiles.Add(path);
        if (content) NotifyChange(git: true);
        else NotifyChange(tree: true);
    }

    void OnFileEvent(string path)
    {
        if (!watchedFiles.Contains(path)) return;
        changedFiles.Add(path);
        NotifyChange();
    }

    bool IsOwnWrite(string path) =>
        ownWrites.TryGetValue(path, out var at) && DateTime.UtcNow - at < TimeSpan.FromSeconds(3);

    void NotifyChange(bool tree = false, bool git = false)
    {
        treeChanged |= tree;
        gitChanged |= git;
        changeTimer.Stop();
        changeTimer.Start();
    }

    void FlushChanges()
    {
        changeTimer.Stop();
        var message = new JsonObject
        {
            ["event"] = "changed", ["tree"] = treeChanged, ["git"] = gitChanged,
            ["files"] = new JsonArray(changedFiles.Select(p => (JsonNode?)new JsonObject
                { ["path"] = p, ["kind"] = File.Exists(p) ? "changed" : "removed" }).ToArray()),
            ["fresh"] = new JsonArray(freshFiles.Select(p => (JsonNode?)p).ToArray()),
        };
        treeChanged = gitChanged = false;
        changedFiles.Clear();
        freshFiles.Clear();
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
                SynchronizingObject = this,
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

    // Window chrome follows the mode; the background shown before the page paints is the theme's.
    // Secondary windows get a dimmed caption and border (Windows 11; Windows 10 ignores it).
    public void ApplyTheme()
    {
        var dark = app.Mode == "dark";
        BackColor = web.DefaultBackgroundColor = app.AppBackground();
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
        var script = app.FirstPaintScript();
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
            var json = m.WebMessageAsJson;
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
        firstPaint = await core.AddScriptToExecuteOnDocumentCreatedAsync(firstPaintScript = app.FirstPaintScript());
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
        var json = message.ToJsonString();
        if (pageReady && !IsDisposed) web.CoreWebView2.PostWebMessageAsJson(json);
        else queue.Add(json);
    }

    async void OnMessage(string json, string[]? files)
    {
        if (IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        // A folder search and git status can take a while: off the UI thread, so the window and the
        // other requests do not wait for them.
        var op = msg["op"]?.GetValue<string>();
        try
        {
            reply["result"] = op switch
            {
                "search" => await Task.Run(() => Search(msg)),
                "gitStatus" => await Task.Run(() => GitStatus(msg["path"]!.GetValue<string>())),
                "gitHead" => await Task.Run(() => GitHead(msg["path"]!.GetValue<string>())),
                "format" => await Task.Run(() => Format(msg)),
                _ => Dispatch(msg, files),
            };
        }
        catch (Exception ex) { reply["error"] = ex.Message; }
        if (IsDisposed) return;
        web.CoreWebView2.PostWebMessageAsJson(reply.ToJsonString());

        if (!pageReady && msg["op"]?.GetValue<string>() == "init")
        {
            pageReady = true;
            foreach (var queued in queue) web.CoreWebView2.PostWebMessageAsJson(queued);
            queue.Clear();
        }
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
                };
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
            case "openCharPicker":
                app.OpenCharPicker(this, msg["code"]?.GetValue<int>());
                return null;

            case "pickerCursor":
                app.CharPickerCursor(msg["code"]?.GetValue<int>());
                return null;

            case "clipGet":
                return app.Clipboards.Get(msg["n"]!.GetValue<int>());

            // Bookmarks of a file or draft (BookmarkStore), placed in its current text.
            case "bookmarksGet":
                return BookmarkStore.Resolve(app.Bookmarks.Get(BookmarkStore.Key(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>())), Arg("text"));

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

            case "read":
            {
                var (text, encoding) = ReadText(Arg("path"));
                // Read-only on disk: the tab opens read-only (it cannot be saved anyway).
                var readOnly = (File.GetAttributes(Arg("path")) & FileAttributes.ReadOnly) != 0;
                // A language chosen for this file before (the selector), else null: by extension.
                return new JsonObject { ["text"] = text, ["encoding"] = encoding, ["readOnly"] = readOnly, ["language"] = app.FileLanguage(Arg("path")),
                    ["ranges"] = app.FileRanges(Arg("path")) };
            }

            // In the encoding the file was read in; `backup`: the old file becomes name.bak.
            case "write":
                ownWrites[Arg("path")] = DateTime.UtcNow;
                TextFile.Write(Arg("path"), Arg("text"), msg["encoding"]?.GetValue<string>() ?? TextFile.Utf8,
                    msg["backup"]?.GetValue<bool>() == true);
                return true;

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
                var merged = (JsonObject)app.Settings.DeepClone();
                merged["pageSettingsMoved"] = app.PageSettingsMoved;
                return merged;
            }

            case "settingSet":
                app.SetSetting(Arg("name"), msg["value"]?.DeepClone());
                return null;

            case "settingsImport":
                app.ImportPageSettings(msg["values"]!.AsObject());
                return null;

            case "settingDefs":
                app.SettingDefs = msg["defs"]?.DeepClone();
                app.DefsChanged();
                return null;

            // The look (themes, light / dark mode); Day / night while following Windows.
            case "look":
                return app.Look();

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
        var result = TaskDialog.ShowDialog(this, page);
        return buttons.FirstOrDefault(b => b.Button == result).Mode;
    }

    static JsonObject Search(JsonNode msg) => FolderSearch.Search(
        msg["root"]!.GetValue<string>(), msg["pattern"]!.GetValue<string>(),
        msg["ignoreCase"]!.GetValue<bool>(), msg["markdownOnly"]!.GetValue<bool>(),
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
        var result = TaskDialog.ShowDialog(this, page);
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
        var bytes = File.ReadAllBytes(path);
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

    void PostClipboardColumn()
    {
        bool column;
        try { column = Clipboard.ContainsText() && Clipboard.GetDataObject()?.GetDataPresent(ColumnFormat) == true; }
        catch (ExternalException) { return; }   // another program holds the clipboard just now
        Post(new JsonObject { ["event"] = "clipboardColumn", ["column"] = column });
    }

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
            // Pinned tabs go to another open window of this project, if there is one (the page decides, per setting).
            Post(new JsonObject { ["event"] = "closeRequest", ["peer"] = app.PeerOf(this)?.Id });
            return;
        }

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
