using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace LexPen;

/// <summary>
/// Owns all windows of the one running instance. Later launches send their arguments over a named
/// pipe (see Program); this class routes them to windows (see Router). It also holds what the windows
/// share: settings (and the one settings window), state, the session, drafts, the edit lock per file and
/// the WebView2 environment. The data folder's layout: see DataFolder.
/// </summary>
sealed class AppHost : ApplicationContext
{
    // LEXPEN_DATA points a test run somewhere else, away from the real session and drafts.
    public static readonly string DataDir = System.Environment.GetEnvironmentVariable("LEXPEN_DATA") is { Length: > 0 } dir ? dir
        : Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "LexPen");
    // State lives in State\ (DataFolder); after a failed move a file is used where it still is.
    static string StatePath => Path.Combine(DataFolder.StateDir(DataDir), "state.json");
    static string SessionPath => DataFolder.StatePath(DataDir, "session.json");
    static string FavouritesPath => Path.Combine(DataDir, DataFolder.FavouritesName);
    // Settings that were kept in the page's storage go to settings.json once; this file says it happened.
    static string PageSettingsMovedPath => Path.Combine(DataFolder.StateDir(DataDir), "page-settings-moved");

    /// <summary>What LexPen remembers by itself: window position and size, the recent lists.</summary>
    public sealed class AppState
    {
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public bool Maximized { get; set; }
        public List<string> RecentFiles { get; set; } = [];
        public List<string> RecentFolders { get; set; } = [];
        public List<string> ClosedFiles { get; set; } = [];
    }

    public AppState State { get; } = LoadState();
    List<string> favourites = LoadFavourites();
    public DraftStore Drafts { get; } = new(DataFolder.StatePath(DataDir, "Drafts"));
    public ClipboardStore Clipboards { get; } = new(DataFolder.StatePath(DataDir, "clipboards.json"));
    public BookmarkStore Bookmarks { get; } = new(DataFolder.StatePath(DataDir, "bookmarks.json"));

    // Your settings (SettingsFile): the defaults with your settings.json on top.
    JsonObject settings = SettingsFile.Load(DataDir);
    public JsonObject Settings => settings;
    string? SettingText(string name) => settings["values"]?[name]?.GetValueKind() == JsonValueKind.String ? settings["values"]![name]!.GetValue<string>() : null;
    bool SettingFlag(string name) => settings["values"]?[name]?.GetValueKind() == JsonValueKind.True;

    // ---------- Language packs (LanguagePacks) ----------
    static string UserLanguagesDir => Path.Combine(DataDir, LanguagePacks.FolderName);
    static string ShippedLanguagesDir => ShippedDir(LanguagePacks.FolderName);

    // The shipped language packs and themes: wwwroot next to the exe. A debug build reads (and watches) the project's
    // own wwwroot instead, so an edit there applies at once, without a build.
    static string ShippedDir(string folder) => Path.Combine(ProjectWwwroot ?? Path.Combine(AppContext.BaseDirectory, "wwwroot"), folder);
#if DEBUG
    static readonly string? ProjectWwwroot = FindProjectWwwroot(AppContext.BaseDirectory);
#else
    const string? ProjectWwwroot = null;
#endif

    /// <summary>The wwwroot of the project the exe was built from: up from `from` to the folder with LexPen.csproj.</summary>
    internal static string? FindProjectWwwroot(string from)
    {
        for (var dir = new DirectoryInfo(from); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "LexPen.csproj"))) return Path.Combine(dir.FullName, "wwwroot");
        return null;
    }

    // A folder to watch: a change anywhere in it runs `changed` (on the UI thread, by the caller's timer). Null when
    // the folder is not there.
    FileSystemWatcher? Watch(string dir, string filter, bool subfolders, Action changed)
    {
        if (!Directory.Exists(dir)) return null;
        var watcher = new FileSystemWatcher(dir, filter)
        {
            IncludeSubdirectories = subfolders,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size,
        };
        void Changed() => windows.FirstOrDefault(w => !w.IsDisposed)?.BeginInvoke(changed);
        watcher.Changed += (_, _) => Changed();
        watcher.Created += (_, _) => Changed();
        watcher.Deleted += (_, _) => Changed();
        watcher.Renamed += (_, _) => Changed();
        watcher.EnableRaisingEvents = true;
        return watcher;
    }
    JsonObject languages = new();
    /// <summary>Every pack as JSON for the pages, the extensions, problems (LanguagePacks.Load).</summary>
    public JsonObject Languages => languages;

    // A language you chose for a file (the selector in the bottom bar): kept by path, State\file-languages.json.
    static string FileLanguagesPath => Path.Combine(DataFolder.StateDir(DataDir), "file-languages.json");
    Dictionary<string, string> fileLanguages = LoadFileLanguages();

    static Dictionary<string, string> LoadFileLanguages()
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(FileLanguagesPath)) is { } d
            ? new Dictionary<string, string>(d, StringComparer.OrdinalIgnoreCase) : new(StringComparer.OrdinalIgnoreCase); }
        catch { return new(StringComparer.OrdinalIgnoreCase); }
    }

    public string? FileLanguage(string path) => fileLanguages.GetValueOrDefault(path);

    /// <summary>Null: the language follows the extension again.</summary>
    public void SetFileLanguage(string path, string? language)
    {
        if (language is null) fileLanguages.Remove(path); else fileLanguages[path] = language;
        Directory.CreateDirectory(Path.GetDirectoryName(FileLanguagesPath)!);
        File.WriteAllText(FileLanguagesPath, JsonSerializer.Serialize(fileLanguages));
    }

    /// <summary>File dialog filters from the packs: markdown first, then each language, then all files.</summary>
    public string FileFilter()
    {
        var parts = new List<string>();
        foreach (var (_, node) in languages["packs"]?.AsObject() ?? [])
        {
            var exts = node?["extensions"]?.AsArray().Select(e => "*" + e).ToList() ?? [];
            if (exts.Count > 0) parts.Add($"{node!["name"]}|{string.Join(";", exts)}");
        }
        var markdown = parts.FindIndex(p => p.StartsWith("Markdown|"));
        if (markdown > 0) { var m = parts[markdown]; parts.RemoveAt(markdown); parts.Insert(0, m); }
        parts.Add("All files|*.*");
        return string.Join("|", parts);
    }

    void LoadLanguages() => languages = LanguagePacks.Load(ShippedLanguagesDir, UserLanguagesDir);

    // Your languages folder changed (a pack edited, added or removed), or in a debug build the project's: read the
    // packs again, every window follows.
    readonly List<FileSystemWatcher> languagesWatchers = [];
    readonly System.Windows.Forms.Timer languagesTimer = new() { Interval = 300 };

    public void WatchLanguages()
    {
        LoadLanguages();
        try { Directory.CreateDirectory(UserLanguagesDir); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        void Changed()
        {
            languagesTimer.Stop();
            languagesTimer.Start();
        }
        foreach (var dir in ProjectWwwroot is null ? [UserLanguagesDir] : new[] { UserLanguagesDir, ShippedLanguagesDir })
            if (Watch(dir, "*", true, Changed) is { } watcher) languagesWatchers.Add(watcher);
        languagesTimer.Tick += (_, _) =>
        {
            languagesTimer.Stop();
            LoadLanguages();
            foreach (var w in windows) w.Post(new JsonObject { ["event"] = "languages", ["languages"] = languages.DeepClone() });
            settingsWindow?.Post(new JsonObject { ["event"] = "languages", ["languages"] = languages.DeepClone() });
        };
    }

    // ---------- Themes (ThemeFile) and light / dark mode ----------
    static string UserThemesDir => Path.Combine(DataDir, ThemeFile.FolderName);
    static string ShippedThemesDir => ShippedDir(ThemeFile.FolderName);
    List<ThemeFile.Theme> themes = [];
    List<string> themeProblems = [];
    Dictionary<string, string> fallbackLight = [], fallbackDark = [];   // app.css: a colour no theme in the chain sets
    string windowsMode = WindowsMode();
    string? modeOverride;   // Day / night while following Windows: until Windows changes mode

    /// <summary>light or dark: as Windows is (Follow Windows), else the setting "theme".</summary>
    public string Mode => SettingFlag("followWindows") ? modeOverride ?? windowsMode : SettingText("theme") == "dark" ? "dark" : "light";

    ThemeFile.Theme ThemeFor(string? id, string mode) =>
        themes.FirstOrDefault(t => t.Id == id) ?? themes.FirstOrDefault(t => t.Id == mode)
        ?? new ThemeFile.Theme(mode, mode, null, new Dictionary<string, string>(), false, [mode]);

    ThemeFile.Theme AppTheme => ThemeFor(SettingText(Mode == "dark" ? "themeDark" : "themeLight"), Mode);

    /// <summary>Every colour of the app's theme, for the current mode (the mode's fallback for what it lacks).</summary>
    public Dictionary<string, string> AppColours() => ThemeFile.Complete(AppTheme, Mode == "dark" ? fallbackDark : fallbackLight);

    /// <summary>The app's theme background: the window before the page draws.</summary>
    public Color AppBackground() =>
        ThemeFile.Rgb(AppColours().GetValueOrDefault("--bg") ?? "") is var (r, g, b) ? Color.FromArgb(r, g, b)
        : Mode == "dark" ? Color.FromArgb(0x1e, 0x1f, 0x22) : Color.White;

    /// <summary>A script that runs before the page's own scripts and its first paint: the mode and the app's
    /// theme colours on the page, so it never shows other colours first.</summary>
    public string FirstPaintScript()
    {
        var vars = new JsonObject(AppColours().Select(v => KeyValuePair.Create(v.Key, (JsonNode?)v.Value)));
        var mode = JsonValue.Create(Mode).ToJsonString();
        // It runs before <html> exists: an observer sets them on <html> as it appears (a microtask: before the
        // parser runs a page script, and before any paint).
        return $"(() => {{ const set = r => {{ r.dataset.theme = r.dataset.mode = {mode}; " +
            $"for (const [n, v] of Object.entries({vars.ToJsonString()})) r.style.setProperty(n, v); }}; " +
            "if (document.documentElement) return set(document.documentElement); " +
            "new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); set(document.documentElement); } })" +
            ".observe(document, { childList: true }); })();";
    }

    /// <summary>What every window shows: the app's theme, the preview's own one (or null: the app's), the mode,
    /// the list of themes (for the settings) and problems in theme files. A theme's vars are complete (with the
    /// mode's fallback); chain is its id and its bases, nearest first.</summary>
    public JsonObject Look()
    {
        var fallback = Mode == "dark" ? fallbackDark : fallbackLight;
        JsonObject Json(ThemeFile.Theme t) => new()
        {
            ["id"] = t.Id, ["name"] = t.Name, ["base"] = t.BaseId,
            ["chain"] = new JsonArray(t.Chain.Select(c => (JsonNode?)c).ToArray()),
            ["vars"] = new JsonObject(ThemeFile.Complete(t, fallback).Select(v => KeyValuePair.Create(v.Key, (JsonNode?)v.Value))),
        };
        var app = AppTheme;
        var previewId = SettingText(Mode == "dark" ? "previewThemeDark" : "previewThemeLight");
        var problems = new JsonArray(themeProblems.Select(p => (JsonNode?)p).ToArray());
        foreach (var name in new[] { "themeLight", "themeDark", "previewThemeLight", "previewThemeDark" })
            if (SettingText(name) is { Length: > 0 } id && themes.All(t => t.Id != id))
                problems.Add($"settings.json: \"{name}\": there is no theme \"{id}\".");
        return new JsonObject
        {
            ["mode"] = Mode,
            ["app"] = Json(app),
            ["preview"] = string.IsNullOrEmpty(previewId) || themes.All(t => t.Id != previewId) ? null : Json(ThemeFor(previewId, Mode)),
            ["themes"] = new JsonArray(themes.Select(t => (JsonNode?)new JsonObject
                { ["id"] = t.Id, ["name"] = t.Name, ["base"] = t.BaseId, ["mine"] = t.Mine }).ToArray()),
            ["problems"] = problems,
        };
    }

    void LoadThemes()
    {
        var problems = new List<string>();
        var css = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "wwwroot", "app.css"));
        (fallbackLight, fallbackDark) = (ThemeFile.Fallback(css, "light"), ThemeFile.Fallback(css, "dark"));
        themes = ThemeFile.Load(ShippedThemesDir, UserThemesDir, ThemeFile.Names(css), problems);
        themeProblems = problems;
    }

    /// <summary>The look changed (a setting, a theme file, the Windows mode, Day / night): every window follows.</summary>
    void SendLook()
    {
        var look = Look();
        foreach (var w in windows)
        {
            w.ApplyTheme();
            w.Post(new JsonObject { ["event"] = "look", ["look"] = look.DeepClone() });
        }
        settingsWindow?.ApplyTheme();
        settingsWindow?.Post(new JsonObject { ["event"] = "look", ["look"] = look.DeepClone() });
    }

    /// <summary>Day / night while following Windows: the other mode, until Windows changes mode.</summary>
    public void SwitchMode()
    {
        modeOverride = Mode == "dark" ? "light" : "dark";
        SendLook();
    }

    static string WindowsMode()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
        return key?.GetValue("AppsUseLightTheme") is int light && light == 0 ? "dark" : "light";
    }

    // Windows switched light / dark (or another colour setting changed): follow it, a Day / night switch ends.
    void OnUserPreferenceChanged(object? sender, Microsoft.Win32.UserPreferenceChangedEventArgs e)
    {
        var now = WindowsMode();
        if (now == windowsMode) return;
        windowsMode = now;
        modeOverride = null;
        if (SettingFlag("followWindows")) SendLook();
    }

    // Your themes folder changed (a theme edited, added or removed), or in a debug build the project's: read the
    // themes again.
    readonly List<FileSystemWatcher> themesWatchers = [];
    readonly System.Windows.Forms.Timer themesTimer = new() { Interval = 200 };

    public void WatchThemes()
    {
        LoadThemes();
        Microsoft.Win32.SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged;
        try { Directory.CreateDirectory(UserThemesDir); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        void Changed()
        {
            themesTimer.Stop();
            themesTimer.Start();
        }
        foreach (var dir in ProjectWwwroot is null ? [UserThemesDir] : new[] { UserThemesDir, ShippedThemesDir })
            if (Watch(dir, "*.json", false, Changed) is { } watcher) themesWatchers.Add(watcher);
        themesTimer.Tick += (_, _) =>
        {
            themesTimer.Stop();
            LoadThemes();
            SendLook();
        };
    }
    /// <summary>The rows of the settings window, as a main window's page describes them (actions.js).</summary>
    public JsonNode? SettingDefs { get; set; }
    SettingsForm? settingsWindow;

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
        // The browser's data folder (EBWebView) goes in State\, unless it is still at the top (not moved yet).
        var parent = Path.GetDirectoryName(DataFolder.StatePath(DataDir, "EBWebView"))!;
        return environment ??= CoreWebView2Environment.CreateAsync(null, parent, options);
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
            var saved = new Rectangle(State.X, State.Y, State.Width, State.Height);
            if (saved.Width > 200 && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(saved)))
                w.Place(saved, State.Maximized);
            else if (State.Maximized)
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
            settingsWindow?.Close();
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

    /// <summary><paramref name="target"/>: "next", "new", "primary" or a window id.</summary>
    public void MoveTab(MainForm from, JsonNode target, JsonNode tab, int? pane, string? transfer, Point? at)
    {
        MainForm to;
        if (target.GetValueKind() == JsonValueKind.Number)
            to = Find(target.GetValue<int>()) ?? throw new InvalidOperationException("That window is closed.");
        else if (target.GetValue<string>() == "primary" && primary is not null && primary != from)
            to = primary;
        else if (target.GetValue<string>() == "next" && windows.Count > 1)
            to = windows[(windows.IndexOf(from) + 1) % windows.Count];
        else
            to = Open(new MainForm.Start(null, [], false), false, target.GetValue<string>() == "new" ? at : null);

        if (transfer is not null) TransferLock(transfer, from, to);
        to.Post(new JsonObject { ["event"] = "adoptTab", ["tab"] = tab.DeepClone(), ["pane"] = pane });
        BringToFront(to);
    }

    // ---------- Theme, settings, session ----------

    // ---------- Settings, shared by all windows ----------

    /// <summary>One setting changed (settings window, a menu, a key): written to your settings.json, then every
    /// window and the settings window get the new set at once.</summary>
    public void SetSetting(string name, JsonNode? value)
    {
        SettingsFile.Write(DataDir, name, value);
        ReloadSettings();
    }

    // Also after a hand edit of the file (see WatchSettings).
    void ReloadSettings()
    {
        var before = Look().ToJsonString();
        settings = SettingsFile.Load(DataDir);
        foreach (var w in windows) w.Post(new JsonObject { ["event"] = "settings", ["settings"] = settings.DeepClone() });
        settingsWindow?.Post(new JsonObject { ["event"] = "settings", ["settings"] = settings.DeepClone() });
        if (Look().ToJsonString() != before) SendLook();
    }

    /// <summary>A main window described the settings' rows again (another list of themes): the settings window follows.</summary>
    public void DefsChanged() => settingsWindow?.Post(new JsonObject { ["event"] = "defs", ["defs"] = SettingDefs?.DeepClone() });

    /// <summary>The settings a page kept in its own storage before settings.json existed, moved over once.</summary>
    public bool PageSettingsMoved => File.Exists(PageSettingsMovedPath);

    public void ImportPageSettings(JsonObject values)
    {
        if (PageSettingsMoved) return;
        foreach (var (name, value) in values)
            try { SettingsFile.Write(DataDir, name, value?.DeepClone()); }
            catch (ArgumentException) { }   // not a setting (any more): skipped
        File.WriteAllText(PageSettingsMovedPath, "");
        ReloadSettings();
    }

    // Your settings.json changed on disk (a hand edit, another LexPen copy): read again, every window follows.
    FileSystemWatcher? settingsWatcher;
    readonly System.Windows.Forms.Timer settingsTimer = new() { Interval = 200 };
    string? settingsText;

    public void WatchSettings()
    {
        if (settingsWatcher is not null) return;
        Directory.CreateDirectory(DataDir);
        settingsText = ReadOrNull(Path.Combine(DataDir, SettingsFile.Name));
        settingsWatcher = new FileSystemWatcher(DataDir, SettingsFile.Name)
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
        };
        void Changed() => windows.FirstOrDefault(w => !w.IsDisposed)?.BeginInvoke(() =>
        {
            settingsTimer.Stop();
            settingsTimer.Start();
        });
        settingsWatcher.Changed += (_, _) => Changed();
        settingsWatcher.Created += (_, _) => Changed();
        settingsWatcher.Deleted += (_, _) => Changed();
        settingsWatcher.Renamed += (_, _) => Changed();
        settingsTimer.Tick += (_, _) =>
        {
            settingsTimer.Stop();
            var text = ReadOrNull(Path.Combine(DataDir, SettingsFile.Name));
            if (text == settingsText) return;
            settingsText = text;
            ReloadSettings();
        };
        settingsWatcher.EnableRaisingEvents = true;
    }

    static string? ReadOrNull(string path)
    {
        try { return File.Exists(path) ? File.ReadAllText(path) : null; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    /// <summary>Options > Settings: the one settings window, owned by the window it was asked from.</summary>
    public void OpenSettings(MainForm from)
    {
        if (settingsWindow is { IsDisposed: false })
        {
            BringToFront(settingsWindow);
            return;
        }
        settingsWindow = new SettingsForm(this, from);
        settingsWindow.FormClosed += (_, _) => settingsWindow = null;
        settingsWindow.Show(from);
    }

    /// <summary>From the settings window: a window of LexPen to work in (the most recently active one).</summary>
    public MainForm? LastActive => recent.FirstOrDefault(w => !w.IsDisposed);

    public void SaveBounds(Rectangle bounds, bool maximized)
    {
        (State.X, State.Y, State.Width, State.Height) = (bounds.X, bounds.Y, bounds.Width, bounds.Height);
        State.Maximized = maximized;
        SaveState();
    }

    /// <summary>A clipboard was chosen or filled: every window shows it (bottom bar, clipboard list).</summary>
    public void ClipboardsChanged()
    {
        var state = Clipboards.State();
        foreach (var w in windows) w.Post(new JsonObject { ["event"] = "clipboards", ["state"] = state.DeepClone() });
    }

    // ---------- Recent lists (the File menu), shared by all windows ----------

    /// <summary>files | folders | closed, newest first; favourites in the order they were added. Each with
    /// whether it still exists.</summary>
    public JsonObject Recent()
    {
        JsonArray Entries(List<string> list, bool folders) => new(list.Select(p => (JsonNode?)new JsonObject
            { ["path"] = p, ["exists"] = folders ? Directory.Exists(p) : File.Exists(p) }).ToArray());
        return new JsonObject
        {
            ["files"] = Entries(State.RecentFiles, false),
            ["folders"] = Entries(State.RecentFolders, true),
            ["closed"] = Entries(State.ClosedFiles, false),
            ["favourites"] = Entries(favourites, false),
        };
    }

    /// <summary>Opened: on top of its list (an opened file leaves "recently closed"). Closed: on top of that list.</summary>
    public void RecentAdd(string kind, string path)
    {
        switch (kind)
        {
            case "files":
                State.RecentFiles = RecentList.Push(State.RecentFiles, path);
                State.ClosedFiles = RecentList.Remove(State.ClosedFiles, path);
                break;
            case "folders": State.RecentFolders = RecentList.Push(State.RecentFolders, path); break;
            case "closed": State.ClosedFiles = RecentList.Push(State.ClosedFiles, path); break;
            default: throw new ArgumentException($"Unknown list '{kind}'.");
        }
        SaveState();
    }

    public void RecentRemove(string path)
    {
        State.RecentFiles = RecentList.Remove(State.RecentFiles, path);
        State.RecentFolders = RecentList.Remove(State.RecentFolders, path);
        State.ClosedFiles = RecentList.Remove(State.ClosedFiles, path);
        SaveState();
    }

    // Favourite files: kept until removed, in the order they were added.
    public void FavouriteAdd(string path)
    {
        favourites = RecentList.Append(favourites, path);
        SaveFavourites();
    }

    public void FavouriteRemove(string path)
    {
        favourites = RecentList.Remove(favourites, path);
        SaveFavourites();
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

    void SaveState()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
        File.WriteAllText(StatePath, JsonSerializer.Serialize(State));
    }

    static AppState LoadState()
    {
        try { return JsonSerializer.Deserialize<AppState>(File.ReadAllText(StatePath)) ?? new(); }
        catch { return new(); }
    }

    // Favourite files: a choice you make, so a file next to settings.json (a list of paths).
    void SaveFavourites()
    {
        Directory.CreateDirectory(DataDir);
        File.WriteAllText(FavouritesPath, JsonSerializer.Serialize(favourites));
    }

    static List<string> LoadFavourites()
    {
        try { return JsonSerializer.Deserialize<List<string>>(File.ReadAllText(FavouritesPath)) ?? []; }
        catch { return []; }
    }

    public void SaveSession(JsonNode data)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(SessionPath)!);
        File.WriteAllText(SessionPath, data.ToJsonString());
    }

    public static JsonNode? LoadSession()
    {
        try { return JsonNode.Parse(File.ReadAllText(SessionPath)); }
        catch { return null; }
    }

    static JsonArray ToArray(IEnumerable<string> items) => new(items.Select(i => (JsonNode?)i).ToArray());
}
