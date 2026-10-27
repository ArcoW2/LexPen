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
}
