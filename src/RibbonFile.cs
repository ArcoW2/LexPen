using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// ribbon.json: the ribbon's tabs, groups and buttons (docs/plans/executed/PLAN-ribbon.md). The one in defaults is the shipped
/// ribbon; a ribbon.json in the data folder, written when the user changes the ribbon, replaces it whole. Comments and
/// trailing commas are allowed. Reading keeps what makes sense and reports the rest: a tab without a name or groups, a
/// group without items, an item that is not "divider" or { action, ... } is left out; an action LexPen does not know
/// is the page's to skip (the host does not know the actions).
/// </summary>
static class RibbonFile
{
    public const string Name = "ribbon.json";

    static readonly JsonDocumentOptions Options = new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };

    /// <summary>{ ribbon: { tabs }, user: the user's own file is in use, problems: [...] }. A user file that cannot be
    /// read gives the shipped ribbon and says so. Yours without the previewer's tab (written before it was shipped, or
    /// it taken off by hand) gets the shipped one at its end: the previewer has no other commands
    /// (docs/plans/PLAN-preview-handler.md 3.11).</summary>
    public static JsonObject Load(string dataDir, string shippedPath)
    {
        var problems = new JsonArray();
        var userPath = Path.Combine(dataDir, Name);
        var shipped = File.Exists(shippedPath) ? Parse(ReadText(shippedPath), problems, "the shipped " + Name) : null;
        if (File.Exists(userPath))
        {
            var mine = Parse(ReadText(userPath), problems, "your " + Name);
            if (mine is not null)
            {
                var tabs = mine["tabs"]!.AsArray();
                if (!tabs.Any(IsPreviewerTab))
                    foreach (var tab in shipped?["tabs"]!.AsArray().Where(IsPreviewerTab) ?? []) tabs.Add(tab!.DeepClone());
                return new JsonObject { ["ribbon"] = mine, ["user"] = true, ["problems"] = problems };
            }
        }
        return new JsonObject { ["ribbon"] = shipped ?? new JsonObject { ["tabs"] = new JsonArray() }, ["user"] = false, ["problems"] = problems };
    }

    /// <summary>The tab the previewer shows, and only it ("previewer": true).</summary>
    static bool IsPreviewerTab(JsonNode? tab) => tab?["previewer"]?.GetValueKind() == JsonValueKind.True;

    static string ReadText(string path)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { return File.ReadAllText(path); }
            catch (IOException) when (attempt < 4) { Thread.Sleep(50); }   // being saved
        }
    }

    /// <summary>The ribbon of a text, cleaned; null when it is no JSON object with tabs.</summary>
    public static JsonObject? Parse(string text, JsonArray problems, string source)
    {
        JsonNode? root;
        try { root = JsonNode.Parse(text, documentOptions: Options); }
        catch (JsonException ex)
        {
            problems.Add($"{source}: {ex.Message}");
            return null;
        }
        if (root?["tabs"] is not JsonArray tabs)
        {
            problems.Add($"{source}: it must hold {{ \"tabs\": [ ... ] }}.");
            return null;
        }
        var clean = new JsonArray();
        foreach (var tab in tabs)
        {
            var name = tab?["name"]?.GetValueKind() == JsonValueKind.String ? tab["name"]!.GetValue<string>().Trim() : "";
            if (name.Length == 0 || tab!["groups"] is not JsonArray groups)
            {
                problems.Add($"{source}: a tab needs a name and its groups.");
                continue;
            }
            var cleanGroups = new JsonArray();
            foreach (var group in groups)
            {
                if (group?["items"] is not JsonArray items || group["name"]?.GetValueKind() != JsonValueKind.String)
                {
                    problems.Add($"{source}: tab \"{name}\": a group needs a name and its items.");
                    continue;
                }
                var cleanItems = new JsonArray();
                foreach (var item in items)
                {
                    if (item?.GetValueKind() == JsonValueKind.String && item.GetValue<string>() == "divider") cleanItems.Add("divider");
                    else if (item is JsonObject o && o["action"]?.GetValueKind() == JsonValueKind.String) cleanItems.Add(o.DeepClone());
                    else problems.Add($"{source}: group \"{group["name"]}\": an item must be \"divider\" or {{ \"action\": ... }}.");
                }
                var g = new JsonObject { ["name"] = group["name"]!.GetValue<string>(), ["items"] = cleanItems };
                if (group["corners"] is JsonObject corners) g["corners"] = corners.DeepClone();
                cleanGroups.Add(g);
            }
            var cleanTab = new JsonObject { ["name"] = name, ["groups"] = cleanGroups };
            if (IsPreviewerTab(tab)) cleanTab["previewer"] = true;
            if (tab["rows"]?.GetValueKind() == JsonValueKind.Number && tab["rows"]!.GetValue<double>() is 1 or 2 or 3) cleanTab["rows"] = (int)tab["rows"]!.GetValue<double>();
            clean.Add(cleanTab);
        }
        return new JsonObject { ["tabs"] = clean };
    }

    /// <summary>The user's ribbon written (the change mode's changes), indented.</summary>
    public static void Save(string dataDir, JsonNode ribbon)
    {
        Directory.CreateDirectory(dataDir);
        var text = "// Your ribbon (LexPen writes it when you change the ribbon; Reset removes it). See defaults\\ribbon.json.\n" +
            ribbon.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n";
        File.WriteAllText(Path.Combine(dataDir, Name), text);
    }

    /// <summary>Reset: the user's ribbon.json removed, so the shipped one is used again.</summary>
    public static void Reset(string dataDir)
    {
        var path = Path.Combine(dataDir, Name);
        if (File.Exists(path)) File.Delete(path);
    }
}
