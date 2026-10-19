using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace LexPen;

/// <summary>
/// Owns all windows of the one running instance. Later launches send their arguments over a named
/// pipe (see Program); this class routes them to windows (see Router). It also holds what the windows
/// share: settings, the session, drafts, the edit lock per file and the WebView2 environment.
/// </summary>
sealed class AppHost : ApplicationContext
{
    // LEXPEN_DATA points a test run somewhere else, away from the real session and drafts.
    public static readonly string DataDir = System.Environment.GetEnvironmentVariable("LEXPEN_DATA") is { Length: > 0 } dir ? dir
        : Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "LexPen");
    static readonly string SettingsPath = Path.Combine(DataDir, "settings.json");
    static readonly string SessionPath = Path.Combine(DataDir, "session.json");

    public sealed class AppSettings
    {
        public string Theme { get; set; } = "light";
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public bool Maximized { get; set; }
        public List<string> RecentFiles { get; set; } = [];
        public List<string> RecentFolders { get; set; } = [];
        public List<string> ClosedFiles { get; set; } = [];
        public List<string> FavouriteFiles { get; set; } = [];
    }

    public AppSettings Settings { get; } = LoadSettings();
    public DraftStore Drafts { get; } = new(Path.Combine(DataDir, "Drafts"));

    readonly List<MainForm> windows = [];   // opening order: "next window" and the [n] in the title
    readonly List<MainForm> recent = [];    // most recently active first
    MainForm? primary;
    int lastId;
    Task<CoreWebView2Environment>? environment;

    // Edit lock per file: the first window in the list may edit, the others show its text read-only.
    readonly Dictionary<string, List<MainForm>> locks = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<MainForm> Windows => windows;
    public bool IsPrimary(MainForm w) => w == primary;
    public int IndexOf(MainForm w) => windows.IndexOf(w) + 1;
    public MainForm? Find(int id) => windows.FirstOrDefault(w => w.Id == id);

    public Task<CoreWebView2Environment> WebEnvironment()
    {
        // Both hosts are answered locally, but without this rule the browser first waits about
        // a second for a real DNS lookup of the made-up names to fail, on every start.
        var options = new CoreWebView2EnvironmentOptions(
            "--host-resolver-rules=\"MAP lexpen.example 127.0.0.1, MAP file.lexpen.example 127.0.0.1\"");
        return environment ??= CoreWebView2Environment.CreateAsync(null, DataDir, options);
    }

    // ---------- Launch ----------

    /// <summary>Opens or activates windows for the paths of one launch.</summary>
    public void Launch(IReadOnlyList<string> paths, bool shift)
    {
        var items = paths.Select(p => (Path: p, Dir: Directory.Exists(p))).ToList();
        var targets = Router.Route(items, windows.Select(w => w.Root).ToList(),
            recent.Count > 0 ? windows.IndexOf(recent[0]) : -1, shift);

        // The primary window first, so it gets the saved bounds and the others cascade from it.
        MainForm? front = null;
        foreach (var t in targets.OrderByDescending(t => t.Primary))
        {
            MainForm w;
            if (t.Window is int i)
            {
                w = windows[i];
                if (t.Files.Count > 0) w.Post(new JsonObject { ["event"] = "open", ["files"] = ToArray(t.Files) });
            }
            else w = Open(new MainForm.Start(t.Folder, t.Files, t.Restore), t.Primary);
            if (ReferenceEquals(t, targets[^1])) front = w;
        }
        BringToFront(front!);
    }

    /// <summary>A new window. <paramref name="at"/>: screen position for a tab dragged out of a window.</summary>
    public MainForm Open(MainForm.Start start, bool makePrimary, Point? at = null)
    {
        var w = new MainForm(this, ++lastId, start);
        if (windows.Count == 0)
        {
            var saved = new Rectangle(Settings.X, Settings.Y, Settings.Width, Settings.Height);
            if (saved.Width > 200 && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(saved)))
                w.Place(saved, Settings.Maximized);
            else if (Settings.Maximized)
                w.Place(null, true);
        }
        else
        {
            // Cascade from the active window, or put the window where the tab was dropped.
            var from = recent.FirstOrDefault() ?? windows[^1];
            var bounds = from.WindowState == FormWindowState.Normal ? from.Bounds : from.RestoreBounds;
            bounds.Offset(SystemInformation.CaptionHeight, SystemInformation.CaptionHeight);
            if (at is Point p) bounds.Location = new Point(p.X - 120, p.Y - 16);
            var area = Screen.FromRectangle(bounds).WorkingArea;
            if (!area.Contains(bounds.Location)) bounds.Location = area.Location;
            w.Place(bounds, false);
        }

        windows.Add(w);
        recent.Add(w);
        w.Activated += (_, _) =>
        {
            recent.Remove(w);
            recent.Insert(0, w);
        };
        w.FormClosed += (_, _) => Closed(w);
        if (makePrimary || primary is null) SetPrimary(w);
        else w.UpdateRole();
        w.Show();
        return w;
    }

    void SetPrimary(MainForm w)
    {
        var old = primary;
        primary = w;
        old?.UpdateRole();
        w.UpdateRole();
    }

    void Closed(MainForm w)
    {
        windows.Remove(w);
        recent.Remove(w);
        foreach (var path in locks.Where(l => l.Value.Contains(w)).Select(l => l.Key).ToList())
            Unlock(path, w);
        // The most recently active window takes over as primary.
        if (primary == w)
        {
            primary = null;
            if (recent.Count > 0) SetPrimary(recent[0]);
        }
        foreach (var other in windows) other.UpdateRole();   // the [n] numbers shift
        if (windows.Count == 0)
        {
            Drafts.Flush();
            ExitThread();
        }
    }

    public static void BringToFront(Form w)
    {
        if (w.WindowState == FormWindowState.Minimized) w.WindowState = FormWindowState.Normal;
        w.Activate();
        SetForegroundWindow(w.Handle);
    }

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hwnd);

    // ---------- Other launches ----------

    /// <summary>Answers later launches (see Program.Send). Runs on the UI thread between messages.</summary>
    public async void Listen(string pipeName)
    {
        while (true)
        {
            try
            {
                await using var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await server.WaitForConnectionAsync();
                using var reader = new StreamReader(server, leaveOpen: true);
                var msg = JsonNode.Parse(await reader.ReadLineAsync() ?? "{}")!;
                await using var writer = new StreamWriter(server, leaveOpen: true) { AutoFlush = true };
                await writer.WriteLineAsync("ok");
                var paths = msg["paths"]?.AsArray().Select(p => p!.GetValue<string>()).ToList() ?? [];
                Launch(paths, msg["shift"]?.GetValue<bool>() == true);
            }
            catch (Exception ex) when (ex is IOException or JsonException) { }
        }
    }

    // ---------- Edit lock ----------

    /// <summary>Registers the window for the file; true when it may edit it (the first one wins).</summary>
    public bool Lock(string path, MainForm w)
    {
        if (!locks.TryGetValue(path, out var list)) locks[path] = list = [];
        if (!list.Contains(w)) list.Add(w);
        UpdateShared(path);
        if (list[0] != w) list[0].Post(new JsonObject { ["event"] = "pushText", ["path"] = path });
        return list[0] == w;
    }

    public void Unlock(string path, MainForm w)
    {
        if (!locks.TryGetValue(path, out var list)) return;
        var wasOwner = list.FirstOrDefault() == w;
        list.Remove(w);
        if (list.Count == 0)
        {
            locks.Remove(path);
            return;
        }
        if (wasOwner) list[0].Post(new JsonObject { ["event"] = "lock", ["path"] = path });
        UpdateShared(path);
    }

    /// <summary>A tab that holds the lock moved to another window: that window takes its place.</summary>
    public void TransferLock(string path, MainForm from, MainForm to)
    {
        if (!locks.TryGetValue(path, out var list) || !list.Contains(from)) return;
        list.Remove(to);
        list[list.IndexOf(from)] = to;
        UpdateShared(path);
    }

    /// <summary>The editing window's text, for the windows that show the file read-only.</summary>
    public void DocText(string path, MainForm from, string text)
    {
        if (!locks.TryGetValue(path, out var list) || list[0] != from) return;
        foreach (var w in list.Skip(1))
            w.Post(new JsonObject { ["event"] = "docText", ["path"] = path, ["text"] = text });
    }

    // Tells the editing window whether anyone follows its text.
    void UpdateShared(string path)
    {
        var list = locks[path];
        list[0].Post(new JsonObject { ["event"] = "shared", ["path"] = path, ["shared"] = list.Count > 1 });
    }

    // ---------- Tabs between windows ----------

    /// <summary><paramref name="target"/>: "next", "new" or a window id.</summary>
    public void MoveTab(MainForm from, JsonNode target, JsonNode tab, int? pane, string? transfer, Point? at)
    {
        MainForm to;
        if (target.GetValueKind() == JsonValueKind.Number)
            to = Find(target.GetValue<int>()) ?? throw new InvalidOperationException("That window is closed.");
        else if (target.GetValue<string>() == "next" && windows.Count > 1)
            to = windows[(windows.IndexOf(from) + 1) % windows.Count];
        else
            to = Open(new MainForm.Start(null, [], false), false, target.GetValue<string>() == "new" ? at : null);

        if (transfer is not null) TransferLock(transfer, from, to);
        to.Post(new JsonObject { ["event"] = "adoptTab", ["tab"] = tab.DeepClone(), ["pane"] = pane });
        BringToFront(to);
    }

    // ---------- Theme, settings, session ----------

    public void SetTheme(string theme, MainForm from)
    {
        if (theme == Settings.Theme) return;
        Settings.Theme = theme;
        foreach (var w in windows)
        {
            w.ApplyTheme();
            if (w != from) w.Post(new JsonObject { ["event"] = "theme", ["theme"] = theme });
        }
        SaveSettings();
    }

    public void SaveBounds(Rectangle bounds, bool maximized)
    {
        (Settings.X, Settings.Y, Settings.Width, Settings.Height) = (bounds.X, bounds.Y, bounds.Width, bounds.Height);
        Settings.Maximized = maximized;
        SaveSettings();
    }

    // ---------- Recent lists (the Open menu), shared by all windows ----------

    /// <summary>files | folders | closed, newest first; favourites in the order they were added. Each with
    /// whether it still exists.</summary>
    public JsonObject Recent()
    {
        JsonArray Entries(List<string> list, bool folders) => new(list.Select(p => (JsonNode?)new JsonObject
            { ["path"] = p, ["exists"] = folders ? Directory.Exists(p) : File.Exists(p) }).ToArray());
        return new JsonObject
        {
            ["files"] = Entries(Settings.RecentFiles, false),
            ["folders"] = Entries(Settings.RecentFolders, true),
            ["closed"] = Entries(Settings.ClosedFiles, false),
            ["favourites"] = Entries(Settings.FavouriteFiles, false),
        };
    }

    /// <summary>Opened: on top of its list (an opened file leaves "recently closed"). Closed: on top of that list.</summary>
    public void RecentAdd(string kind, string path)
    {
        switch (kind)
        {
            case "files":
                Settings.RecentFiles = RecentList.Push(Settings.RecentFiles, path);
                Settings.ClosedFiles = RecentList.Remove(Settings.ClosedFiles, path);
                break;
            case "folders": Settings.RecentFolders = RecentList.Push(Settings.RecentFolders, path); break;
            case "closed": Settings.ClosedFiles = RecentList.Push(Settings.ClosedFiles, path); break;
            default: throw new ArgumentException($"Unknown list '{kind}'.");
        }
        SaveSettings();
    }

    public void RecentRemove(string path)
    {
        Settings.RecentFiles = RecentList.Remove(Settings.RecentFiles, path);
        Settings.RecentFolders = RecentList.Remove(Settings.RecentFolders, path);
        Settings.ClosedFiles = RecentList.Remove(Settings.ClosedFiles, path);
        SaveSettings();
    }

    // Favourite files: kept until removed, in the order they were added.
    public void FavouriteAdd(string path)
    {
        Settings.FavouriteFiles = RecentList.Append(Settings.FavouriteFiles, path);
        SaveSettings();
    }

    public void FavouriteRemove(string path)
    {
        Settings.FavouriteFiles = RecentList.Remove(Settings.FavouriteFiles, path);
        SaveSettings();
    }

    // ---------- Tab colours, shared by all windows ----------
    // The file is read at every window's start; a change to it (saved anywhere) goes to all windows.
    FileSystemWatcher? tabColoursWatcher;
    readonly System.Windows.Forms.Timer tabColoursTimer = new() { Interval = 200 };

    public string? TabColours()
    {
        if (tabColoursWatcher is null)
        {
            Directory.CreateDirectory(DataDir);
            tabColoursWatcher = new FileSystemWatcher(DataDir, TabColourFile.Name)
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
            };
            // Events arrive on another thread: on to the UI thread, then wait for the save to settle.
            void Changed() => windows.FirstOrDefault(w => !w.IsDisposed)?.BeginInvoke(() =>
            {
                tabColoursTimer.Stop();
                tabColoursTimer.Start();
            });
            tabColoursWatcher.Changed += (_, _) => Changed();
            tabColoursWatcher.Created += (_, _) => Changed();
            tabColoursWatcher.Renamed += (_, _) => Changed();
            tabColoursTimer.Tick += (_, _) =>
            {
                tabColoursTimer.Stop();
                var text = TabColourFile.Read(DataDir);
                if (text is null) return;
                foreach (var w in windows) w.Post(new JsonObject { ["event"] = "tabColours", ["text"] = text });
            };
            tabColoursWatcher.EnableRaisingEvents = true;
        }
        return TabColourFile.Read(DataDir);
    }

    void SaveSettings()
    {
        Directory.CreateDirectory(DataDir);
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(Settings));
    }

    static AppSettings LoadSettings()
    {
        try { return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(SettingsPath)) ?? new(); }
        catch { return new(); }
    }

    public void SaveSession(JsonNode data)
    {
        Directory.CreateDirectory(DataDir);
        File.WriteAllText(SessionPath, data.ToJsonString());
    }

    public static JsonNode? LoadSession()
    {
        try { return JsonNode.Parse(File.ReadAllText(SessionPath)); }
        catch { return null; }
    }

    static JsonArray ToArray(IEnumerable<string> items) => new(items.Select(i => (JsonNode?)i).ToArray());
}
