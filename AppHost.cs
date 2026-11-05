using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace LexPen;

/// <summary>
/// Owns all windows of the one running instance. Later launches send their arguments over a named
/// pipe (see Program); this class routes them to windows (see Router). It also holds what the windows
/// share: settings (and a settings window per main window), state, the session, drafts, the edit lock per file and
/// the WebView2 environment. The data folder's layout: see DataFolder.
/// </summary>
/// <summary>A tool window (character picker, highlights, Manage projects): its page gets messages, its caption the theme.</summary>
interface IWebPost
{
    void Post(JsonObject message);
    void ApplyTheme();
}

sealed class AppHost : ApplicationContext
{
    // LEXPEN_DATA points a test run somewhere else, away from the real session and drafts.
    public static readonly string DataDir = System.Environment.GetEnvironmentVariable("LEXPEN_DATA") is { Length: > 0 } dir ? dir
        : Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "LexPen");
    // State lives in State\ (DataFolder); after a failed move a file is used where it still is.
    static string StatePath => Path.Combine(DataFolder.StateDir(DataDir), "state.json");
    static string SessionPath => DataFolder.StatePath(DataDir, "session.json");
    static string FavouritesPath => Path.Combine(DataDir, DataFolder.FavouritesName);
    static string FavouriteFoldersPath => Path.Combine(DataDir, DataFolder.FavouriteFoldersName);
    // Settings that were kept in the page's storage go to settings.json once; this file says it happened.
    static string PageSettingsMovedPath => Path.Combine(DataFolder.StateDir(DataDir), "page-settings-moved");
    // The layout values the page kept in its storage go to defaultLayout in settings.json once; this file says it happened.
    static string LayoutMovedPath => Path.Combine(DataFolder.StateDir(DataDir), "layout-moved");

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
        public List<FindEntry> FindHistory { get; set; } = [];
        public List<string> ReplaceHistory { get; set; } = [];
        public int[]? CharPicker { get; set; }   // the character picker's place: x, y, width, height
        public int[]? HighlightsWindow { get; set; }   // the highlights window's place: x, y, width, height
        public int[]? ProjectsWindow { get; set; }   // the Manage projects window's place: x, y, width, height
        public int[]? ThemeSetsWindow { get; set; }  // the Manage theme sets window's place: x, y, width, height
        public Dictionary<string, int[]>? PaneWindows { get; set; }   // a floating pane's place, per kind ("outline"): x, y, width, height
        public Dictionary<string, ScreenZoom> Screens { get; set; } = [];   // the zoom per monitor, by its key (Monitors)
    }

    public AppState State { get; } = LoadState();
    List<string> favourites = LoadFavourites(FavouritesPath);
    List<string> favouriteFolders = LoadFavourites(FavouriteFoldersPath);
    public DraftStore Drafts { get; } = new(DataFolder.StatePath(DataDir, "Drafts"));
    public ClipboardStore Clipboards { get; } = new(DataFolder.StatePath(DataDir, "clipboards.json"));
    public BookmarkStore Bookmarks { get; } = new(DataFolder.StatePath(DataDir, "bookmarks.json"));
    public RulerStore Rulers { get; } = new(DataFolder.StatePath(DataDir, "file-rulers.json"));
    public ColumnStore Columns { get; } = new(DataFolder.StatePath(DataDir, "file-columns.json"));
    public HighlightStore Highlights { get; } = new(DataFolder.StatePath(DataDir, "highlights.json"));

    // Your settings (SettingsFile): the defaults with your settings.json on top.
    JsonObject settings = SettingsFile.Load(DataDir);
    public JsonObject Settings => settings;

    // ---------- Theme sets (ThemeSetFile, docs/plans/executed/PLAN-theme-sets.md) ----------
    // A window shows its project's set, else its desktop's default set, else the app's; "Default" is settings.json
    // itself. Every window gets its own settings and look from that: settings.json with the set's values over them.
    static string ThemeSetsPath => Path.Combine(DataDir, ThemeSetFile.FileName);
    ThemeSetFile.Data themeSets = ThemeSetFile.Load(ThemeSetsPath);

    string? DesktopOf(MainForm? w) => w is null ? null : projects.WindowOf(w.Key)?.Desktop;

    /// <summary>The set a window shows (ThemeSetFile.Resolve); no window: the app's.</summary>
    public string SetOf(MainForm? w) =>
        ThemeSetFile.Resolve(themeSets, w is null ? null : projects.ProjectOf(w.Key)?.ThemeSet, DesktopOf(w));

    // The settings' values as a window sees them (not to be changed: for "Default" they are settings.json's own).
    JsonObject Values(MainForm? w)
    {
        var values = settings["values"] as JsonObject ?? [];
        return SetOf(w) is var set && set != ThemeSetFile.Default ? ThemeSetFile.Apply(values, themeSets.Get(set)) : values;
    }

    /// <summary>The settings a window's page gets (as SettingsFile.Load gives them), with its set's values over them and
    /// what the bars show about its set.</summary>
    public JsonObject SettingsFor(MainForm? w)
    {
        var s = (JsonObject)settings.DeepClone();
        s["values"] = Values(w).DeepClone();
        s["themeSet"] = SetInfo(w);
        return s;
    }

    /// <summary>A window's set for the bars: its name, where it comes from (project, desktop, app), the project's own,
    /// and every set ("Default" first).</summary>
    public JsonObject SetInfo(MainForm? w)
    {
        var own = w is null ? null : themeSets.Known(projects.ProjectOf(w.Key)?.ThemeSet);
        return new JsonObject
        {
            ["name"] = SetOf(w),
            ["source"] = ThemeSetFile.Source(themeSets, own, DesktopOf(w)),
            ["own"] = own,
            ["sets"] = new JsonArray(themeSets.Sets.Select(s => (JsonNode?)s.Name).Prepend(ThemeSetFile.Default).ToArray()),
        };
    }

    // What a window, a settings window or a tool window was sent last, per kind: sent again only when it changed.
    readonly System.Runtime.CompilerServices.ConditionalWeakTable<object, Dictionary<string, string>> sent = [];

    bool Changed(object f, string kind, JsonNode value)
    {
        var last = sent.GetOrCreateValue(f);
        var text = value.ToJsonString();
        if (last.GetValueOrDefault(kind) == text) return false;
        last[kind] = text;
        return true;
    }

    /// <summary>The settings to every window, each its own (its set's values), when they changed for it.</summary>
    void SendSettings()
    {
        foreach (var w in windows)
            if (SettingsFor(w) is var s && Changed(w, "settings", s)) w.Post(new JsonObject { ["event"] = "settings", ["settings"] = s });
        foreach (var (owner, s) in SettingsPages())
            if (SettingsFor(owner) is var o && Changed(s, "settings", o)) s.Post(new JsonObject { ["event"] = "settings", ["settings"] = o });
        // The tool windows follow the window last worked in; a tool docked in a window follows that window.
        var values = Values(LastActive);
        foreach (var tool in new IWebPost?[] { charPicker, highlightsWindow, projectsWindow, themeSetsWindow })
            if (tool is Form f && Changed(f, "settings", values)) tool.Post(new JsonObject { ["event"] = "settings", ["settings"] = values.DeepClone() });
        foreach (var frame in toolFrames.Where(f => f.Kind != "settings"))   // a docked Settings: above, as its window
            if (Values(frame.Window) is var own && Changed(frame, "settings", own)) frame.Post(new JsonObject { ["event"] = "settings", ["settings"] = own.DeepClone() });
    }

    /// <summary>A window's project got another set, its desktop another default, or a set changed: every window that
    /// shows something else now follows.</summary>
    void Restyle()
    {
        SendSettings();
        SendLook();
        foreach (var (owner, s) in SettingsPages()) s.Post(new JsonObject { ["event"] = "themeSet", ["themeSet"] = SetInfo(owner) });
        themeSetsWindow?.Post(new JsonObject { ["event"] = "list", ["list"] = ThemeSetList() });
        foreach (var frame in toolFrames.Where(f => f.Kind == "themesets")) frame.Post(new JsonObject { ["event"] = "list", ["list"] = ThemeSetList() });
    }

    /// <summary>Save as default (plan 31's, with the theme set: docs/plans/executed/PLAN-theme-sets.md, 3.11). When the window
    /// shows a set that is not already the one new projects get here, asks what to save: the layout and the set (as
    /// the app's default, or this desktop's), the layout only, or the set only. The set part is done here; the answer
    /// tells the page whether to save the layout, and what the set's default was (for Undo). Null: cancelled.</summary>
    public JsonObject? SaveAsDefault(IWin32Window owner, MainForm w)
    {
        var shown = SetOf(w);
        var desktop = DesktopOf(w);
        var forNew = ThemeSetFile.Resolve(themeSets, null, desktop);
        if (shown == forNew) return new JsonObject { ["layout"] = true };   // the set is new projects' already: only the layout
        var desktopHas = desktop is not null && themeSets.Desktops.ContainsKey(desktop);
        var bothApp = new TaskDialogRadioButton($"The layout of this window and the theme set \"{shown}\" as the app's default");
        var bothDesktop = new TaskDialogRadioButton($"The layout of this window and the theme set \"{shown}\" as this desktop's default");
        var layoutOnly = new TaskDialogRadioButton("Only the layout of this window");
        var setOnly = new TaskDialogRadioButton($"Only the theme set \"{shown}\", as the app's default");
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = "Save as default for new projects",
            Text = $"New projects get the default layout, and the default theme set (now \"{forNew}\" here)." +
                (desktopHas ? $"\n\nThis desktop has a default set of its own, \"{themeSets.Desktops[desktop!]}\": it wins over the app's on this desktop." : ""),
            Icon = TaskDialogIcon.Information,
            Buttons = { TaskDialogButton.OK, TaskDialogButton.Cancel },
            AllowCancel = true,
        };
        page.RadioButtons.Add(bothApp);
        if (desktop is not null) page.RadioButtons.Add(bothDesktop);
        page.RadioButtons.Add(layoutOnly);
        page.RadioButtons.Add(setOnly);
        (desktopHas ? bothDesktop : bothApp).Checked = true;
        if (Program.ShowTask(owner, page) != TaskDialogButton.OK) return null;
        var result = new JsonObject { ["layout"] = !setOnly.Checked };
        if (layoutOnly.Checked) return result;
        var onDesktop = bothDesktop.Checked;
        result["set"] = new JsonObject
        {
            ["name"] = shown,
            ["for"] = onDesktop ? "desktop" : "app",
            ["desktop"] = onDesktop ? desktop : null,
            ["before"] = onDesktop ? themeSets.Desktops.GetValueOrDefault(desktop!) : themeSets.App,
        };
        if (onDesktop) themeSets.Desktops[desktop!] = shown;
        else themeSets.App = shown;
        SaveThemeSets();
        Restyle();
        return result;
    }

    // ---------- Manage theme sets (ThemeSetsForm; docs/plans/executed/PLAN-theme-sets.md, 3.10) ----------

    /// <summary>Manage theme sets as it was last (docs/plans/24-PLAN-docking.md 3.7a): the window's page decides (its
    /// window of its own, or docked); the window comes to the front.</summary>
    public void OpenThemeSets(MainForm from)
    {
        from.Post(new JsonObject { ["event"] = "openToolPane", ["kind"] = "themesets", ["open"] = "openThemeSetsWindow" });
        BringToFront(from);
    }

    public void CloseThemeSetsWindow() => themeSetsWindow?.Close();

    /// <summary>The Manage theme sets window: one for the app; opened again, brought to the front.</summary>
    public void OpenThemeSetsWindow(MainForm from)
    {
        if (themeSetsWindow is { IsDisposed: false }) { BringToFront(themeSetsWindow); return; }
        themeSetsWindow = new ThemeSetsForm(this, from);
        themeSetsWindow.FormClosed += (_, _) => themeSetsWindow = null;
        themeSetsWindow.Show(from);
    }

    public void SaveThemeSetsWindow(int[] bounds)
    {
        State.ThemeSetsWindow = bounds;
        SaveState();
    }

    // A set's look in the current mode: the app's, the editor's and the preview's background (its own theme, else the app's).
    JsonObject Swatches(JsonObject values)
    {
        var fallback = Mode == "dark" ? fallbackDark : fallbackLight;
        var dark = Mode == "dark";
        string Bg(string? id) => ThemeFile.Complete(ThemeFor(id, Mode), fallback).GetValueOrDefault("--bg") ?? "";
        var app = ThemeId(dark ? "themeDark" : "themeLight", values);
        string Own(string setting) => ThemeId(setting, values) is { Length: > 0 } id && themes.Any(t => t.Id == id) ? Bg(id) : Bg(app);
        return new JsonObject
        {
            ["app"] = Bg(app),
            ["editor"] = Own(dark ? "editorThemeDark" : "editorThemeLight"),
            ["preview"] = Own(dark ? "previewThemeDark" : "previewThemeLight"),
        };
    }

    // The desktops for the Manage window: the ones Windows has (in its order, with their names), then the ones a set
    // names or a window was on that Windows no longer has (gone: another PC, or removed).
    List<(string Id, string Name, bool Gone)> Desktops()
    {
        var known = VirtualDesktop.List();
        var list = known.Select((d, i) => (d.Id, d.Name ?? $"Desktop {i + 1}", false)).ToList();
        var extra = themeSets.Desktops.Keys.Concat(projects.Projects.SelectMany(p => p.Windows).Select(w => w.Desktop).OfType<string>())
            .Distinct(StringComparer.OrdinalIgnoreCase).Where(id => list.All(d => !string.Equals(d.Id, id, StringComparison.OrdinalIgnoreCase)));
        foreach (var id in extra)
            if (themeSets.Desktops.ContainsKey(id) || known.Count == 0) list.Add((id, known.Count == 0 ? $"Desktop {list.Count + 1}" : "A desktop that is gone", known.Count > 0));
        return list;
    }

    /// <summary>What the Manage theme sets window shows: the sets with their look and what uses them, the desktops
    /// with their default set, and the window last worked in (its project, desktop and set).</summary>
    public JsonArray ThemeSetListSets()
    {
        var desktops = Desktops();
        var values = settings["values"] as JsonObject ?? [];
        return new JsonArray(themeSets.Sets.Select(s => s.Name).Prepend(ThemeSetFile.Default).Select(name => (JsonNode?)new JsonObject
        {
            ["name"] = name,
            ["default"] = name == ThemeSetFile.Default,
            ["swatches"] = Swatches(ThemeSetFile.Apply(values, themeSets.Get(name))),
            ["projects"] = new JsonArray(projects.Projects.Where(p => themeSets.Known(p.ThemeSet) == name).Select(p => (JsonNode?)ProjectStore.Display(p)).ToArray()),
            ["desktops"] = new JsonArray(desktops.Where(d => themeSets.Desktops.TryGetValue(d.Id, out var set) && set == name).Select(d => (JsonNode?)d.Name).ToArray()),
            ["app"] = themeSets.App == name,
        }).ToArray());
    }

    public JsonObject ThemeSetList()
    {
        var w = LastActive;
        var desktop = DesktopOf(w);
        var desktops = Desktops();
        return new JsonObject
        {
            ["sets"] = ThemeSetListSets(),
            ["desktops"] = new JsonArray(desktops.Select(d => (JsonNode?)new JsonObject
            {
                ["id"] = d.Id, ["name"] = d.Name, ["gone"] = d.Gone, ["here"] = string.Equals(d.Id, desktop, StringComparison.OrdinalIgnoreCase),
                ["set"] = themeSets.Desktops.GetValueOrDefault(d.Id),
            }).ToArray()),
            ["window"] = w is null ? null : new JsonObject
            {
                ["project"] = projects.ProjectOf(w.Key) is { } p ? ProjectStore.Display(p) : "",
                ["desktop"] = desktop is null ? null : desktops.FirstOrDefault(d => string.Equals(d.Id, desktop, StringComparison.OrdinalIgnoreCase)).Name,
                ["info"] = SetInfo(w),
            },
        };
    }

    /// <summary>A command of the Manage theme sets window: new, duplicate, rename, delete, use (for the project of the
    /// window last worked in, its desktop, a desktop, the app), removeDesktop, edit. Names are checked here; a
    /// refusal comes back as an error the page shows.</summary>
    public JsonNode? ThemeSetCommand(IWin32Window owner, JsonNode msg)
    {
        string? Arg(string name) => msg[name]?.GetValue<string>();
        var w = LastActive;
        string Free(string? name, string? self = null) =>
            name is not null && ThemeSetFile.Free(themeSets, name, self) ? name.Trim()
            : throw new InvalidOperationException(string.IsNullOrWhiteSpace(name) ? "A theme set needs a name." : $"\"{name.Trim()}\" is taken: choose another name.");
        switch (Arg("kind"))
        {
            case "new":
                themeSets.Sets.Add(ThemeSetFile.Make(Free(Arg("name")), Values(w)));
                break;
            case "duplicate":
                var source = Arg("from") ?? ThemeSetFile.Default;
                themeSets.Sets.Add(ThemeSetFile.Make(Free(Arg("name")), ThemeSetFile.Apply(settings["values"] as JsonObject ?? [], themeSets.Get(source))));
                break;
            case "rename":
                var from = themeSets.Get(Arg("from")) ?? throw new InvalidOperationException("\"Default\" cannot be renamed.");
                var to = Free(Arg("name"), from.Name);
                foreach (var p in projects.Projects.Where(p => themeSets.Known(p.ThemeSet) == from.Name)) p.ThemeSet = to;
                ThemeSetFile.Rename(themeSets, from.Name, to);
                SaveProjects();
                break;
            case "delete":
                var set = themeSets.Get(Arg("name")) ?? throw new InvalidOperationException("\"Default\" cannot be deleted.");
                var users = projects.Projects.Where(p => themeSets.Known(p.ThemeSet) == set.Name).Select(ProjectStore.Display).ToList();
                var desktopsUsing = themeSets.Desktops.Count(d => d.Value == set.Name);
                var said = new List<string>();
                if (users.Count > 0) said.Add($"the project{(users.Count == 1 ? "" : "s")} {string.Join(", ", users)} (back to the desktop's or the app's default)");
                if (desktopsUsing > 0) said.Add(desktopsUsing == 1 ? "a desktop (no default of its own any more)" : $"{desktopsUsing} desktops (no default of their own any more)");
                if (themeSets.App == set.Name) said.Add("the app (back to \"Default\")");
                if (MessageBox.Show(owner, $"Delete the theme set \"{set.Name}\"?" + (said.Count > 0 ? "\n\nIt is used by " + string.Join("; ", said) + "." : ""),
                    "LexPen", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return false;
                foreach (var p in projects.Projects.Where(p => themeSets.Known(p.ThemeSet) == set.Name)) p.ThemeSet = null;
                ThemeSetFile.Delete(themeSets, set.Name);
                SaveProjects();
                break;
            case "use":
                var name = msg["name"] is null ? null : themeSets.Known(Arg("name"));
                switch (Arg("for"))
                {
                    case "project" when w is not null && projects.ProjectOf(w.Key) is { } p:
                        p.ThemeSet = name;
                        SaveProjects();
                        break;
                    case "desktop" when (Arg("desktop") ?? DesktopOf(w)) is { } d:
                        if (name is null) themeSets.Desktops.Remove(d); else themeSets.Desktops[d] = name;
                        break;
                    case "app":
                        themeSets.App = name ?? ThemeSetFile.Default;
                        break;
                }
                break;
            case "removeDesktop":
                themeSets.Desktops.Remove(Arg("desktop") ?? "");
                break;
            case "edit":   // use it for the project of the window last worked in, and open that window's settings
                if (w is not null && projects.ProjectOf(w.Key) is { } edited)
                {
                    edited.ThemeSet = themeSets.Known(Arg("name"));
                    SaveProjects();
                    SaveThemeSets();
                    Restyle();
                    OpenSettings(w);
                    return true;
                }
                break;
            default:
                throw new InvalidOperationException($"Unknown theme set command '{Arg("kind")}'.");
        }
        SaveThemeSets();
        Restyle();
        return true;
    }

    void SaveThemeSets()
    {
        try { ThemeSetFile.Save(ThemeSetsPath, themeSets); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    /// <summary>A window's project gets a set of its own (null: none, the defaults again).</summary>
    public void SetProjectSet(MainForm w, string? set)
    {
        if (projects.ProjectOf(w.Key) is not { } p) return;
        p.ThemeSet = themeSets.Known(set);
        SaveProjects();
        Restyle();
    }

    // What else uses a set, for the message after a change: other projects naming it, desktops, the app.
    string AlsoUsedBy(MainForm from, string set)
    {
        var mine = projects.ProjectOf(from.Key);
        var parts = new List<string>();
        var others = projects.Projects.Count(p => p != mine && themeSets.Known(p.ThemeSet) == set);
        if (others > 0) parts.Add(others == 1 ? "1 other project" : $"{others} other projects");
        var desktop = DesktopOf(from);
        var desktops = themeSets.Desktops.Where(d => d.Value == set).Select(d => d.Key).ToList();
        if (desktop is not null && desktops.Contains(desktop, StringComparer.OrdinalIgnoreCase) && themeSets.Known(mine?.ThemeSet) is not null)
            parts.Add("this desktop's default");
        var otherDesktops = desktops.Count(d => !string.Equals(d, desktop, StringComparison.OrdinalIgnoreCase));
        if (otherDesktops > 0) parts.Add(otherDesktops == 1 ? "another desktop's default" : $"{otherDesktops} other desktops' default");
        if (themeSets.App == set && ThemeSetFile.Source(themeSets, themeSets.Known(mine?.ThemeSet), desktop) != "app") parts.Add("the app's default");
        return parts.Count <= 1 ? string.Concat(parts) : string.Join(", ", parts[..^1]) + " and " + parts[^1];
    }

    string? SettingText(string name) => settings["values"]?[name]?.GetValueKind() == JsonValueKind.String ? settings["values"]![name]!.GetValue<string>() : null;
    bool SettingFlag(string name) => settings["values"]?[name]?.GetValueKind() == JsonValueKind.True;

    /// <summary>A document's right-click menu offers WebView2's Voice typing (the setting voiceTyping).</summary>
    public bool VoiceTyping => SettingFlag("voiceTyping");

    // ---------- Language packs (LanguagePacks) ----------
    static string UserLanguagesDir => Path.Combine(DataDir, LanguagePacks.FolderName);
    static string ShippedLanguagesDir => ShippedDir(LanguagePacks.FolderName);

    // The shipped language packs and themes: defaults next to the exe. A debug build reads (and watches) the project's
    // own defaults instead, so an edit there applies at once, without a build.
    static string ShippedDir(string folder) => Path.Combine(ProjectDefaults ?? Path.Combine(AppContext.BaseDirectory, DefaultsFolder), folder);
    /// <summary>A shipped file (as the macro language's reference, defaults\macros\reference.md).</summary>
    public static string ShippedFile(string folder, string name) => Path.Combine(ShippedDir(folder), name);
    public const string DefaultsFolder = "defaults";
#if DEBUG
    static readonly string? ProjectDefaults = FindProjectFolder(AppContext.BaseDirectory, DefaultsFolder);
#else
    static readonly string? ProjectDefaults = null;   // readonly, not const: a const null makes every test of it a warning
#endif

    /// <summary>A folder of the project the exe was built from (defaults, web): up from `from` to the folder with
    /// LexPen.csproj.</summary>
    internal static string? FindProjectFolder(string from, string folder)
    {
        for (var dir = new DirectoryInfo(from); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "LexPen.csproj"))) return Path.Combine(dir.FullName, folder);
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

    // Lines you gave a language (the language list with a selection; PLAN-embedded-languages.md 3.1.2): kept by
    // path, State\file-ranges.json: per file a list of { language, from, to, first, last } (line numbers and the
    // text of the first and last line, to find them again after the file changed elsewhere).
    static string FileRangesPath => Path.Combine(DataFolder.StateDir(DataDir), "file-ranges.json");
    JsonObject? fileRanges;

    JsonObject FileRangesAll()
    {
        if (fileRanges is not null) return fileRanges;
        try { fileRanges = JsonNode.Parse(File.ReadAllText(FileRangesPath)) as JsonObject; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        return fileRanges ??= new JsonObject();
    }

    public JsonNode? FileRanges(string path) =>
        FileRangesAll().FirstOrDefault(p => string.Equals(p.Key, path, StringComparison.OrdinalIgnoreCase)).Value?.DeepClone();

    /// <summary>Null or an empty list: none for this file.</summary>
    public void SetFileRanges(string path, JsonArray? ranges)
    {
        var all = FileRangesAll();
        foreach (var key in all.Select(p => p.Key).Where(k => string.Equals(k, path, StringComparison.OrdinalIgnoreCase)).ToList())
            all.Remove(key);
        if (ranges is { Count: > 0 }) all[path] = ranges.DeepClone();
        Directory.CreateDirectory(Path.GetDirectoryName(FileRangesPath)!);
        File.WriteAllText(FileRangesPath, all.ToJsonString());
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
        foreach (var dir in ProjectDefaults is null ? [UserLanguagesDir] : new[] { UserLanguagesDir, ShippedLanguagesDir })
            if (Watch(dir, "*", true, Changed) is { } watcher) languagesWatchers.Add(watcher);
        languagesTimer.Tick += (_, _) =>
        {
            languagesTimer.Stop();
            LoadLanguages();
            foreach (var w in windows) w.Post(new JsonObject { ["event"] = "languages", ["languages"] = languages.DeepClone() });
            foreach (var (_, s) in SettingsPages()) s.Post(new JsonObject { ["event"] = "languages", ["languages"] = languages.DeepClone() });
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

    // The theme a setting names (in a window's values: its set's): an old id of a renamed theme finds the new one.
    string? ThemeId(string setting, JsonObject values) =>
        ThemeFile.Current(values[setting]?.GetValueKind() == JsonValueKind.String ? values[setting]!.GetValue<string>() : null, id => themes.Any(t => t.Id == id));

    ThemeFile.Theme AppTheme(JsonObject values) => ThemeFor(ThemeId(Mode == "dark" ? "themeDark" : "themeLight", values), Mode);

    /// <summary>Every colour of a window's app theme (its set's), for the current mode (the mode's fallback for what
    /// it lacks). No window: the window last worked in (the tool windows follow it).</summary>
    public Dictionary<string, string> AppColours(MainForm? w) => ThemeFile.Complete(AppTheme(Values(w)), Mode == "dark" ? fallbackDark : fallbackLight);

    /// <summary>The app's theme background: the window before the page draws.</summary>
    public Color AppBackground(MainForm? w) =>
        ThemeFile.Rgb(AppColours(w).GetValueOrDefault("--bg") ?? "") is var (r, g, b) ? Color.FromArgb(r, g, b)
        : Mode == "dark" ? Color.FromArgb(0x1e, 0x1f, 0x22) : Color.White;

    /// <summary>A script that runs before the page's own scripts and its first paint: the mode and the app's
    /// theme colours on the page, so it never shows other colours first.</summary>
    public string FirstPaintScript(MainForm? w)
    {
        var vars = new JsonObject(AppColours(w).Select(v => KeyValuePair.Create(v.Key, (JsonNode?)v.Value)));
        var mode = JsonValue.Create(Mode).ToJsonString();
        // It runs before <html> exists: an observer sets them on <html> as it appears (a microtask: before the
        // parser runs a page script, and before any paint).
        return $"(() => {{ const set = r => {{ r.dataset.theme = r.dataset.mode = {mode}; " +
            $"for (const [n, v] of Object.entries({vars.ToJsonString()})) r.style.setProperty(n, v); }}; " +
            "if (document.documentElement) return set(document.documentElement); " +
            "new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); set(document.documentElement); } })" +
            ".observe(document, { childList: true }); })();";
    }

    /// <summary>What every window shows: the app's theme, the editor's and the preview's own ones (or null: the app's), the mode,
    /// the list of themes (for the settings) and problems in theme files. A theme's vars are complete (with the
    /// mode's fallback); chain is its id and its bases, nearest first.</summary>
    public JsonObject Look(MainForm? w)
    {
        var values = Values(w);
        var fallback = Mode == "dark" ? fallbackDark : fallbackLight;
        JsonObject Json(ThemeFile.Theme t) => new()
        {
            ["id"] = t.Id, ["name"] = t.Name, ["base"] = t.BaseId,
            ["chain"] = new JsonArray(t.Chain.Select(c => (JsonNode?)c).ToArray()),
            ["vars"] = new JsonObject(ThemeFile.Complete(t, fallback).Select(v => KeyValuePair.Create(v.Key, (JsonNode?)v.Value))),
        };
        var app = AppTheme(values);
        // A theme of its own, or null: none set, or no such theme (reported below).
        JsonObject? Own(string setting) => ThemeId(setting, values) is { Length: > 0 } id && themes.Any(t => t.Id == id) ? Json(ThemeFor(id, Mode)) : null;
        var dark = Mode == "dark";
        var problems = new JsonArray(themeProblems.Select(p => (JsonNode?)p).ToArray());
        foreach (var name in new[] { "themeLight", "themeDark", "editorThemeLight", "editorThemeDark", "previewThemeLight", "previewThemeDark", "sneakTheme" })
            if (ThemeId(name, values) is { Length: > 0 } id && themes.All(t => t.Id != id))
                problems.Add($"{(SetOf(w) is var set && set != ThemeSetFile.Default ? $"Theme set \"{set}\"" : "settings.json")}: \"{name}\": there is no theme \"{id}\".");
        return new JsonObject
        {
            ["mode"] = Mode,
            ["app"] = Json(app),
            ["editor"] = Own(dark ? "editorThemeDark" : "editorThemeLight"),
            ["preview"] = Own(dark ? "previewThemeDark" : "previewThemeLight"),
            ["sneak"] = Own("sneakTheme"),   // the outline's sneak preview
            ["themes"] = new JsonArray(themes.Select(t => (JsonNode?)new JsonObject
                { ["id"] = t.Id, ["name"] = t.Name, ["description"] = t.Description, ["base"] = t.BaseId, ["mine"] = t.Mine }).ToArray()),
            // Old ids of renamed themes -> new: a language pack's byTheme may still use an old one (languages.js).
            ["renamed"] = new JsonObject(ThemeFile.Renamed.Select(r => KeyValuePair.Create(r.Key, (JsonNode?)r.Value))),
            ["problems"] = problems,
            ["caption"] = values["titleBarColours"]?.DeepClone(),   // the windows' captions (ApplyCaption): a change is a look's
        };
    }

    /// <summary>
    /// A LexPen window's caption, its text and its border (Windows 11; Windows 10 ignores them): Windows' own (the
    /// setting titleBarColours "windows", the default), or the app theme's of window `w` ("theme"): active the bars'
    /// background, the text and the accent; not active the side's background, the dimmed text and the lines' colour.
    /// </summary>
    public void ApplyCaption(Form f, MainForm? w, bool? active = null)
    {
        if (!f.IsHandleCreated) return;
        var on = active ?? Form.ActiveForm == f;
        var colours = Values(w)["titleBarColours"]?.GetValue<string>() == "theme" ? AppColours(w) : null;
        int Colour(string name) => ThemeFile.Rgb(colours?.GetValueOrDefault(name) ?? "") is var (r, g, b)
            ? r | g << 8 | b << 16 : unchecked((int)0xFFFFFFFF);   // a COLORREF; else DWMWA_COLOR_DEFAULT
        foreach (var (attribute, colour) in new[] { (35 /* DWMWA_CAPTION_COLOR */, on ? "--bg-bar" : "--bg-side"),
            (36 /* DWMWA_TEXT_COLOR */, on ? "--fg" : "--fg-dim"), (34 /* DWMWA_BORDER_COLOR */, on ? "--accent" : "--border") })
        {
            var value = Colour(colour);
            DwmSetWindowAttribute(f.Handle, attribute, ref value, sizeof(int));
        }
    }

    /// <summary>Its caption active and not active as ApplyCaption says, with the look of `window`.</summary>
    public void FollowCaption(Form f, Func<MainForm?> window)
    {
        f.Activated += (_, _) => ApplyCaption(f, window(), true);
        f.Deactivate += (_, _) => ApplyCaption(f, window(), false);
    }

    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    void LoadThemes()
    {
        var problems = new List<string>();
        var css = WebFiles.ReadText("app.css");
        (fallbackLight, fallbackDark) = (ThemeFile.Fallback(css, "light"), ThemeFile.Fallback(css, "dark"));
        themes = ThemeFile.Load(ShippedThemesDir, UserThemesDir, ThemeFile.Names(css), problems);
        themeProblems = problems;
    }

    /// <summary>The look changed (a setting, a theme file, the Windows mode, Day / night): every window follows.</summary>
    // Each window its own (its set's); a window whose look did not change is left alone.
    void SendLook()
    {
        foreach (var w in windows)
            if (Look(w) is var look && Changed(w, "look", look))
            {
                w.ApplyTheme();
                w.Post(new JsonObject { ["event"] = "look", ["look"] = look });
            }
        foreach (var (owner, s) in SettingsPages())
            if (Look(owner) is var look && Changed(s, "look", look))
            {
                s.ApplyTheme();
                s.Post(new JsonObject { ["event"] = "look", ["look"] = look });
            }
        SendToolLook();
    }

    // The tool windows (character picker, highlights, Manage projects) look as the window last worked in.
    void SendToolLook()
    {
        var look = Look(LastActive);
        foreach (var tool in new IWebPost?[] { charPicker, highlightsWindow, projectsWindow, themeSetsWindow })
            if (tool is Form f && Changed(f, "look", look))
            {
                tool.ApplyTheme();
                tool.Post(new JsonObject { ["event"] = "look", ["look"] = look.DeepClone() });
            }
        foreach (var pane in paneWindows) pane.ApplyTheme();   // their pages get the theme from their window's page
        foreach (var frame in toolFrames.Where(f => f.Kind != "settings"))   // a docked Settings: with the settings windows
            if (Look(frame.Window) is var own && Changed(frame, "look", own)) frame.Post(new JsonObject { ["event"] = "look", ["look"] = own.DeepClone() });
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
        foreach (var dir in ProjectDefaults is null ? [UserThemesDir] : new[] { UserThemesDir, ShippedThemesDir })
            if (Watch(dir, "*.json", false, Changed) is { } watcher) themesWatchers.Add(watcher);
        themesTimer.Tick += (_, _) =>
        {
            themesTimer.Stop();
            LoadThemes();
            SendLook();
        };
    }
    // The macros folder changed (a macro added, removed or renamed, also outside LexPen): every window reads the list
    // again (Manage macros, View > Macros, F1).
    FileSystemWatcher? macrosWatcher;
    readonly System.Windows.Forms.Timer macrosTimer = new() { Interval = 300 };

    ExplorerMenu.Choice ExplorerChoice() => new(SettingFlag("explorerCompare"), SettingFlag("explorerView"), SettingFlag("explorerEdit"),
        SettingText("explorerPlace") == "submenu", SettingFlag("explorerBackups"));

    /// <summary>At the start: Explorer's entries written again when they run this exe, so a new version of LexPen
    /// published over the old one writes them its way (the Explorer extension next to it, its items together). Entries of
    /// another LexPen (a debug build, another folder) stay as they are.</summary>
    public void RefreshExplorerMenu()
    {
        var exe = Environment.ProcessPath ?? Application.ExecutablePath;
        if (ExplorerMenu.InstalledExe is string installed && string.Equals(installed, exe, StringComparison.OrdinalIgnoreCase))
            ExplorerMenu.Apply(exe, ExplorerChoice());
    }

    public void WatchMacros()
    {
        var dir = MacroStore.Dir(DataDir);
        try { Directory.CreateDirectory(dir); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        macrosWatcher = Watch(dir, "*" + MacroStore.Extension, false, () => { macrosTimer.Stop(); macrosTimer.Start(); });
        macrosTimer.Tick += (_, _) =>
        {
            macrosTimer.Stop();
            foreach (var w in windows) w.Post(new JsonObject { ["event"] = "macros" });
        };
    }
    /// <summary>The rows of the settings window, as a main window's page describes them (actions.js).</summary>
    public JsonNode? SettingDefs { get; set; }
    readonly Dictionary<MainForm, SettingsForm> settingsWindows = [];   // per main window, at most one
    CharPickerForm? charPicker;
    HighlightsForm? highlightsWindow;
    ProjectsForm? projectsWindow;
    ThemeSetsForm? themeSetsWindow;

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
            "--host-resolver-rules=\"MAP lexpen.example 127.0.0.1, MAP file.lexpen.example 127.0.0.1, MAP lexpen-panes.example 127.0.0.1\"");
        // The browser's data folder (EBWebView) goes in State\, unless it is still at the top (not moved yet).
        var parent = Path.GetDirectoryName(DataFolder.StatePath(DataDir, "EBWebView"))!;
        return environment ??= CoreWebView2Environment.CreateAsync(null, parent, options);
    }

    // ---------- Launch ----------

    bool restored;

    /// <summary>Opens or activates windows for the paths of one launch. The first launch opens the windows of the
    /// projects first (ProjectStore.StartWindows), each on its own virtual desktop.</summary>
    public void Launch(IReadOnlyList<string> paths, bool shift, bool compare = false, bool view = false, bool edit = false)
    {
        if (view)
        {
            if (!restored)
            {
                RestoreWindows();
                if (windows.Count > 0) { ViewWhenSettled(paths); return; }
            }
            View(paths);
            return;
        }
        if (compare)
        {
            if (!restored)
            {
                RestoreWindows();
                if (windows.Count > 0) { CompareWhenSettled(paths); return; }
            }
            CompareWindow(paths);
            return;
        }
        if (!restored)
        {
            RestoreWindows();
            // Only once they are on their own desktops (WindowShown) does "a window on this desktop" mean anything.
            // Not async itself: an async method puts the thread's synchronization context back as it found it, which
            // here (before the first window) is not WinForms' own; every await after that would leave the UI thread.
            if (windows.Count > 0)
            {
                RouteWhenSettled(paths, shift, edit);
                return;
            }
        }
        Route(paths, shift, edit);
    }

    // The project windows that were open, on their own desktops (the first launch).
    void RestoreWindows()
    {
        restored = true;
        foreach (var (_, entry) in projects.StartWindows(KeepUnnamed, FindViewProject(), FindCompareProject()))
            Open(new MainForm.Start(null, [], entry.Key, ToDesktop: true));
        SaveProjects();
    }

    /// <summary>
    /// --compare (Explorer's Compare to): the two paths compared, two files or two folders (a file and a folder: the file
    /// and the folder's file of that name), in the project for comparing
    /// (docs/plans/executed/PLAN-compare-project.md; made as "Compare", or as "View" when it is the project for viewing, when
    /// there is none): in its window on this desktop when one is shown (a compare there ends first), else in its last
    /// closed window, else a new window of it. The page starts the compare. Anything else: a message saying what is
    /// expected.
    /// </summary>
    void CompareWindow(IReadOnlyList<string> paths)
    {
        void Say(string text)
        {
            MessageBox.Show(text, "LexPen", MessageBoxButtons.OK, MessageBoxIcon.Information);
            if (windows.Count == 0) ExitThread();
        }
        // From Explorer's Compare to (ExplorerMenu): the left side gone, or the left side itself.
        if (paths.Count == 2 && ExplorerMenu.Left is string left && string.Equals(paths[0], left, StringComparison.OrdinalIgnoreCase))
        {
            if (!Path.Exists(left))
            {
                ExplorerMenu.ClearLeft();
                Say($"The left side to compare, {left}, no longer exists. Choose another with Select left side to compare.");
                return;
            }
            if (string.Equals(left.TrimEnd('\\'), paths[1].TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            {
                Say($"That is the left side itself ({ExplorerMenu.NameOf(left)}): choose another file or folder to compare it to.");
                return;
            }
        }
        // A file and a folder: the file against the folder's file of that name (Plan 40), else why not.
        var (pair, why) = CompareProject.FileInFolder(paths);
        if (pair is null)
        {
            Say(why!);
            return;
        }
        paths = pair;
        var files = paths.Count == 2 && paths.All(File.Exists);
        var folders = paths.Count == 2 && paths.All(Directory.Exists);
        if (!files && !folders)
        {
            MessageBox.Show("--compare needs two existing files or two existing folders, for example:\n" +
                "LexPen.exe --compare old.sql new.sql\n\nGiven: " + (paths.Count == 0 ? "nothing" : string.Join("\n", paths)),
                "LexPen", MessageBoxButtons.OK, MessageBoxIcon.Information);
            if (windows.Count == 0) ExitThread();
            return;
        }
        var p = FindCompareProject()
            ?? projects.NewProject(CompareProjectId == CompareProject.SameAsViewing ? ViewProject.Name : CompareProject.Name);
        var shown = recent.FirstOrDefault(w => projects.ProjectOf(w.Key) == p && w.WindowState != FormWindowState.Minimized
            && VirtualDesktop.OnCurrentDesktop(w.Handle));
        if (shown is not null)
        {
            shown.Post(new JsonObject { ["event"] = "compare", ["left"] = paths[0], ["right"] = paths[1], ["folders"] = folders });
            BringToFront(shown);
            return;
        }
        var closed = p.Windows.Where(o => !o.Open).MaxBy(o => o.Used);
        var w = Open(new MainForm.Start(null, [], closed?.Key ?? 0, Compare: [paths[0], paths[1]]), project: p);
        SaveProjects();
        BringToFront(w);
    }

    async void CompareWhenSettled(IReadOnlyList<string> paths)
    {
        await Task.WhenAny(Task.WhenAll(windows.Select(w => w.Settled.Task)), Task.Delay(5000));
        CompareWindow(paths);
    }

    async void RouteWhenSettled(IReadOnlyList<string> paths, bool shift, bool edit)
    {
        await Task.WhenAny(Task.WhenAll(windows.Select(w => w.Settled.Task)), Task.Delay(5000));
        Route(paths, shift, edit);
    }

    // Opening (and Edit in LexPen) never lands in the projects for viewing and comparing: their windows are not in the choice.
    // edit: Edit in LexPen, the files in the editor.
    void Route(IReadOnlyList<string> paths, bool shift, bool edit = false)
    {
        var items = paths.Select(p => (Path: p, Dir: Directory.Exists(p))).ToList();
        var here = recent.Where(w => VirtualDesktop.OnCurrentDesktop(w.Handle) && !SetApart(w)).Select(w => windows.IndexOf(w)).ToList();
        var targets = Router.Route(items, windows.Select(w => SetApart(w) ? null : w.Root).ToList(), here, shift);

        MainForm? front = null;
        foreach (var t in targets)
        {
            MainForm w;
            if (t.Window is int i)
            {
                w = windows[i];
                // A file another window of this project has open already goes to that window: never twice in a project.
                var target = w;
                foreach (var group in t.Files.GroupBy(f => HolderOf(target, f) ?? target).ToList())
                {
                    group.Key.Post(new JsonObject { ["event"] = "open", ["files"] = ToArray(group.ToList()), ["edit"] = edit });
                    w = group.Key;   // the window that shows the last of them comes to the front
                }
            }
            // A new window for files (not Shift, not a folder): on a desktop whose last window was closed, that
            // project comes back instead of a new one.
            else w = Open(new MainForm.Start(t.Folder, t.Files, Edit: edit), reopenHere: !shift && t.Folder is null);
            if (ReferenceEquals(t, targets[^1])) front = w;
        }
        BringToFront(front!);
    }

    /// <summary>
    /// A window. <paramref name="start"/>.Key: a window of a project to open again (its session, place and, with
    /// ToDesktop, its desktop); 0: a new window, in <paramref name="project"/> or per the setting newWindowProject.
    /// <paramref name="at"/>: screen position for a tab dragged out of a window.
    /// </summary>
    public MainForm Open(MainForm.Start start, Point? at = null, ProjectStore.Project? project = null, bool reopenHere = false)
    {
        var entry = start.Key != 0 ? projects.WindowOf(start.Key) : null;
        if (entry is null)
        {
            entry = projects.AddWindow(project ?? ProjectForNewWindow());
            start = start with { Key = entry.Key };
        }
        var w = new MainForm(this, ++lastId, start);
        var saved = entry.Bounds is [var x, var y, var width, var height] ? new Rectangle(x, y, width, height)
            : windows.Count == 0 ? new Rectangle(State.X, State.Y, State.Width, State.Height) : Rectangle.Empty;
        var maximized = entry.Bounds is not null ? entry.Maximized : windows.Count == 0 && State.Maximized;
        if (saved.Width > 200 && at is null && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(saved)))
            w.Place(saved, maximized);
        else if (windows.Count == 0)
            w.Place(null, maximized);
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
            projects.Touch(w.Key);
            WindowPlaceChanged(w);
            SendToolLook();   // the tool windows look as this one now
            if (outlineWanted.GetValueOrDefault(w)) ServeOutline(w);   // the floating outline serves it now
        };
        // Closing while the floating outline serves it: on to the next window it may serve, else it closes with it.
        w.FormClosing += (_, _) => { if (FloatingOutline?.Owner == w && OutlineHeir(w) is { } next) ServeOutline(next); };
        w.FormClosed += (_, e) => Closed(w, e.CloseReason);
        if (primary is null) SetPrimary(w);
        else w.UpdateRole();
        w.Show();
        w.ReopenHere = reopenHere;   // decided once it is shown (WindowShown)
        entry.Open = true;
        projects.Touch(entry.Key);
        WindowPlaceChanged(w);
        return w;
    }

    /// <summary>
    /// A window is shown: now Windows knows it, so it can go to its own desktop (a window opened at start) and tell
    /// which desktop it is on. Windows takes a moment to know a new window: tried for up to about 3 seconds. A new
    /// window on a desktop whose last LexPen window was closed becomes that project's window (the most recently
    /// closed one there, at its place) and the project's other closed windows open too. Then the page loads.
    /// </summary>
    public async void WindowShown(MainForm w)
    {
        string? desktop = null;
        var target = w.ToDesktop ? projects.WindowOf(w.Key)?.Desktop : null;
        if (VirtualDesktop.Available && (target is not null || w.ReopenHere))
            for (var i = 0; i < 30; i++)
            {
                var moved = target is null || VirtualDesktop.MoveTo(w.Handle, target);
                desktop = VirtualDesktop.DesktopOf(w.Handle);
                // Known to Windows and moved; or known but the desktop is gone (removed, another PC): it stays here.
                if (desktop is not null && (moved || i >= 3)) break;
                await Task.Delay(100);
            }
        if (w.ReopenHere && desktop is not null && projects.LastClosedOn(desktop, FindViewProject(), FindCompareProject()) is { } closed
            && closed.Windows.Where(o => o.Desktop == desktop).MaxBy(o => o.Used) is { } reuse)
        {
            projects.Forget(w.Key, KeepUnnamed);
            w.Rekey(reuse.Key);
            reuse.Open = true;
            if (reuse.Bounds is [var x, var y, var width, var height]
                && Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(x, y, width, height))))
            {
                w.Bounds = new Rectangle(x, y, width, height);
                if (reuse.Maximized) w.WindowState = FormWindowState.Maximized;
            }
            foreach (var other in closed.Windows.Where(o => o != reuse && !o.Open).ToList())
                Open(new MainForm.Start(null, [], other.Key));
            w.UpdateRole();
            Restyle();   // another project now: maybe another theme set than its page asked for at its start
        }
        WindowPlaceChanged(w);
        w.Settled.TrySetResult();
    }

    // The project of a new window: per the setting, the project of the last window used on this desktop, or a new one.
    ProjectStore.Project ProjectForNewWindow()
    {
        if (SettingText("newWindowProject") != "new"
            && recent.FirstOrDefault(w => VirtualDesktop.OnCurrentDesktop(w.Handle) && !SetApart(w)) is { } last
            && projects.ProjectOf(last.Key) is { } p)
            return p;
        return projects.NewProject("");
    }

    void SetPrimary(MainForm w)
    {
        var old = primary;
        primary = w;
        old?.UpdateRole();
        w.UpdateRole();
    }

    void Closed(MainForm w, CloseReason reason)
    {
        windows.Remove(w);
        recent.Remove(w);
        outlineWanted.Remove(w);
        foreach (var key in highlightsIn.Keys.Where(k => k.Item1 == w).ToList()) highlightsIn.Remove(key);
        settingsPending.Remove(w);
        highlightsActive.Remove(w);
        foreach (var path in locks.Where(l => l.Value.Contains(w)).Select(l => l.Key).ToList())
            Unlock(path, w);
        // Closed by hand, the last window too: the project's rules (ProjectStore.CloseByHand); the project comes back
        // when LexPen starts on that desktop (LastClosedOn). Windows closing it (log-off, shutdown, Task Manager) or a
        // crash: the windows stay open in their projects and all come back at the next start, each on its desktop.
        if (w.CloseAnswer is not null) projects.CloseWithProject(w.Key, KeepUnnamed);   // Manage projects: Close, Delete
        else if (reason is not (CloseReason.WindowsShutDown or CloseReason.TaskManagerClosing))
            projects.CloseByHand(w.Key, KeepUnnamed);
        // The most recently active window takes over as primary.
        if (primary == w)
        {
            primary = null;
            if (recent.Count > 0) SetPrimary(recent[0]);
        }
        foreach (var other in windows) other.UpdateRole();   // the [n] numbers shift
        SaveProjects();
        if (windows.Count == 0)
        {
            foreach (var s in settingsWindows.Values.ToList()) s.Close();
            charPicker?.Close();
            highlightsWindow?.Close();
            projectsWindow?.Close();
            themeSetsWindow?.Close();
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
                Launch(paths, msg["shift"]?.GetValue<bool>() == true, msg["compare"]?.GetValue<bool>() == true, msg["view"]?.GetValue<bool>() == true,
                    msg["edit"]?.GetValue<bool>() == true);
            }
            catch (Exception ex) when (ex is IOException or JsonException) { }
        }
    }

    // ---------- Edit lock ----------

    // Another open window of the target's project that has the file open (the windows with it: locks), when the target
    // has not; else null.
    MainForm? HolderOf(MainForm target, string path)
    {
        if (!locks.TryGetValue(path, out var list) || list.Contains(target)) return null;
        var project = projects.ProjectOf(target.Key);
        return list.FirstOrDefault(x => !x.IsDisposed && project is not null && projects.ProjectOf(x.Key) == project);
    }

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
            to = Open(new MainForm.Start(null, []), target.GetValue<string>() == "new" ? at : null);

        if (transfer is not null) TransferLock(transfer, from, to);
        to.Post(new JsonObject { ["event"] = "adoptTab", ["tab"] = tab.DeepClone(), ["pane"] = pane });
        BringToFront(to);
    }

    // ---------- Theme, settings, session ----------

    // ---------- Settings, shared by all windows ----------

    /// <summary>One setting changed (settings window, a menu, a key): written to your settings.json, then every
    /// window and the settings window get the new set at once.</summary>
    public JsonObject? SetSetting(string name, JsonNode? value, MainForm? from = null)
    {
        // A setting of the look, from a window whose set is not "Default": stored in that set (theme-sets.json), at
        // once; the answer says where, and what else uses it (docs/plans/executed/PLAN-theme-sets.md, 3.7).
        if (from is not null && ThemeSetFile.Names.Contains(name) && SetOf(from) is var set && themeSets.Get(set) is { } inSet)
        {
            SettingsFile.Set(File.ReadAllText(SettingsFile.DefaultsPath), null, name, value);   // throws for a wrong value
            inSet.Values[name] = value?.DeepClone();
            SaveThemeSets();
            Restyle();
            return new JsonObject { ["set"] = set, ["also"] = AlsoUsedBy(from, set) };
        }
        SettingsFile.Write(DataDir, name, value);
        ReloadSettings();
        // The Explorer menu's entries (ExplorerMenu): written for this exe as the settings now say, or removed.
        if (name is "explorerCompare" or "explorerView" or "explorerEdit" or "explorerPlace" or "explorerBackups")
            ExplorerMenu.Apply(Environment.ProcessPath ?? Application.ExecutablePath, ExplorerChoice());
        return from is not null && ThemeSetFile.Names.Contains(name)
            ? new JsonObject { ["set"] = ThemeSetFile.Default, ["also"] = AlsoUsedBy(from, ThemeSetFile.Default) } : null;
    }

    // Also after a hand edit of the file (see WatchSettings).
    void ReloadSettings()
    {
        settings = SettingsFile.Load(DataDir);
        SendSettings();
        SendLook();   // only the windows whose look changed
    }

    /// <summary>A main window described the settings' rows again (another list of themes): the settings window follows.</summary>
    public void DefsChanged()
    {
        foreach (var (_, s) in SettingsPages()) s.Post(new JsonObject { ["event"] = "defs", ["defs"] = SettingDefs?.DeepClone() });
    }

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

    /// <summary>The layout values the page kept in its own storage (the sidebar, the outline, the panes, ...), moved to
    /// defaultLayout once (docs/plans/executed/PLAN-settings-layers.md).</summary>
    public bool LayoutMoved => File.Exists(LayoutMovedPath);

    public void ImportLayout(JsonObject values)
    {
        if (LayoutMoved) return;
        SettingsFile.WriteImportedLayout(DataDir, values);
        File.WriteAllText(LayoutMovedPath, "");
        ReloadSettings();
    }

    // ---------- Zoom per screen (docs/plans/executed/PLAN-settings-layers.md, 3.6) ----------
    // The base is global (editorSize, zoom in settings.json); each monitor can add its own (ScreenZoom), kept in
    // state.json: the monitors differ per PC. A window shows the zoom of the monitor it is on, and takes another's
    // when it moves there (its place changing: WindowPlaceChanged).

    /// <summary>What a window's page gets: its monitor's key, name and zoom.</summary>
    public JsonObject ScreenOf(MainForm w)
    {
        if (w.ScreenKey is null) (w.ScreenKey, w.ScreenName) = Monitors.Of(w);
        var zoom = State.Screens.GetValueOrDefault(w.ScreenKey);
        return new JsonObject { ["key"] = w.ScreenKey, ["name"] = w.ScreenName, ["editorStep"] = zoom?.EditorStep ?? 0, ["previewFactor"] = zoom?.PreviewFactor ?? 1 };
    }

    void SendScreen(MainForm w)
    {
        var screen = ScreenOf(w);
        screen["event"] = "screen";
        w.Post(screen);
        foreach (var s in SettingsPagesOf(w)) s.Post((JsonObject)screen.DeepClone());
    }

    // The window may be on another monitor now (moved, resized, maximised, the DPI changed).
    void ScreenChanged(MainForm w)
    {
        if (w.ScreenKey is null || w.WindowState == FormWindowState.Minimized) return;   // not asked yet: the page asks first
        var (key, name) = Monitors.Of(w);
        if (key == w.ScreenKey) return;
        (w.ScreenKey, w.ScreenName) = (key, name);
        SendScreen(w);
    }

    /// <summary>Zoom in / out / 100% in a window: its monitor's zoom (null: that part stays); every window on that
    /// monitor follows.</summary>
    public void SetScreenZoom(MainForm from, double? editorStep, double? previewFactor)
    {
        var key = ScreenOf(from)["key"]!.GetValue<string>();
        ScreenZoom.Set(State.Screens, key, editorStep, previewFactor);
        SaveState();
        foreach (var w in windows) if (w.ScreenKey == key) SendScreen(w);
    }

    /// <summary>View > Zoom > Use on every screen (the page made this screen's zoom the base): no monitor has its own.</summary>
    public void ClearScreenZooms()
    {
        State.Screens.Clear();
        SaveState();
        foreach (var w in windows) if (w.ScreenKey is not null) SendScreen(w);
    }

    // ---------- A window's layout (docs/plans/executed/PLAN-settings-layers.md) ----------

    /// <summary>The layout a window opens with: its own, else that of the last window of its project (ProjectStore.LayoutOf).</summary>
    public JsonNode? LayoutFor(MainForm w) => projects.LayoutOf(w.Key) ?? (ForViewing(w) ? ViewLayout() : null);

    // ---------- The project for viewing (docs/plans/executed/PLAN-view-window.md) ----------

    int ViewProjectId => settings["values"]?["viewProject"]?.GetValueKind() == JsonValueKind.Number ? settings["values"]!["viewProject"]!.GetValue<int>() : 0;
    ProjectStore.Project? FindViewProject() => ViewProject.Find(projects, ViewProjectId);
    bool ForViewing(MainForm w) => FindViewProject() is { } p && projects.ProjectOf(w.Key) == p;
    // A window of the project for viewing or for comparing: opening a file, a new window never lands there.
    bool SetApart(MainForm w) => ForViewing(w) || FindCompareProject() is { } p && projects.ProjectOf(w.Key) == p;

    // ---------- The project for comparing (docs/plans/executed/PLAN-compare-project.md) ----------

    int CompareProjectId => settings["values"]?["compareProject"]?.GetValueKind() == JsonValueKind.Number ? settings["values"]!["compareProject"]!.GetValue<int>() : 0;
    ProjectStore.Project? FindCompareProject() => CompareProject.Find(projects, CompareProjectId, FindViewProject());
    JsonObject ViewLayout() => ViewProject.Layout(settings["defaults"]?["defaultLayout"] as JsonObject, settings["values"]?["defaultLayout"] as JsonObject);

    async void ViewWhenSettled(IReadOnlyList<string> paths)
    {
        await Task.WhenAny(Task.WhenAll(windows.Select(w => w.Settled.Task)), Task.Delay(5000));
        View(paths);
    }

    /// <summary>View in LexPen: the files (in Preview) and a folder (in the Folder pane) in the project for viewing (made
    /// as "View" when there is none): in its window on this desktop when one is shown, else in its last closed window,
    /// else a new window of it.</summary>
    void View(IReadOnlyList<string> paths)
    {
        var p = FindViewProject() ?? projects.NewProject(ViewProject.Name);
        var folder = paths.FirstOrDefault(Directory.Exists);
        var files = paths.Where(path => !Directory.Exists(path)).ToList();
        var shown = recent.FirstOrDefault(w => projects.ProjectOf(w.Key) == p && w.WindowState != FormWindowState.Minimized
            && VirtualDesktop.OnCurrentDesktop(w.Handle));
        if (shown is not null)
        {
            shown.Post(new JsonObject { ["event"] = "view", ["folder"] = folder, ["files"] = ToArray(files) });
            BringToFront(shown);
            return;
        }
        var closed = p.Windows.Where(o => !o.Open).MaxBy(o => o.Used);
        var w = Open(new MainForm.Start(folder, files, closed?.Key ?? 0, View: true), project: p);
        SaveProjects();
        BringToFront(w);
    }

    /// <summary>Settings > Reset to view layout: the project for viewing gets the view layout (one window, one pane, no
    /// side panes, every tab in Preview); its tabs and folder stay. Asks first, naming the project.</summary>
    public void ResetViewLayout(IWin32Window owner)
    {
        if (FindViewProject() is not { } p)
        {
            MessageBox.Show(owner, "There is no project for viewing yet: the first View in LexPen makes it, named \"View\".",
                "LexPen", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (MessageBox.Show(owner, $"Give the project \"{ProjectStore.Display(p)}\" the view layout?\n\nOne window with one pane, no sidebar, " +
            "outline, formatting bar or ruler, every tab in the preview. Its tabs and folder stay; its other windows close.",
            "LexPen", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var layout = ViewLayout();
        var open = windows.Where(w => projects.ProjectOf(w.Key) == p).OrderBy(w => recent.IndexOf(w)).ToList();
        if (open.Count > 0)
        {
            p.Windows.RemoveAll(o => !o.Open);
            foreach (var other in open.Skip(1)) other.Close();
            open[0].Post(new JsonObject { ["event"] = "viewLayout", ["layout"] = layout });
        }
        else if (p.Windows.MaxBy(o => o.Used) is { } last)
        {
            last.Session = ViewProject.ToViewLayout(last.Session, layout);
            p.Windows.RemoveAll(o => o != last);
        }
        SaveProjects();
        if (projectsWindow is not null || toolFrames.Any(f => f.Kind == "projects")) ProjectsChanged();
    }

    /// <summary>The projects for the settings window's list (Project for viewing): id and name, newest used first.</summary>
    public JsonArray ProjectNames() => new(projects.Projects.OrderByDescending(p => p.Used)
        .Select(p => (JsonNode?)new JsonObject { ["id"] = p.Id, ["name"] = ProjectStore.Display(p) }).ToArray());

    /// <summary>View > Layout > Use layout of... (docs/plans/24-PLAN-docking.md 3.13a): the other open windows (most recently
    /// used first), then the projects with no window open whose last window has a layout (newest used first).</summary>
    public JsonArray LayoutSources(MainForm asking)
    {
        var list = new JsonArray();
        foreach (var w in recent.Where(w => w != asking))
            list.Add(new JsonObject { ["kind"] = "window", ["id"] = w.Key, ["label"] = w.Text });
        foreach (var p in projects.Projects.Where(p => !p.Windows.Any(o => o.Open) && LastLayout(p) is not null).OrderByDescending(p => p.Used))
            list.Add(new JsonObject { ["kind"] = "project", ["id"] = p.Id, ["label"] = ProjectStore.Display(p) });
        return list;
    }

    /// <summary>The layout of an open window (as it shows it now) or of a project (its last window's); null when gone.</summary>
    public JsonNode? LayoutFrom(string kind, int id)
    {
        // An open window that reported nothing yet shows the default layout: no values of its own.
        if (kind == "window") return windows.FirstOrDefault(w => w.Key == id) is { } w ? w.PageLayout?.DeepClone() ?? projects.LayoutOf(id) ?? new JsonObject() : null;
        return projects.Get(id) is { } p ? LastLayout(p)?.DeepClone() : null;
    }

    static JsonNode? LastLayout(ProjectStore.Project p) =>
        p.Windows.Where(w => w.Session?["layout"] is JsonObject).MaxBy(w => w.Used)?.Session!["layout"];

    /// <summary>A window's layout changed (the page says it): its settings window follows.</summary>
    public void LayoutShown(MainForm w)
    {
        foreach (var s in SettingsPagesOf(w)) s.Post(new JsonObject { ["event"] = "layout", ["layout"] = w.PageLayout?.DeepClone() });
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

    /// <summary>A window's Settings, as it was last (docs/plans/24-PLAN-docking.md 3.7a): its page decides (the action
    /// settings: its window of its own, or docked in the window); the window comes to the front.</summary>
    public void OpenSettings(MainForm from)
    {
        from.Post(new JsonObject { ["event"] = "runAction", ["name"] = "settings" });
        BringToFront(from);
    }

    /// <summary>The settings pages of every window: its window of its own and the one docked in it (ToolFrame "settings").</summary>
    IEnumerable<(MainForm Owner, IWebPost Page)> SettingsPages() =>
        settingsWindows.Select(p => (p.Key, (IWebPost)p.Value)).Concat(toolFrames.Where(f => f.Kind == "settings").Select(f => (f.Window, (IWebPost)f)));
    IEnumerable<IWebPost> SettingsPagesOf(MainForm w) => SettingsPages().Where(p => p.Owner == w).Select(p => p.Page).ToList();

    // Messages for a window's settings page while it has none yet (it is being opened): given to the first that starts.
    readonly Dictionary<MainForm, List<JsonObject>> settingsPending = [];
    public void SettingsPageStarted(MainForm w, IWebPost page)
    {
        if (settingsPending.Remove(w, out var list)) foreach (var m in list) page.Post(m);
    }

    public void CloseSettings(MainForm from) => settingsWindows.GetValueOrDefault(from)?.Close();

    /// <summary>Options > Settings in a window of its own: the settings window of the window it was asked from, owned
    /// by it (so on its desktop); that window's own when it has one open, brought to the front. Two windows can each
    /// have one.</summary>
    public void OpenSettingsWindow(MainForm from)
    {
        if (settingsWindows.TryGetValue(from, out var open) && !open.IsDisposed)
        {
            BringToFront(open);
            return;
        }
        var settingsWindow = new SettingsForm(this, from);
        settingsWindows[from] = settingsWindow;
        settingsWindow.FormClosed += (_, _) => { if (settingsWindows.GetValueOrDefault(from) == settingsWindow) settingsWindows.Remove(from); };
        settingsWindow.Show(from);
    }

    /// <summary>A message to a main window's settings page (its window or the docked one; queued until its page is
    /// ready, or until one starts).</summary>
    public void SettingsWindowPost(MainForm w, JsonObject message)
    {
        var pages = SettingsPagesOf(w).ToList();
        if (pages.Count == 0) (settingsPending.TryGetValue(w, out var list) ? list : settingsPending[w] = []).Add(message);
        foreach (var page in pages) page.Post(message);
    }

    /// <summary>A main window's caption changed (its project renamed, the [n] shifted): its settings window follows.</summary>
    public void SettingsTitle(MainForm w) => settingsWindows.GetValueOrDefault(w)?.UpdateTitle();

    /// <summary>The character picker: one for the app; opened again, brought to the front at that character. The
    /// main windows hear whether it is open (they then tell it the character after their cursor).</summary>
    public void OpenCharPicker(MainForm from, int? code)
    {
        if (charPicker is { IsDisposed: false })
        {
            charPicker.Post(new JsonObject { ["event"] = "goTo", ["code"] = code });
            BringToFront(charPicker);
            return;
        }
        charPicker = new CharPickerForm(this, from, code);
        charPicker.FormClosed += (_, _) =>
        {
            charPicker = null;
            foreach (var w in windows) w.Post(new JsonObject { ["event"] = "charPicker", ["open"] = false });
        };
        foreach (var w in windows) w.Post(new JsonObject { ["event"] = "charPicker", ["open"] = true });
        charPicker.Show(from);
    }

    /// <summary>The character after the cursor of editor pane `pane` (the active one) of window `from`: the floating
    /// picker, the window's picker docked there, and that editor pane's own.</summary>
    public void CharPickerCursor(MainForm from, int? code, int? pane)
    {
        charPicker?.Post(new JsonObject { ["event"] = "cursor", ["code"] = code });
        foreach (var frame in toolFrames.Where(f => f.Kind == "chars" && f.Window == from && (f.Pane is null || f.Pane == pane)))
            frame.Post(new JsonObject { ["event"] = "cursor", ["code"] = code });
    }

    /// <summary>The picker docked in window `from` (`pane`: that editor pane's own; null: the window's) at a character
    /// (as the floating one is when opened again).</summary>
    public void CharPickerGoTo(MainForm from, int? code, int? pane)
    {
        foreach (var frame in toolFrames.Where(f => f.Kind == "chars" && f.Window == from && f.Pane == pane))
            frame.Post(new JsonObject { ["event"] = "goTo", ["code"] = code });
    }

    public void CloseCharPicker() => charPicker?.Close();

    /// <summary>A request of a character picker's page: its own window's (`window` null: it works for the window last
    /// worked in), or of one docked in `window` (`pane`: an editor pane's own, inserting there). `code`: the character
    /// to show first (init).</summary>
    public JsonNode? CharPickerRequest(MainForm? window, JsonNode msg, int? code, int? pane = null)
    {
        var op = msg["op"]?.GetValue<string>() ?? "";
        if (CharInfo.Request(op, msg) is { Handled: true } done) return done.Result;
        var to = window ?? LastActive;
        switch (op)
        {
            case "init":
                return new JsonObject { ["settings"] = SettingsFor(to)["values"]?.DeepClone(), ["look"] = Look(to), ["code"] = code };

            // Into that window, at its cursors; it comes to the front.
            case "insert":
            {
                if (to is not MainForm w) return false;
                w.Post(new JsonObject { ["event"] = "insertText", ["text"] = msg["text"]!.GetValue<string>(), ["pane"] = pane });
                if (window is null) BringToFront(w);
                return true;
            }

            default:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }

    // ---------- Tools docked in a window (ToolFrame; docs/plans/24-PLAN-docking.md 7b) ----------
    readonly List<ToolFrame> toolFrames = [];
    public void AddToolFrame(ToolFrame frame) => toolFrames.Add(frame);
    public void ToolFrameGone(ToolFrame frame) => toolFrames.Remove(frame);

    /// <summary>A request of a tool's page docked in a window, answered as its own window answers it, for that window.
    /// Its Esc (close): the keys back to the window's document.</summary>
    public async Task<JsonNode?> ToolRequest(ToolFrame frame, JsonNode msg)
    {
        if (msg["op"]?.GetValue<string>() == "close" && frame.Kind != "projects")   // Manage projects: close is of projects
        {
            frame.Window.Post(new JsonObject { ["event"] = "toolEscape", ["kind"] = frame.Kind, ["pane"] = frame.Pane });
            return null;
        }
        return frame.Kind switch
        {
            "chars" => CharPickerRequest(frame.Window, msg, null, frame.Pane),
            "hls" => await HighlightsRequest(frame.Window, msg, frame.Pane),
            "settings" => SettingsForm.Request(this, frame, frame.Window, frame.Window, msg),
            "projects" => await ProjectsForm.Request(this, frame.Window, frame.Window, msg),
            "themesets" => ThemeSetsForm.Request(this, frame.Window, frame.Window, msg),
            _ => throw new InvalidOperationException($"Unknown tool '{frame.Kind}'."),
        };
    }

    // ---------- Highlights (HighlightStore, HighlightsForm; docs/plans/executed/PLAN-highlights.md) ----------
    /// <summary>The highlights of the document last worked in, as its window last told (the highlights window shows them).</summary>
    public JsonObject? HighlightsShownNow { get; private set; }

    // What each window's editor panes show (window, pane -> its document's highlights; none: no document), and which
    // pane is its active one: for the highlights docked there (docs/plans/24-PLAN-docking.md 7b).
    readonly Dictionary<(MainForm, int), JsonObject> highlightsIn = [];
    readonly Dictionary<MainForm, int> highlightsActive = [];

    /// <summary>The highlights window: one for the app; opened again, brought to the front.</summary>
    public void OpenHighlights(MainForm from)
    {
        if (highlightsWindow is { IsDisposed: false }) { BringToFront(highlightsWindow); return; }
        highlightsWindow = new HighlightsForm(this, from);
        highlightsWindow.FormClosed += (_, _) => highlightsWindow = null;
        highlightsWindow.Show(from);
    }

    public void CloseHighlights() => highlightsWindow?.Close();

    /// <summary>A window tells which document's highlights an editor pane of it shows (`pane`, `active`: the active
    /// one; `none`: no document): the highlights docked beside that pane hear it, those docked in the window when it
    /// is the active pane, the highlights window when it is the active pane of the window last worked in.</summary>
    public void HighlightsShown(MainForm from, JsonObject shown)
    {
        var pane = shown["pane"]?.GetValue<int>() ?? 0;
        var active = shown["active"]?.GetValue<bool>() != false;
        highlightsIn[(from, pane)] = shown;
        if (active) highlightsActive[from] = pane;
        foreach (var frame in toolFrames.Where(f => f.Kind == "hls" && f.Window == from && (f.Pane == pane || active && f.Pane is null)))
            frame.Post(new JsonObject { ["event"] = "shown", ["shown"] = shown.DeepClone() });
        if (!active || from != LastActive || shown["none"] is not null) return;
        HighlightsShownNow = shown;
        highlightsWindow?.Post(new JsonObject { ["event"] = "shown", ["shown"] = shown.DeepClone() });
    }

    // What the highlights docked in `window` show: its editor pane `pane`'s document, or (null) its active pane's.
    JsonObject? HighlightsShownIn(MainForm window, int? pane) =>
        highlightsIn.GetValueOrDefault((window, pane ?? highlightsActive.GetValueOrDefault(window)));

    /// <summary>A file's highlights were written: the other windows showing it read them again; the highlights window
    /// and the docked ones refresh their list of all files.</summary>
    public void HighlightsChanged(MainForm from, string? path, string? draft)
    {
        foreach (var w in windows) if (w != from) w.Post(new JsonObject { ["event"] = "highlights", ["path"] = path, ["draft"] = draft });
        highlightsWindow?.Post(new JsonObject { ["event"] = "changed", ["path"] = path, ["draft"] = draft });
        foreach (var frame in toolFrames.Where(f => f.Kind == "hls")) frame.Post(new JsonObject { ["event"] = "changed", ["path"] = path, ["draft"] = draft });
    }

    /// <summary>A request of a highlights page: its own window's (`window` null: it works on the LexPen window last
    /// worked in and its document), or of one docked in `window` (`pane`: an editor pane's own, its document; null:
    /// the window's active document). Esc with an empty search: back to that window (docked: to its document).</summary>
    public async Task<JsonNode?> HighlightsRequest(MainForm? window, JsonNode msg, int? pane)
    {
        var op = msg["op"]?.GetValue<string>() ?? "";
        switch (op)
        {
            case "init":
            {
                var to = window ?? LastActive;
                return new JsonObject { ["settings"] = SettingsFor(to)["values"]?.DeepClone(), ["look"] = Look(to),
                    ["shown"] = (window is null ? HighlightsShownNow : HighlightsShownIn(window, pane))?.DeepClone() };
            }

            // Every file with highlights, each with its list (All files and its search); the store read off the UI thread.
            case "all":
                return await Task.Run(AllHighlights);

            // To a highlight, in its LexPen window (its own window: the one last worked in, which comes to the front).
            case "go":
            case "action":
            {
                if ((window ?? LastActive) is not MainForm w) return false;
                var ev = new JsonObject { ["event"] = op == "go" ? "highlightGo" : "highlightAction" };
                foreach (var (key, value) in msg.AsObject()) if (key is not ("op" or "id")) ev[key] = value?.DeepClone();
                if (msg["hid"] is JsonNode hid) ev["id"] = hid.DeepClone();
                ev["pane"] = pane;
                w.Post(ev);
                if (op == "go" && window is null) BringToFront(w);
                return true;
            }

            // A file's highlights dropped (All files: a file that is gone).
            case "forget":
                Highlights.Set(msg["path"]?.GetValue<string>(), msg["draft"]?.GetValue<string>(), [], false);
                return true;

            case "back":
                if (window is not null) window.Post(new JsonObject { ["event"] = "toolEscape", ["kind"] = "hls", ["pane"] = pane });
                else if (LastActive is MainForm last) BringToFront(last);
                return true;

            default:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }

    JsonArray AllHighlights()
    {
        var all = new JsonArray();
        foreach (var file in Highlights.All())
        {
            var path = file?["path"]?.GetValue<string>();
            var draft = file?["draft"]?.GetValue<string>();
            var got = Highlights.Get(path, draft);
            all.Add(new JsonObject
            {
                ["path"] = path, ["draft"] = draft, ["beside"] = file?["beside"]?.DeepClone(),
                ["missing"] = path is not null && !File.Exists(path), ["list"] = got["list"]?.DeepClone(),
            });
        }
        return all;
    }

    public void SaveHighlightsWindow(int[] bounds)
    {
        State.HighlightsWindow = bounds;
        SaveState();
    }

    // ---------- Floating panes (docs/plans/24-PLAN-docking.md 3.3, 3.5) ----------

    readonly List<PaneForm> paneWindows = [];

    PaneForm? PaneWindow(MainForm owner, string id) => paneWindows.FirstOrDefault(p => p.Owner == owner && p.Id == id && !p.IsDisposed);

    /// <summary>
    /// A pane of a window into a window of its own (its page, as in the window's frame); closed, it is back. The
    /// floating outline is one for LexPen (7.3): asked by another window it becomes that window's. "created": a new
    /// window (its page says when it is ready); "open": it was there already (the asking window sends what it shows).
    /// </summary>
    public string FloatPane(MainForm owner, string id, string page, bool atCursor = false)
    {
        if (id == FloatingOutlineId && FloatingOutline is { } outline)
        {
            if (outline.Owner != owner) ServeOutline(owner, tell: false);
            BringToFront(outline);
            return "open";
        }
        if (PaneWindow(owner, id) is { } open) { BringToFront(open); return "open"; }
        var pane = new PaneForm(this, owner, id, page, atCursor ? new Point(Cursor.Position.X - 60, Cursor.Position.Y - 12) : null);
        paneWindows.Add(pane);
        pane.FormClosed += (_, _) =>
        {
            paneWindows.Remove(pane);
            // The floating outline gone: every window that used it hears it; another pane: its window.
            var told = id == FloatingOutlineId ? windows.ToList() : [owner];
            foreach (var w in told.Where(w => !w.IsDisposed)) w.Post(new JsonObject { ["event"] = "paneClosed", ["pane"] = id });
        };
        pane.Show(owner);
        return "created";
    }

    /// <summary>A message of a window's page for its floating pane (the floating outline: only from the window it serves).</summary>
    public void SendToPane(MainForm owner, string id, JsonNode msg) => PaneWindow(owner, id)?.Send(msg);

    /// <summary>
    /// A floating pane back in its window (the page asked): its window closes ("closed"). The floating outline asked by
    /// the window it serves moves on to the window worked in last that it may serve ("moved"), else it closes; asked by
    /// another window nothing happens ("none").
    /// </summary>
    public string DockPane(MainForm owner, string id)
    {
        if (PaneWindow(owner, id) is not { } pane) return "none";
        if (id == FloatingOutlineId && OutlineHeir(owner) is { } next) { ServeOutline(next); return "moved"; }
        pane.Close();
        return "closed";
    }

    // ---------- View > Panels (docs/plans/24-PLAN-docking.md 3.14, stage 9) ----------

    // A window's floating panes with their window open: the tools of their own (one for LexPen, its Settings one of
    // its own) and its pane windows (the floating outline: when it serves this window).
    IEnumerable<(string Kind, Form Form)> ToolWindows(MainForm w)
    {
        foreach (var (kind, f) in new (string, Form?)[] { ("chars", charPicker), ("hls", highlightsWindow), ("projects", projectsWindow),
            ("themesets", themeSetsWindow), ("settings", settingsWindows.GetValueOrDefault(w)) })
            if (f is { IsDisposed: false, Visible: true }) yield return (kind, f);
        foreach (var p in paneWindows.Where(p => p.Owner == w && !p.IsDisposed)) yield return (p.Id, p);
    }

    public JsonArray ToolWindowsOpen(MainForm w) => new(ToolWindows(w).Select(t => (JsonNode?)t.Kind).ToArray());

    /// <summary>A floating pane's window closed, as by hand (the pane stays floating, or its page decides).</summary>
    public void CloseToolWindow(MainForm w, string kind) { foreach (var (_, f) in ToolWindows(w).Where(t => t.Kind == kind).ToList()) f.Close(); }

    // ---------- The one floating outline for LexPen (docs/plans/24-PLAN-docking.md 3.9, stage 7.3) ----------
    // It serves the windows with no outline in their dock areas, of those the document worked in last: each window's
    // page says whether it may serve it now (outlineWanted: its own outline not docked, its active editor pane without
    // an outline of its own). A window activated that it may serve takes it (outlineServe; the one before:
    // outlineRelease); its title and look then come from that window.

    const string FloatingOutlineId = "outline";
    readonly Dictionary<MainForm, bool> outlineWanted = [];

    PaneForm? FloatingOutline => paneWindows.FirstOrDefault(p => p.Id == FloatingOutlineId && !p.IsDisposed);

    MainForm? OutlineHeir(MainForm leaving) =>
        recent.FirstOrDefault(w => w != leaving && !w.IsDisposed && outlineWanted.GetValueOrDefault(w));

    public void OutlineWanted(MainForm w, bool wants)
    {
        outlineWanted[w] = wants;
        if (wants && recent.FirstOrDefault() == w) ServeOutline(w);
    }

    /// <summary>The floating outline to window `w` (`tell`: its page hears it; not when the page itself asked).</summary>
    void ServeOutline(MainForm w, bool tell = true)
    {
        if (FloatingOutline is not { } outline || outline.Owner == w || w.IsDisposed) return;
        var was = outline.Owner as MainForm;
        outline.SetOwner(w);
        if (was is { IsDisposed: false }) was.Post(new JsonObject { ["event"] = "outlineRelease" });
        if (tell) w.Post(new JsonObject { ["event"] = "outlineServe" });
    }

    public void SavePaneWindow(string kind, int[] bounds)
    {
        (State.PaneWindows ??= [])[kind] = bounds;
        SaveState();
    }

    public void SaveCharPicker(int[] bounds)
    {
        State.CharPicker = bounds;
        SaveState();
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
        // The Windows clipboard's start too (as clipState), for the Clipboards panes (docs/plans/24-PLAN-docking.md 12).
        try { state["previews"]![0] = Clipboard.ContainsText() ? ClipboardStore.Preview(Clipboard.GetText()) : ""; }
        catch (System.Runtime.InteropServices.ExternalException) { }   // the clipboard is busy: as it was
        foreach (var w in windows) w.Post(new JsonObject { ["event"] = "clipboards", ["state"] = state.DeepClone() });
    }

    // ---------- Find history (FindHistory), shared by all windows ----------

    int FindHistoryMax => settings["values"]?["findHistory"]?.GetValueKind() == JsonValueKind.Number
        ? Math.Clamp(settings["values"]!["findHistory"]!.GetValue<int>(), 0, 500) : FindHistory.DefaultMax;

    /// <summary>{ find: [{ text, case, word, regex }], replace: [text] }, newest first.</summary>
    public JsonObject FindHistoryState() => new()
    {
        ["find"] = new JsonArray(State.FindHistory.Take(FindHistoryMax).Select(e => (JsonNode?)new JsonObject
            { ["text"] = e.Text, ["case"] = e.Case, ["word"] = e.Word, ["regex"] = e.Regex }).ToArray()),
        ["replace"] = new JsonArray(State.ReplaceHistory.Take(FindHistoryMax).Select(t => (JsonNode?)t).ToArray()),
    };

    /// <summary>A search done (kind find, with its switches) or a replacement used (kind replace): on top of its list.
    /// Every window gets the lists.</summary>
    public void FindHistoryAdd(string kind, JsonNode entry)
    {
        if (kind == "find")
            State.FindHistory = FindHistory.Push(State.FindHistory, new FindEntry
            {
                Text = entry["text"]?.GetValue<string>() ?? "", Case = entry["case"]?.GetValue<bool>() == true,
                Word = entry["word"]?.GetValue<bool>() == true, Regex = entry["regex"]?.GetValue<bool>() == true,
            }, FindHistoryMax);
        else if (kind == "replace") State.ReplaceHistory = FindHistory.Push(State.ReplaceHistory, entry["text"]?.GetValue<string>() ?? "", FindHistoryMax);
        else throw new ArgumentException($"Unknown history '{kind}'.");
        FindHistoryChanged();
    }

    public void FindHistoryClear(string kind)
    {
        if (kind == "replace") State.ReplaceHistory = []; else State.FindHistory = [];
        FindHistoryChanged();
    }

    void FindHistoryChanged()
    {
        SaveState();
        var lists = FindHistoryState();
        foreach (var w in windows) w.Post(new JsonObject { ["event"] = "findHistory", ["lists"] = lists.DeepClone() });
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
            ["favouriteFolders"] = Entries(favouriteFolders, true),
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

    // Favourite files and folders (kind "files" or "folders"): kept until removed, in your order (added at the end,
    // or put in order by Manage).
    public void FavouriteAdd(string kind, string path) => SetFavourites(kind, RecentList.Append(Favourites(kind), path));
    public void FavouriteRemove(string kind, string path) => SetFavourites(kind, RecentList.Remove(Favourites(kind), path));

    List<string> Favourites(string kind) => kind == "folders" ? favouriteFolders : favourites;

    public void SetFavourites(string kind, List<string> list)
    {
        list = RecentList.Unique(list);
        if (kind == "folders") favouriteFolders = list; else favourites = list;
        Directory.CreateDirectory(DataDir);
        File.WriteAllText(kind == "folders" ? FavouriteFoldersPath : FavouritesPath, JsonSerializer.Serialize(list));
    }

    // ---------- Rename (docs/plans/executed/PLAN-rename.md) ----------

    /// <summary>Renames a file or folder in its folder. What LexPen keeps by path goes along (bookmarks, ruler lines,
    /// highlights, recent files and folders, favourites, the edit locks, the saved sessions), and every window is told
    /// (event "renamed"): its open files in it get the new path. Also the languages and line languages chosen per file. Returns the new path; a refusal, or Windows' reason, is
    /// thrown and nothing has changed.</summary>
    public string Rename(string from, string name)
    {
        if (FileRename.Refusal(from, name) is string why) throw new InvalidOperationException(why);
        var to = FileRename.Target(from, name);
        var folder = Directory.Exists(from);
        if (folder) foreach (var w in windows) w.StopWatching(from);
        try { FileRename.Move(from, to); }
        catch
        {
            if (folder) foreach (var w in windows) w.ResumeWatching();
            throw;
        }
        Bookmarks.Rename(from, to);
        Rulers.Rename(from, to);
        Columns.Rename(from, to);
        Highlights.Rename(from, to);
        foreach (var (key, language) in fileLanguages.ToList())
            if (FileRename.Renamed(key, from, to) is string renamed) { SetFileLanguage(key, null); SetFileLanguage(renamed, language); }
        foreach (var (key, ranges) in FileRangesAll().ToList())
            if (FileRename.Renamed(key, from, to) is string renamed) { var kept = ranges?.DeepClone() as JsonArray; SetFileRanges(key, null); SetFileRanges(renamed, kept); }
        State.RecentFiles = FileRename.Renamed(State.RecentFiles, from, to);
        State.RecentFolders = FileRename.Renamed(State.RecentFolders, from, to);
        State.ClosedFiles = FileRename.Renamed(State.ClosedFiles, from, to);
        SaveState();
        SetFavourites("files", FileRename.Renamed(favourites, from, to));
        SetFavourites("folders", FileRename.Renamed(favouriteFolders, from, to));
        foreach (var key in locks.Keys.ToList())
            if (FileRename.Renamed(key, from, to) is string renamed)
            {
                var list = locks[key];
                locks.Remove(key);
                locks[renamed] = list;
            }
        foreach (var w in projects.Projects.SelectMany(p => p.Windows)) FileRename.RenameIn(w.Session, from, to);
        SaveProjects();
        foreach (var w in windows) w.Post(new JsonObject { ["event"] = "renamed", ["from"] = from, ["to"] = to });
        return to;
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

    // Favourite files and folders: a choice you make, so files next to settings.json (lists of paths).
    static List<string> LoadFavourites(string path)
    {
        try { return JsonSerializer.Deserialize<List<string>>(File.ReadAllText(path)) ?? []; }
        catch { return []; }
    }

    // ---------- Projects (ProjectStore): every window's session, place and desktop ----------

    static string ProjectsPath => DataFolder.StatePath(DataDir, ProjectStore.FileName);
    readonly ProjectStore projects = LoadProjects();
    bool KeepUnnamed => settings["values"]?["keepUnnamedProjects"]?.GetValueKind() != JsonValueKind.False;

    // The first start after projects came: the old session.json (the primary window's) becomes project 1.
    static ProjectStore LoadProjects()
    {
        if (File.Exists(ProjectsPath)) return ProjectStore.Load(ProjectsPath);
        JsonNode? old = null;
        try { old = JsonNode.Parse(File.ReadAllText(SessionPath)); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        var state = LoadState();
        return ProjectStore.Load(ProjectsPath, old, state.Width > 200 ? [state.X, state.Y, state.Width, state.Height] : null, state.Maximized);
    }

    // Saved shortly after a change: changes close together (a window moved, several sessions) are one write.
    readonly System.Windows.Forms.Timer projectsTimer = new() { Interval = 400 };
    bool projectsTimerHooked;

    void SaveProjectsSoon()
    {
        if (!projectsTimerHooked)
        {
            projectsTimerHooked = true;
            projectsTimer.Tick += (_, _) => SaveProjects();
        }
        projectsTimer.Stop();
        projectsTimer.Start();
    }

    void SaveProjects()
    {
        projectsTimer.Stop();
        try { projects.Save(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }   // the next change tries again
        projectsWindow?.Post(new JsonObject { ["event"] = "projects" });   // its list follows, and the docked ones'
        foreach (var frame in toolFrames.Where(f => f.Kind == "projects")) frame.Post(new JsonObject { ["event"] = "projects" });
    }

    /// <summary>A window's session from the page (a second after a change, and when it closes): written at once, the
    /// page has already waited.</summary>
    public void SaveSession(MainForm w, JsonNode data)
    {
        if (projects.WindowOf(w.Key) is not { } entry) return;
        entry.Session = data.DeepClone();
        SaveProjects();
    }

    /// <summary>The window moved, changed size or desktop: kept with its session.</summary>
    public void WindowPlaceChanged(MainForm w)
    {
        ScreenChanged(w);
        if (projects.WindowOf(w.Key) is not { } entry || w.WindowState == FormWindowState.Minimized) return;
        var b = w.WindowState == FormWindowState.Normal ? w.Bounds : w.RestoreBounds;
        int[] bounds = [b.X, b.Y, b.Width, b.Height];
        var maximized = w.WindowState == FormWindowState.Maximized;
        var desktop = VirtualDesktop.DesktopOf(w.Handle) ?? entry.Desktop;
        if (entry.Bounds is not null && entry.Bounds.SequenceEqual(bounds) && entry.Maximized == maximized && entry.Desktop == desktop) return;
        var otherDesktop = entry.Desktop != desktop;
        (entry.Bounds, entry.Maximized, entry.Desktop) = (bounds, maximized, desktop);
        SaveProjectsSoon();
        if (otherDesktop) Restyle();   // another desktop: maybe its default set (docs/plans/executed/PLAN-theme-sets.md, 3.6)
    }

    // A window moved to another desktop by hand (Win+Tab) gives no event: looked at now and then.
    readonly System.Windows.Forms.Timer desktopTimer = new() { Interval = 5000 };
    bool desktopTimerOn;

    void WatchDesktops()
    {
        if (desktopTimerOn) return;
        desktopTimerOn = true;
        desktopTimer.Tick += (_, _) => { foreach (var w in windows) WindowPlaceChanged(w); };
        desktopTimer.Start();
    }

    // The first window to start in this run also gets the drafts that no window of any project names (left by a
    // crash before they were in a session, or by a deleted project).
    bool orphanDraftsGiven;

    /// <summary>What a window opens with: its session and its drafts (see ProjectStore.DraftsOf).</summary>
    public (JsonNode? Session, JsonArray Drafts) StartOf(MainForm w)
    {
        WatchDesktops();
        var entry = projects.WindowOf(w.Key);
        var mine = entry is null ? [] : ProjectStore.DraftsOf(entry).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var named = orphanDraftsGiven ? null : projects.AllDrafts();
        orphanDraftsGiven = true;
        var drafts = new JsonArray(Drafts.LoadAll()
            .Where(d => d!["id"]!.GetValue<string>() is var id && (mine.Contains(id) || named is not null && !named.Contains(id)))
            .Select(d => d!.DeepClone()).ToArray());
        return (entry?.Session?.DeepClone(), drafts);
    }

    /// <summary>The window's project as the page and the title show it.</summary>
    public JsonObject ProjectInfo(MainForm w)
    {
        var p = projects.ProjectOf(w.Key);
        return new JsonObject { ["id"] = p?.Id, ["name"] = p?.Name ?? "", ["display"] = p is null ? "" : ProjectStore.Display(p) };
    }

    // A project renamed, or a window moved to another project: titles and bottom bars follow.
    void ProjectsChanged()
    {
        foreach (var w in windows)
        {
            w.UpdateRole();
            w.Post(new JsonObject { ["event"] = "project", ["project"] = ProjectInfo(w) });
        }
        SaveProjectsSoon();
    }

    /// <summary>Another open window of the same project (the most recently active): where pinned tabs go when this
    /// one closes. Null when there is none.</summary>
    public MainForm? PeerOf(MainForm w)
    {
        var p = projects.ProjectOf(w.Key);
        return recent.FirstOrDefault(o => o != w && projects.ProjectOf(o.Key) == p);
    }

    /// <summary>The Projects menu: every project (newest used first, this window's first), its windows, which are open.
    /// With details (the Manage projects window): also when it was created and last used, its drafts, and per window
    /// the names of its tabs (a file's name, a draft's first line) and which are pinned.</summary>
    public JsonArray ProjectList(MainForm? from, bool details = false)
    {
        var mine = from is null ? null : projects.ProjectOf(from.Key);
        var viewing = FindViewProject();
        var open = windows.ToDictionary(w => w.Key);
        var texts = details ? DraftTexts() : [];
        static IEnumerable<JsonNode> Tabs(ProjectStore.Window w) =>
            (w.Session?["panes"]?.AsArray() ?? []).SelectMany(pane => pane?["tabs"]?.AsArray() ?? []).OfType<JsonNode>();
        JsonObject Window(ProjectStore.Window w)
        {
            var o = new JsonObject
            {
                ["key"] = w.Key, ["open"] = open.ContainsKey(w.Key), ["mine"] = w.Key == from?.Key,
                ["folder"] = (open.TryGetValue(w.Key, out var ow) ? ow.Root : null) ?? w.Session?["root"]?.GetValue<string>(),
                ["tabs"] = Tabs(w).Count(),
            };
            if (details)
                o["files"] = new JsonArray(Tabs(w).Select(t =>
                {
                    var f = t["draft"]?.GetValue<string>() is string id
                        ? new JsonObject { ["draft"] = id, ["name"] = DraftTitle(texts.GetValueOrDefault(id)) }
                        : new JsonObject { ["name"] = Path.GetFileName(t["path"]?.GetValue<string>() ?? ""), ["path"] = t["path"]?.GetValue<string>() };
                    if (t["pinned"]?.GetValueKind() == JsonValueKind.True) f["pinned"] = true;
                    return (JsonNode?)f;
                }).ToArray());
            return o;
        }
        return new JsonArray(projects.Projects.OrderByDescending(p => p == mine).ThenByDescending(p => p.Used).Select(p =>
        {
            var o = new JsonObject
            {
                ["id"] = p.Id, ["name"] = p.Name, ["display"] = ProjectStore.Display(p), ["mine"] = p == mine,
                ["open"] = p.Windows.Any(w => open.ContainsKey(w.Key)),
                ["windows"] = new JsonArray(p.Windows.Select(w => (JsonNode?)Window(w)).ToArray()),
                ["view"] = p == viewing,   // the project for viewing (docs/plans/executed/PLAN-view-window.md)
            };
            if (details)
            {
                o["used"] = p.Used == DateTime.MinValue ? null : p.Used.ToString("o");
                o["created"] = p.Created?.ToString("o");
                o["drafts"] = p.Windows.SelectMany(ProjectStore.DraftsOf).Count(id => !string.IsNullOrWhiteSpace(texts.GetValueOrDefault(id)));
            }
            return (JsonNode?)o;
        }).ToArray());
    }

    // Every draft on disk: id -> text.
    Dictionary<string, string> DraftTexts() => Drafts.LoadAll().OfType<JsonNode>()
        .ToDictionary(d => d["id"]!.GetValue<string>(), d => d["text"]?.GetValue<string>() ?? "", StringComparer.OrdinalIgnoreCase);

    // A draft as a list shows it: its first line that has text.
    static string DraftTitle(string? text) =>
        (text ?? "").Split('\n').Select(l => l.Trim().TrimStart('#').Trim()).FirstOrDefault(l => l.Length > 0) is { } line
            ? (line.Length > 60 ? line[..60] + "..." : line) : "(empty draft)";

    /// <summary>The Projects menu's commands (from: its window; null: the Manage projects window). Windows opened
    /// from it come on the desktop you are on.</summary>
    public void ProjectCommand(MainForm? from, string kind, JsonNode? msg)
    {
        int Id() => msg!["project"]!.GetValue<int>();   // "id" is the call's own number
        string Name() => msg?["name"]?.GetValue<string>() ?? "";
        switch (kind)
        {
            case "open":   // all its windows: the closed ones open, the open ones come to the front
                if (projects.Get(Id()) is not { } p) return;
                MainForm? last = null;
                foreach (var entry in p.Windows.ToList())
                    last = windows.FirstOrDefault(w => w.Key == entry.Key) ?? Open(new MainForm.Start(null, [], entry.Key));
                if (last is null) last = Open(new MainForm.Start(null, []), project: p);   // a named project without windows
                BringToFront(last);
                if (projects.ProjectOf(from?.Key ?? -1) != p) CloseIfEmpty(from, msg);
                break;
            case "window":
                var key = msg!["key"]!.GetValue<int>();
                if ((windows.FirstOrDefault(w => w.Key == key)
                    ?? (projects.WindowOf(key) is not null ? Open(new MainForm.Start(null, [], key)) : from)) is { } shown)
                {
                    BringToFront(shown);
                    if (projects.ProjectOf(shown.Key) != projects.ProjectOf(from?.Key ?? -1)) CloseIfEmpty(from, msg);
                }
                break;
            case "newWindow":
                if (projects.Get(Id()) is { } target) BringToFront(Open(new MainForm.Start(null, []), project: target));
                break;
            case "new":
                BringToFront(Open(new MainForm.Start(null, []), project: projects.NewProject(Name())));
                break;
            case "rename":
                if (from is not null && projects.ProjectOf(from.Key) is { } mine) projects.Rename(mine, Name());
                break;
            case "move":
                var to = msg?["project"] is null ? projects.NewProject(Name()) : projects.Get(Id());
                if (from is not null && to is not null) projects.MoveWindow(from.Key, to, KeepUnnamed);
                break;
            case "delete":
                if (projects.Get(Id()) is { } gone) projects.Delete(gone);
                break;
        }
        ProjectsChanged();
    }

    // Another project's window opened from a window without documents (its page says "empty"): that window goes, as
    // closed by hand. Closed after the request's answer, not inside its WebView2's own event.
    static void CloseIfEmpty(MainForm? from, JsonNode? msg)
    {
        if (from is { IsDisposed: false } && msg?["empty"]?.GetValueKind() == JsonValueKind.True)
            from.BeginInvoke(from.Close);
    }

    // ---------- Manage projects (ProjectsForm; docs/plans/executed/PLAN-manage-projects.md) ----------

    /// <summary>The Manage projects window: one for the app; opened again, brought to the front.</summary>
    public void OpenProjects(MainForm from)
    {
        if (projectsWindow is { IsDisposed: false }) { BringToFront(projectsWindow); return; }
        projectsWindow = new ProjectsForm(this, from);
        projectsWindow.FormClosed += (_, _) => projectsWindow = null;
        projectsWindow.Show(from);
    }

    public void CloseProjectsWindow() => projectsWindow?.Close();

    public void SaveProjectsWindow(int[] bounds)
    {
        State.ProjectsWindow = bounds;
        SaveState();
    }

    /// <summary>A main window closes: the projects window it owns goes to another one, so it stays open.</summary>
    public void ReleaseOwned(MainForm w)
    {
        if (projectsWindow is { IsDisposed: false } pw && pw.Owner == w)
            pw.Owner = recent.FirstOrDefault(o => o != w && !o.IsDisposed);
        if (themeSetsWindow is { IsDisposed: false } tw && tw.Owner == w)
            tw.Owner = recent.FirstOrDefault(o => o != w && !o.IsDisposed);
    }

    public void RenameProject(int id, string name)
    {
        if (projects.Get(id) is not { } p) return;
        projects.Rename(p, name);
        ProjectsChanged();
    }

    /// <summary>Merges the projects into the first one (the first checked): asks first. True when merged.</summary>
    public bool MergeProjects(IWin32Window owner, List<int> ids)
    {
        var list = ids.Select(projects.Get).OfType<ProjectStore.Project>().Distinct().ToList();
        if (list.Count < 2) return false;
        var (to, from) = (list[0], list.Skip(1).ToList());
        var names = from.Select(ProjectStore.Display).ToList();
        var named = names.Count == 1 ? names[0] : string.Join(", ", names[..^1]) + " and " + names[^1];
        var merge = new TaskDialogButton("Merge");
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = $"Merge {list.Count} projects into '{ProjectStore.Display(to)}'?",
            Text = $"Their windows move to '{ProjectStore.Display(to)}'; {named} {(names.Count == 1 ? "is" : "are")} removed.",
            Icon = TaskDialogIcon.Information,
            Buttons = { merge, TaskDialogButton.Cancel },
            DefaultButton = merge,
            AllowCancel = true,
        };
        if (Program.ShowTask(owner, page) != merge) return false;
        projects.Merge(to, from);
        ProjectsChanged();
        return true;
    }

    // What is unsaved in a project: documents (open windows only) and drafts (with text; empty ones apart).
    // Silent: one of its windows did not answer, the project is left alone.
    sealed class Unsaved(ProjectStore.Project project)
    {
        public ProjectStore.Project Project = project;
        public List<string> Documents = [];
        public List<(string Id, string Title)> Drafts = [];
        public List<string> Empty = [];
        public bool Open, Silent;
    }

    async Task<List<Unsaved>> UnsavedOf(List<ProjectStore.Project> list)
    {
        var texts = DraftTexts();
        var result = new List<Unsaved>();
        foreach (var p in list)
        {
            var u = new Unsaved(p);
            foreach (var entry in p.Windows.ToList())
            {
                if (windows.FirstOrDefault(o => o.Key == entry.Key) is not { } w)
                {
                    foreach (var id in ProjectStore.DraftsOf(entry))
                        if (string.IsNullOrWhiteSpace(texts.GetValueOrDefault(id))) u.Empty.Add(id);
                        else u.Drafts.Add((id, DraftTitle(texts[id])));
                    continue;
                }
                u.Open = true;
                if (await Ask(w, "unsavedList") is not JsonObject answer) { u.Silent = true; continue; }
                u.Documents.AddRange(answer["documents"]?.AsArray().Select(n => n!.GetValue<string>()) ?? []);
                foreach (var d in answer["drafts"]?.AsArray() ?? [])
                    u.Drafts.Add((d!["id"]!.GetValue<string>(), d["title"]?.GetValue<string>() ?? ""));
                u.Empty.AddRange(answer["empty"]?.AsArray().Select(n => n!.GetValue<string>()) ?? []);
            }
            u.Documents = u.Documents.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            result.Add(u);
        }
        return result;
    }

    static string Count(int n, string one) => n == 1 ? $"1 {one}" : $"{n} {one}s";

    // The lines of the question: per project what is unsaved, the total, the names under "Show details".
    static (string Lines, string Details) Describe(List<Unsaved> list, bool drafts)
    {
        string What(Unsaved u)
        {
            var parts = new List<string>();
            if (u.Documents.Count > 0) parts.Add(Count(u.Documents.Count, "unsaved document"));
            if (drafts && u.Drafts.Count > 0) parts.Add(Count(u.Drafts.Count, "draft"));
            if (u.Silent) parts.Add("a window does not answer: left alone");
            return parts.Count > 0 ? string.Join(", ", parts) : "nothing unsaved";
        }
        var lines = string.Join("\n", list.Select(u => $"  {ProjectStore.Display(u.Project)}{(u.Open ? " (open)" : "")}: {What(u)}"));
        if (list.Count > 1)
        {
            var totals = new List<string>();
            var documents = list.Sum(u => u.Documents.Count);
            var draftCount = drafts ? list.Sum(u => u.Drafts.Count) : 0;
            if (documents > 0) totals.Add(Count(documents, "unsaved document"));
            if (draftCount > 0) totals.Add(Count(draftCount, "draft"));
            if (totals.Count > 0) lines += "\nTotal: " + string.Join(", ", totals) + ".";
        }
        var details = new System.Text.StringBuilder();
        foreach (var u in list.Where(u => u.Documents.Count > 0 || drafts && u.Drafts.Count > 0))
        {
            details.AppendLine(ProjectStore.Display(u.Project) + ":");
            foreach (var d in u.Documents) details.AppendLine("    " + d);
            if (drafts) foreach (var (_, title) in u.Drafts) details.AppendLine("    Draft: " + title);
        }
        return (lines, details.ToString().TrimEnd());
    }

    // The delete question: "keep" (save the documents, keep the drafts), "documents" (save the documents only),
    // "none" (save nothing), or null (Cancel). The buttons follow what is unsaved.
    static string? DeleteQuestion(IWin32Window owner, List<Unsaved> list)
    {
        var several = list.Count > 1;
        var word = several ? "projects" : "project";
        var documents = list.Sum(u => u.Documents.Count);
        var drafts = list.Sum(u => u.Drafts.Count);
        var (lines, details) = Describe(list, true);
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = several ? $"Delete {list.Count} projects?" : $"Delete the project '{ProjectStore.Display(list[0].Project)}'?",
            Icon = TaskDialogIcon.Warning,
            AllowCancel = true,
        };
        var answers = new Dictionary<TaskDialogButton, string>();
        void Button(string text, string answer)
        {
            var b = new TaskDialogButton(text);
            page.Buttons.Add(b);
            answers[b] = answer;
        }
        const string Untouched = "Saved files are not touched: only the {0} (their windows and tabs) {1} deleted.";
        var untouched = string.Format(Untouched, word, several ? "are" : "is");
        if (documents == 0 && drafts == 0)
        {
            page.Text = lines + "\n\n" + untouched;
            Button("Delete", "none");
        }
        else if (documents == 0)
        {
            page.Text = $"The {word} will be deleted, drafts can be kept in the current window.\n\n" + lines;
            Button($"Keep drafts, then delete {word}", "keep");
            Button($"Delete drafts and {word}", "none");
        }
        else
        {
            page.Text = lines + "\n\n" + untouched;
            if (drafts > 0) Button($"Save documents, keep drafts, then delete {word}", "keep");
            Button($"Save documents only, then delete {word}", "documents");
            Button("Delete without saving", "none");
        }
        page.Buttons.Add(TaskDialogButton.Cancel);
        page.DefaultButton = page.Buttons[0];
        if (details.Length > 0)
            page.Expander = new TaskDialogExpander(details) { CollapsedButtonText = "Show details", ExpandedButtonText = "Hide details" };
        return Program.ShowTask(owner, page) is var result && answers.TryGetValue(result, out var a) ? a : null;
    }

    // The close question, only for unsaved documents (drafts stay with their windows): "save", "discard" or null.
    static string? CloseQuestion(IWin32Window owner, List<Unsaved> list)
    {
        var word = list.Count > 1 ? "projects" : "project";
        var (lines, details) = Describe(list, false);
        var save = new TaskDialogButton($"Save documents, then close");
        var discard = new TaskDialogButton("Close without saving");
        var page = new TaskDialogPage
        {
            Caption = "LexPen",
            Heading = list.Count > 1 ? $"Close {list.Count} projects?" : $"Close the project '{ProjectStore.Display(list[0].Project)}'?",
            Text = lines + $"\n\nDrafts stay with the {word}.",
            Icon = TaskDialogIcon.Warning,
            Buttons = { save, discard, TaskDialogButton.Cancel },
            DefaultButton = save,
            AllowCancel = true,
        };
        if (details.Length > 0)
            page.Expander = new TaskDialogExpander(details) { CollapsedButtonText = "Show details", ExpandedButtonText = "Hide details" };
        var result = Program.ShowTask(owner, page);
        return result == save ? "save" : result == discard ? "discard" : null;
    }

    /// <summary>Manage projects > Close: closes the open windows of the projects (kept in them), after the question
    /// about unsaved documents.</summary>
    public async Task CloseProjects(IWin32Window owner, List<int> ids)
    {
        var list = ids.Select(projects.Get).OfType<ProjectStore.Project>()
            .Where(p => windows.Any(w => projects.ProjectOf(w.Key) == p)).Distinct().ToList();
        if (list.Count == 0) return;
        var unsaved = await UnsavedOf(list);
        var answer = unsaved.Any(u => u.Documents.Count > 0 || u.Silent) ? CloseQuestion(owner, unsaved) : "save";
        if (answer is null) return;
        KeepOneWindow(list);
        foreach (var u in unsaved.Where(u => !u.Silent)) await CloseAll(u.Project, answer);
        ProjectsChanged();
    }

    /// <summary>Manage projects > Delete: after the question, closes the projects' open windows and deletes the
    /// projects; their drafts go to the window last worked in ("keep") or are deleted.</summary>
    public async Task DeleteProjects(IWin32Window owner, List<int> ids)
    {
        var list = ids.Select(projects.Get).OfType<ProjectStore.Project>().Distinct().ToList();
        if (list.Count == 0) return;
        var unsaved = await UnsavedOf(list);
        if (DeleteQuestion(owner, unsaved) is not { } answer) return;
        KeepOneWindow(list);
        List<string> keep = [], drop = [];
        foreach (var u in unsaved.Where(u => !u.Silent))
        {
            if (!await CloseAll(u.Project, answer == "none" ? "discard" : "save")) continue;
            if (projects.Get(u.Project.Id) is { } p) projects.Delete(p);   // closing may have dropped it already
            drop.AddRange(u.Empty);
            (answer == "keep" ? keep : drop).AddRange(u.Drafts.Select(d => d.Id));
        }
        Drafts.Flush();   // the closed windows wrote their drafts
        foreach (var id in drop)
        {
            Drafts.Delete(id);
            Rulers.Set(BookmarkStore.Key(null, id), []);
            Columns.Set(BookmarkStore.Key(null, id), null);
        }
        if (keep.Count > 0 && LastActive is { } target)
        {
            var texts = DraftTexts();
            target.Post(new JsonObject
            {
                ["event"] = "adoptDrafts",
                ["drafts"] = new JsonArray(keep.Where(texts.ContainsKey)
                    .Select(id => (JsonNode?)new JsonObject { ["id"] = id, ["text"] = texts[id] }).ToArray()),
            });
        }
        ProjectsChanged();
    }

    // When every open window is in the projects that close, a new window in a new project opens first: LexPen
    // stays (and kept drafts have a place to go).
    void KeepOneWindow(List<ProjectStore.Project> closing)
    {
        if (windows.All(w => closing.Contains(projects.ProjectOf(w.Key)!)))
            Open(new MainForm.Start(null, []), project: projects.NewProject(""));
    }

    async Task<bool> CloseAll(ProjectStore.Project p, string answer)
    {
        foreach (var w in windows.Where(w => projects.ProjectOf(w.Key) == p).ToList())
            if (!await CloseWith(w, answer)) return false;
        return true;
    }

    // Closes a window with the answer about its unsaved documents already given ("save" or "discard"): its page
    // does not ask again. True when it closed; false when saving failed or was cancelled (the window stays).
    static Task<bool> CloseWith(MainForm w, string answer)
    {
        var done = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        w.FormClosed += (_, _) => done.TrySetResult(true);
        w.CloseCancelled = () => { w.CloseAnswer = null; done.TrySetResult(false); };
        w.CloseAnswer = answer;
        w.Close();
        return done.Task;
    }

    // ---------- Questions to a window's page, answered later (op "answer") ----------
    readonly Dictionary<int, TaskCompletionSource<JsonNode?>> asks = [];
    int lastAsk;

    // Null when the page does not answer within a few seconds.
    async Task<JsonNode?> Ask(MainForm w, string ev)
    {
        var id = ++lastAsk;
        var answer = new TaskCompletionSource<JsonNode?>(TaskCreationOptions.RunContinuationsAsynchronously);
        asks[id] = answer;
        w.Post(new JsonObject { ["event"] = ev, ["ask"] = id });
        var first = await Task.WhenAny(answer.Task, Task.Delay(5000));
        asks.Remove(id);
        return first == answer.Task ? answer.Task.Result : null;
    }

    public void Answer(int ask, JsonNode? result)
    {
        if (asks.Remove(ask, out var answer)) answer.TrySetResult(result?.DeepClone());
    }

    static JsonArray ToArray(IEnumerable<string> items) => new(items.Select(i => (JsonNode?)i).ToArray());
}
