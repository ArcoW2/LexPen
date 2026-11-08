using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// Rename a file or folder in its own folder (docs/plans/executed/PLAN-rename.md): the new name checked, the rename on
/// disk, and the paths of it and below it mapped to the new name (what LexPen keeps by path goes along).
/// </summary>
static class FileRename
{
    /// <summary>Why `name` cannot be the new name of `from`, or null when it can.</summary>
    public static string? Refusal(string from, string name)
    {
        if (name.Length == 0) return "A name cannot be empty.";
        if (name.IndexOfAny(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) >= 0) return "A name cannot hold \\ / : * ? \" < > |";
        if (name.EndsWith('.') || name.EndsWith(' ')) return "A name cannot end with a dot or a space.";
        if (Path.GetDirectoryName(from.TrimEnd('\\')) is null) return "A drive cannot be renamed.";
        var to = Target(from, name);
        if (!string.Equals(to, from, StringComparison.OrdinalIgnoreCase) && Path.Exists(to)) return $"\"{name}\" already exists in that folder.";
        return null;
    }

    /// <summary>The new path: `name` in the folder of `from`.</summary>
    public static string Target(string from, string name) => Path.Combine(Path.GetDirectoryName(from.TrimEnd('\\'))!, name);

    /// <summary>Renames on disk; Windows' reason is thrown when it refuses (in use, no rights). A folder whose name
    /// only changes case goes through a name of its own on the way.</summary>
    public static void Move(string from, string to)
    {
        if (File.Exists(from)) File.Move(from, to);
        else if (!Directory.Exists(from)) throw new IOException($"\"{Path.GetFileName(from)}\" is not there any more.");
        else if (!string.Equals(from, to, StringComparison.OrdinalIgnoreCase)) Directory.Move(from, to);
        else
        {
            var between = to + "." + Guid.NewGuid().ToString("N")[..8];
            Directory.Move(from, between);
            Directory.Move(between, to);
        }
    }

    /// <summary>The path after `from` became `to`: `from` itself, or a path inside it (at any depth) with the rest
    /// kept; null for any other path. Not case sensitive.</summary>
    public static string? Renamed(string? path, string from, string to)
    {
        if (path is null) return null;
        from = from.TrimEnd('\\');
        if (string.Equals(path, from, StringComparison.OrdinalIgnoreCase)) return to;
        return path.Length > from.Length && path[from.Length] == '\\' && path.StartsWith(from, StringComparison.OrdinalIgnoreCase)
            ? to + path[from.Length..] : null;
    }

    /// <summary>A list of paths (recent, favourites) with the renamed ones in their place.</summary>
    public static List<string> Renamed(List<string> list, string from, string to) => list.Select(p => Renamed(p, from, to) ?? p).ToList();

    /// <summary>Every string in the JSON (a saved session) that is such a path, renamed in place.</summary>
    public static void RenameIn(JsonNode? node, string from, string to)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (var (key, value) in obj.ToList())
                    if (value is JsonValue v && v.TryGetValue(out string? s)) { if (Renamed(s, from, to) is string n) obj[key] = n; }
                    else RenameIn(value, from, to);
                break;
            case JsonArray array:
                for (var i = 0; i < array.Count; i++)
                    if (array[i] is JsonValue v && v.TryGetValue(out string? s)) { if (Renamed(s, from, to) is string n) array[i] = n; }
                    else RenameIn(array[i], from, to);
                break;
        }
    }
}
