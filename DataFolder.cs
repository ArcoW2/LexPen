using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The data folder (%LOCALAPPDATA%\LexPen, or LEXPEN_DATA): your settings at the top (settings.json, keys.json,
/// favourites.json, tab-colours.json), what LexPen remembers by itself in State\ (state.json, session.json,
/// clipboards.json, bookmarks.json, Drafts\, EBWebView\). <see cref="Migrate"/> moves an older layout over once;
/// whatever cannot be moved yet (a file in use) is used where it is and moved at a later start.
/// </summary>
static class DataFolder
{
    public const string StateName = "State";
    // The older settings.json held window position, recent lists, favourites and the theme.
    static readonly string[] OldSettingsNames = ["X", "RecentFiles", "FavouriteFiles", "Theme"];
    static readonly string[] StateFiles = ["session.json", "clipboards.json", "bookmarks.json"];
    static readonly string[] StateFolders = ["Drafts", "EBWebView"];

    public static string StateDir(string dataDir) => Path.Combine(dataDir, StateName);

    /// <summary>Where a state file or folder is: in State\, or still at the top when it could not be moved yet.</summary>
    public static string StatePath(string dataDir, string name)
    {
        var moved = Path.Combine(StateDir(dataDir), name);
        var old = Path.Combine(dataDir, name);
        return !File.Exists(moved) && !Directory.Exists(moved) && (File.Exists(old) || Directory.Exists(old)) ? old : moved;
    }

    /// <summary>Moves an older layout into this one. Runs in the first LexPen process, before any window.</summary>
    public static void Migrate(string dataDir)
    {
        var state = StateDir(dataDir);
        try { Directory.CreateDirectory(state); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return; }

        SplitOldSettings(dataDir);
        foreach (var name in StateFiles) Move(Path.Combine(dataDir, name), Path.Combine(state, name), folder: false);
        foreach (var name in StateFolders) Move(Path.Combine(dataDir, name), Path.Combine(state, name), folder: true);
    }

    static void Move(string from, string to, bool folder)
    {
        try
        {
            if (folder ? !Directory.Exists(from) || Directory.Exists(to) : !File.Exists(from) || File.Exists(to)) return;
            if (folder) Directory.Move(from, to);   // same disk: a rename, the contents stay as they are
            else File.Move(from, to);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }   // in use: next start
    }

    // The older settings.json: window and lists to State\state.json, favourites to favourites.json, the theme
    // stays as the only setting in a new settings.json. The old file is kept as State\settings-before-move.json.
    static void SplitOldSettings(string dataDir)
    {
        var path = Path.Combine(dataDir, SettingsFile.Name);
        var statePath = Path.Combine(StateDir(dataDir), "state.json");
        JsonObject old;
        try
        {
            if (!File.Exists(path) || File.Exists(statePath)) return;
            if (JsonNode.Parse(File.ReadAllText(path)) is not JsonObject o || !OldSettingsNames.Any(o.ContainsKey)) return;
            old = o;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { return; }

        var stateObj = new JsonObject();
        foreach (var name in new[] { "X", "Y", "Width", "Height", "Maximized", "RecentFiles", "RecentFolders", "ClosedFiles" })
            if (old[name] is JsonNode v) stateObj[name] = v.DeepClone();
        var favouritesPath = Path.Combine(dataDir, FavouritesName);
        var settings = new JsonObject();
        if (old["Theme"]?.GetValue<string>() is "dark") settings["theme"] = "dark";
        try
        {
            File.Copy(path, Path.Combine(StateDir(dataDir), "settings-before-move.json"), true);
            File.WriteAllText(statePath, stateObj.ToJsonString());
            if (!File.Exists(favouritesPath))
                File.WriteAllText(favouritesPath, (old["FavouriteFiles"]?.DeepClone() ?? new JsonArray()).ToJsonString());
            File.WriteAllText(path, settings.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    public const string FavouritesName = "favourites.json";
}
