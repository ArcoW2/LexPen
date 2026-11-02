using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The project for viewing (docs/plans/executed/PLAN-view-window.md): View in LexPen opens files and folders there. It is the
/// project the setting viewProject names (its id), else the one named "View" (AppHost makes it on the first view). A
/// normal project otherwise: what you change there is kept. Its layout to start with, and what Reset to view layout
/// gives it, is the view layout: the default layout with the sidebar, the outline, the format bar and the ruler off, one
/// pane, every tab in Preview. Pure, so it can be tested without windows.
/// </summary>
static class ViewProject
{
    public const string Name = "View";

    /// <summary>The project for viewing: the one with id <paramref name="id"/> (the setting), else the one named
    /// "View"; null when there is none (yet).</summary>
    public static ProjectStore.Project? Find(ProjectStore store, int id) =>
        (id > 0 ? store.Get(id) : null) ?? store.Projects.FirstOrDefault(p => p.Name == Name);

    // What the view layout turns off, over the default layout.
    static readonly string[] Off = ["sidebar", "outline", "outline2", "formatBar", "ruler"];

    /// <summary>The view layout: the shipped default layout with yours over it (a value of the shipped kind), and the
    /// side panes, the outline, the format bar and the ruler off; the docking the shipped one (docs/plans/24-PLAN-docking.md
    /// 3.12: no pane of yours docked or floating there).</summary>
    public static JsonObject Layout(JsonObject? shipped, JsonObject? mine)
    {
        var layout = (JsonObject?)shipped?.DeepClone() ?? new JsonObject();
        foreach (var (name, value) in mine ?? [])
            if (name != "docks" && layout[name] is JsonNode standard && value is not null && Kind(value) == Kind(standard))
                layout[name] = value.DeepClone();
        foreach (var name in Off) layout[name] = false;
        return layout;
    }

    static string Kind(JsonNode node) => node.GetValueKind() is System.Text.Json.JsonValueKind.True or System.Text.Json.JsonValueKind.False
        ? "bool" : node.GetValueKind().ToString();

    /// <summary>A window's session in the view layout: <paramref name="layout"/>, one pane (the second pane's tabs after
    /// the first's, a file or draft there once), every tab in Preview, no compare, no hidden pane, no scrolling
    /// together. Its tabs and folder stay.</summary>
    public static JsonObject ToViewLayout(JsonNode? session, JsonObject layout)
    {
        var s = session?.DeepClone() as JsonObject ?? new JsonObject();
        var panes = s["panes"] as JsonArray ?? [];
        var first = panes.FirstOrDefault()?.DeepClone() as JsonObject ?? new JsonObject();
        var tabs = new JsonArray();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var tab in panes.SelectMany(p => p?["tabs"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var id = tab["path"]?.GetValue<string>() ?? tab["draft"]?.GetValue<string>() ?? "";
            if (id.Length > 0 && !seen.Add(id)) continue;
            var copy = (JsonObject)tab.DeepClone();
            copy["mode"] = "preview";
            tabs.Add(copy);
        }
        first["tabs"] = tabs;
        if (first["active"]?.GetValue<int>() is not int active || active < 0 || active >= tabs.Count) first["active"] = tabs.Count > 0 ? 0 : -1;
        s["panes"] = new JsonArray(first);
        s["layout"] = layout.DeepClone();
        s["activePane"] = 0;
        foreach (var name in new[] { "hidden", "sync", "syncGap", "compare", "folderCompare" }) s.Remove(name);
        return s;
    }
}
