namespace LexPen;

/// <summary>
/// The project for comparing (docs/plans/executed/PLAN-compare-project.md): a compare from Explorer (and --compare) opens
/// there. It is the project the setting compareProject names: its id, -1 the project for viewing, else the one named
/// "Compare" (AppHost makes it on the first compare). As the project for viewing, opening a file never lands in it and
/// its windows are not restored at start. Pure, so it can be tested without windows.
/// </summary>
static class CompareProject
{
    public const string Name = "Compare";

    /// <summary>The setting's value for "the same project as for viewing".</summary>
    public const int SameAsViewing = -1;

    /// <summary>The project for comparing: <paramref name="view"/> (the project for viewing) when <paramref name="id"/>
    /// (the setting) is SameAsViewing, else the one with that id, else the one named "Compare"; null when there is none
    /// (yet).</summary>
    public static ProjectStore.Project? Find(ProjectStore store, int id, ProjectStore.Project? view) =>
        id == SameAsViewing ? view : (id > 0 ? store.Get(id) : null) ?? store.Projects.FirstOrDefault(p => p.Name == Name);

    /// <summary>
    /// A file and a folder to compare (docs/plans/executed/PLAN-explorer-compare-two.md 3.2): the file against the folder's
    /// file of the same name, the file keeping its side. Two files or two folders, or anything else: as given, no
    /// message. A file and a folder without that file, or with the file itself in it: no pair, and the message why.
    /// </summary>
    public static (string[]? Pair, string? Message) FileInFolder(IReadOnlyList<string> paths)
    {
        if (paths.Count != 2) return ([.. paths], null);
        var fileFirst = File.Exists(paths[0]) && Directory.Exists(paths[1]);
        if (!fileFirst && !(Directory.Exists(paths[0]) && File.Exists(paths[1]))) return ([.. paths], null);
        string file = fileFirst ? paths[0] : paths[1], folder = fileFirst ? paths[1] : paths[0], name = Path.GetFileName(file);
        var match = Path.Combine(folder, name);
        if (!File.Exists(match)) return (null, $"{folder} has no {name}.");
        if (string.Equals(Path.GetFullPath(match), Path.GetFullPath(file), StringComparison.OrdinalIgnoreCase))
            return (null, $"{name} is in {folder} itself: choose another folder to compare it with.");
        return (fileFirst ? [file, match] : [match, file], null);
    }
}
