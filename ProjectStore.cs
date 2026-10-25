using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// Projects (docs/plans/executed/PLAN-window-sessions.md): a project has a number, a name you can give it and
/// windows; a window keeps its session (the page's folder, tabs, panes, cursor), its place and its virtual desktop.
/// Kept in State\projects.json, written whole and atomically (a crash never leaves a broken file). Pure apart from
/// that file, so the rules can be tested without windows.
/// </summary>
sealed class ProjectStore
{
    public const string FileName = "projects.json";

    public sealed class Project
    {
        public int Id;
        public string Name = "";
        public DateTime Used;
        public DateTime? Created;        // null: made before LexPen kept it (the id order is the creation order)
        public List<Window> Windows = [];
    }

    public sealed class Window
    {
        public int Key;
        public bool Open;
        public JsonNode? Session;
        public int[]? Bounds;            // x, y, width, height
        public bool Maximized;
        public string? Desktop;
        public DateTime Used;
    }

    readonly string path;
    public List<Project> Projects { get; } = [];
    int nextProject = 1, nextWindow = 1;

    ProjectStore(string path) => this.path = path;

    /// <summary>Reads the file. Without one, the old session.json (the primary window's) becomes project 1 with one
    /// open window, at the old window place.</summary>
    public static ProjectStore Load(string path, JsonNode? legacySession = null, int[]? legacyBounds = null, bool legacyMaximized = false)
    {
        var store = new ProjectStore(path);
        JsonObject? root = null;
        try { root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        if (root is null)
        {
            if (legacySession is not null)
            {
                var p = store.NewProject("");
                var w = store.AddWindow(p);
                w.Session = legacySession.DeepClone();
                (w.Bounds, w.Maximized) = (legacyBounds, legacyMaximized);
            }
            return store;
        }
        store.nextProject = root["nextProject"]?.GetValue<int>() ?? 1;
        store.nextWindow = root["nextWindow"]?.GetValue<int>() ?? 1;
        foreach (var pn in root["projects"]?.AsArray() ?? [])
        {
            if (pn is not JsonObject po) continue;
            var p = new Project
            {
                Id = po["id"]?.GetValue<int>() ?? store.nextProject++,
                Name = po["name"]?.GetValue<string>() ?? "",
                Used = Time(po["used"]),
                Created = po["created"] is null ? null : Time(po["created"]),
            };
            foreach (var wn in po["windows"]?.AsArray() ?? [])
            {
                if (wn is not JsonObject wo) continue;
                p.Windows.Add(new Window
                {
                    Key = wo["key"]?.GetValue<int>() ?? store.nextWindow++,
                    Open = wo["open"]?.GetValue<bool>() ?? false,
                    Session = wo["session"]?.DeepClone(),
                    Bounds = wo["bounds"] is JsonArray b && b.Count == 4 ? b.Select(v => v!.GetValue<int>()).ToArray() : null,
                    Maximized = wo["maximized"]?.GetValue<bool>() ?? false,
                    Desktop = wo["desktop"]?.GetValue<string>(),
                    Used = Time(wo["used"]),
                });
            }
            store.Projects.Add(p);
        }
        store.nextProject = Math.Max(store.nextProject, store.Projects.Select(p => p.Id + 1).DefaultIfEmpty(1).Max());
        store.nextWindow = Math.Max(store.nextWindow, store.Projects.SelectMany(p => p.Windows).Select(w => w.Key + 1).DefaultIfEmpty(1).Max());
        return store;
    }

    static DateTime Time(JsonNode? n) =>
        n?.GetValueKind() == JsonValueKind.String && DateTime.TryParse(n.GetValue<string>(), null, System.Globalization.DateTimeStyles.RoundtripKind, out var t) ? t : DateTime.MinValue;

    /// <summary>Writes the whole file: first to a temporary file, then that one replaces the old file.</summary>
    public void Save()
    {
        var root = new JsonObject
        {
            ["nextProject"] = nextProject,
            ["nextWindow"] = nextWindow,
            ["projects"] = new JsonArray(Projects.Select(p => (JsonNode?)new JsonObject
            {
                ["id"] = p.Id, ["name"] = p.Name, ["used"] = p.Used.ToString("o"), ["created"] = p.Created?.ToString("o"),
                ["windows"] = new JsonArray(p.Windows.Select(w => (JsonNode?)new JsonObject
                {
                    ["key"] = w.Key, ["open"] = w.Open, ["session"] = w.Session?.DeepClone(),
                    ["bounds"] = w.Bounds is null ? null : new JsonArray(w.Bounds.Select(v => (JsonNode?)v).ToArray()),
                    ["maximized"] = w.Maximized, ["desktop"] = w.Desktop, ["used"] = w.Used.ToString("o"),
                }).ToArray()),
            }).ToArray()),
        };
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";
        File.WriteAllText(temp, root.ToJsonString());
        File.Move(temp, path, overwrite: true);
    }

    // ---------- Projects and windows ----------

    public static string Display(Project p) => p.Name.Length > 0 ? p.Name : $"Project {p.Id}";

    public Project NewProject(string name)
    {
        var now = DateTime.UtcNow;
        var p = new Project { Id = nextProject++, Name = name.Trim(), Used = now, Created = now };
        Projects.Add(p);
        return p;
    }

    /// <summary>A new, open window in the project.</summary>
    public Window AddWindow(Project p)
    {
        var w = new Window { Key = nextWindow++, Open = true, Used = DateTime.UtcNow };
        p.Windows.Add(w);
        return w;
    }

    public Project? ProjectOf(int key) => Projects.FirstOrDefault(p => p.Windows.Any(w => w.Key == key));
    public Window? WindowOf(int key) => Projects.SelectMany(p => p.Windows).FirstOrDefault(w => w.Key == key);
    public Project? Get(int id) => Projects.FirstOrDefault(p => p.Id == id);

    /// <summary>The window has files: tabs in its session (drafts too).</summary>
    public static bool HasFiles(Window w) =>
        (w.Session?["panes"]?.AsArray() ?? []).Any(pane => (pane?["tabs"]?.AsArray().Count ?? 0) > 0);

    /// <summary>The drafts in the window's tabs.</summary>
    public static IEnumerable<string> DraftsOf(Window w) =>
        (w.Session?["panes"]?.AsArray() ?? []).SelectMany(pane => pane?["tabs"]?.AsArray() ?? [])
            .Select(t => t?["draft"]?.GetValue<string>()).OfType<string>();

    /// <summary>Every draft named in a window of a project, open or closed.</summary>
    public HashSet<string> AllDrafts() =>
        Projects.SelectMany(p => p.Windows).SelectMany(DraftsOf).ToHashSet(StringComparer.OrdinalIgnoreCase);

    public void Touch(int key)
    {
        var now = DateTime.UtcNow;
        if (WindowOf(key) is { } w) w.Used = now;
        if (ProjectOf(key) is { } p) p.Used = now;
    }

    public void Rename(Project p, string name) => p.Name = name.Trim();

    /// <summary>Deletes a project without open windows. Its drafts stay on disk (they come back in a window at the
    /// next start, so nothing unsaved is lost).</summary>
    public bool Delete(Project p)
    {
        if (p.Windows.Any(w => w.Open)) return false;
        Projects.Remove(p);
        return true;
    }

    /// <summary>
    /// A window closed by hand while LexPen goes on (other windows open). Another open window of its project: this
    /// window is forgotten (its pinned tabs went there). The last open window of its project: the project is closed
    /// and keeps this window for when it is opened again, unless it has no files. Then the project's own rules
    /// (DropIfUnwanted).
    /// </summary>
    public void CloseByHand(int key, bool keepUnnamed)
    {
        if (ProjectOf(key) is not { } p || WindowOf(key) is not { } w) return;
        var others = p.Windows.Any(o => o != w && o.Open);
        if (others || !HasFiles(w)) p.Windows.Remove(w);
        else (w.Open, w.Used) = (false, DateTime.UtcNow);   // Used: when it closed (LastClosedOn)
        if (!others) DropIfUnwanted(p, keepUnnamed);
    }

    /// <summary>
    /// A window closed with its whole project (Manage projects > Close): unlike CloseByHand it is kept also while
    /// other windows of the project are still open (they close next), unless it has no files. When it was the last
    /// open one: the project's own rules (DropIfUnwanted).
    /// </summary>
    public void CloseWithProject(int key, bool keepUnnamed)
    {
        if (ProjectOf(key) is not { } p || WindowOf(key) is not { } w) return;
        if (!HasFiles(w)) p.Windows.Remove(w);
        else (w.Open, w.Used) = (false, DateTime.UtcNow);
        if (!p.Windows.Any(o => o.Open)) DropIfUnwanted(p, keepUnnamed);
    }

    /// <summary>Merges projects into one: their windows (open and closed, each with its session and drafts) move to
    /// <paramref name="to"/>, which keeps its name; the projects left empty go.</summary>
    public void Merge(Project to, IEnumerable<Project> from)
    {
        foreach (var p in from.Where(p => p != to).ToList())
        {
            to.Windows.AddRange(p.Windows);
            p.Windows.Clear();
            Projects.Remove(p);
        }
        to.Used = DateTime.UtcNow;
    }

    /// <summary>Forgets a window (a new one that turned out to be another project's, AppHost.Open); its project per
    /// DropIfUnwanted.</summary>
    public void Forget(int key, bool keepUnnamed)
    {
        if (ProjectOf(key) is not { } p || WindowOf(key) is not { } w) return;
        p.Windows.Remove(w);
        DropIfUnwanted(p, keepUnnamed);
    }

    /// <summary>The project whose window was closed last on this virtual desktop (its windows all closed): what a
    /// launch on a desktop without a LexPen window opens again. Null when there is none, or the desktop is unknown.</summary>
    public Project? LastClosedOn(string? desktop) =>
        desktop is null ? null : Projects
            .Where(p => !p.Windows.Any(w => w.Open))
            .SelectMany(p => p.Windows.Where(w => w.Desktop == desktop).Select(w => (Project: p, Window: w)))
            .OrderByDescending(o => o.Window.Used).Select(o => o.Project).FirstOrDefault();

    /// <summary>Moves the window to another project; the old project, left without windows: per DropIfUnwanted.</summary>
    public void MoveWindow(int key, Project to, bool keepUnnamed)
    {
        if (ProjectOf(key) is not { } from || from == to || WindowOf(key) is not { } w) return;
        from.Windows.Remove(w);
        to.Windows.Add(w);
        to.Used = DateTime.UtcNow;
        if (!from.Windows.Any(o => o.Open)) DropIfUnwanted(from, keepUnnamed);
    }

    /// <summary>A project without open windows: a named one stays; an unnamed one goes when none of its windows has
    /// files, or always when unnamed projects are not kept.</summary>
    public void DropIfUnwanted(Project p, bool keepUnnamed)
    {
        if (p.Name.Length > 0 || p.Windows.Any(w => w.Open)) return;
        if (!keepUnnamed || !p.Windows.Any(HasFiles)) Projects.Remove(p);
    }

    /// <summary>
    /// At start: the windows that were open, to open again. A window without files only comes back as the one LexPen
    /// window of its desktop (the most recently used of those); the others are forgotten, and unnamed projects left
    /// without anything are dropped.
    /// </summary>
    public List<(Project Project, Window Window)> StartWindows(bool keepUnnamed)
    {
        var open = Projects.SelectMany(p => p.Windows.Where(w => w.Open).Select(w => (Project: p, Window: w))).ToList();
        var keep = new List<(Project, Window)>();
        foreach (var desktop in open.GroupBy(o => o.Window.Desktop ?? ""))
        {
            var withFiles = desktop.Where(o => HasFiles(o.Window)).ToList();
            keep.AddRange(withFiles.Count > 0 ? withFiles : [desktop.MaxBy(o => o.Window.Used)]);
        }
        foreach (var (p, w) in open.Where(o => !keep.Contains(o)))
        {
            p.Windows.Remove(w);
            DropIfUnwanted(p, keepUnnamed);
        }
        return keep.OrderBy(o => o.Item2.Key).ToList();
    }
}
