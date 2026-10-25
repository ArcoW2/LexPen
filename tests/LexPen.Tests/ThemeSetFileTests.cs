using System.Text.Json.Nodes;

namespace LexPen.Tests;

// Theme sets (ThemeSetFile, docs/plans/executed/PLAN-theme-sets.md).
public class ThemeSetFileTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-sets-" + Guid.NewGuid().ToString("N"));
    string FilePath => Path.Combine(dir, ThemeSetFile.FileName);

    public ThemeSetFileTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static ThemeSetFile.Data WithCompany()
    {
        var data = new ThemeSetFile.Data();
        data.Sets.Add(ThemeSetFile.Make("Company", new JsonObject { ["themeDark"] = "dark-ocean", ["wrap"] = false, ["highlightIntensity"] = 80 }));
        return data;
    }

    [Fact]
    public void ASetHoldsOnlyTheLookAndGoesRoundTheFile()
    {
        var data = WithCompany();
        Assert.False(data.Sets[0].Values.ContainsKey("wrap"));   // not a setting of a set
        data.App = "Company";
        data.Desktops["{abc}"] = "Company";
        ThemeSetFile.Save(FilePath, data);
        var again = ThemeSetFile.Load(FilePath);
        Assert.Equal("Company", again.App);
        Assert.Equal("Company", again.Desktops["{abc}"]);
        Assert.Equal("dark-ocean", again.Get("company")!.Values["themeDark"]!.GetValue<string>());
        Assert.Equal(80, again.Sets[0].Values["highlightIntensity"]!.GetValue<int>());
    }

    [Fact]
    public void AFileThatIsNotThereIsTheDefaultOnly()
    {
        var data = ThemeSetFile.Load(FilePath);
        Assert.Equal(ThemeSetFile.Default, data.App);
        Assert.Empty(data.Sets);
        Assert.Equal(ThemeSetFile.Default, ThemeSetFile.Resolve(data, null, null));
    }

    [Fact]
    public void AFileNamingSetsThatAreGoneFallsBack()
    {
        File.WriteAllText(FilePath, """{ "app": "Gone", "desktops": { "{a}": "Gone" }, "sets": [ { "name": "Default", "values": {} } ] }""");
        var data = ThemeSetFile.Load(FilePath);
        Assert.Equal(ThemeSetFile.Default, data.App);
        Assert.Empty(data.Desktops);
        Assert.Empty(data.Sets);   // "Default" is settings.json, not a set in the file
    }

    [Fact]
    public void TheProjectsSetOverTheDesktopsOverTheApps()
    {
        var data = WithCompany();
        data.Sets.Add(ThemeSetFile.Make("Private", new JsonObject()));
        data.Desktops["{work}"] = "Company";
        data.App = "Private";
        Assert.Equal("Company", ThemeSetFile.Resolve(data, "Company", null));
        Assert.Equal("Private", ThemeSetFile.Resolve(data, "private", "{work}"));   // a project's set always wins
        Assert.Equal("Company", ThemeSetFile.Resolve(data, null, "{work}"));
        Assert.Equal("Private", ThemeSetFile.Resolve(data, null, "{home}"));        // a desktop without one: the app's
        Assert.Equal("Private", ThemeSetFile.Resolve(data, "Gone", null));          // a set that is gone counts as none
        Assert.Equal("project", ThemeSetFile.Source(data, "Company", "{work}"));
        Assert.Equal("desktop", ThemeSetFile.Source(data, null, "{work}"));
        Assert.Equal("app", ThemeSetFile.Source(data, null, "{home}"));
    }

    [Fact]
    public void ASetsValuesGoOverTheSettings()
    {
        var data = WithCompany();
        var values = new JsonObject { ["themeDark"] = "dark", ["wrap"] = true };
        var shown = ThemeSetFile.Apply(values, data.Get("Company"));
        Assert.Equal("dark-ocean", shown["themeDark"]!.GetValue<string>());
        Assert.True(shown["wrap"]!.GetValue<bool>());
        Assert.Equal("dark", values["themeDark"]!.GetValue<string>());   // the settings themselves untouched
        Assert.Equal("dark", ThemeSetFile.Apply(values, null)["themeDark"]!.GetValue<string>());   // "Default"
    }

    [Fact]
    public void NamesThatAreFree()
    {
        var data = WithCompany();
        Assert.False(ThemeSetFile.Free(data, ""));
        Assert.False(ThemeSetFile.Free(data, "default"));
        Assert.False(ThemeSetFile.Free(data, "company"));
        Assert.True(ThemeSetFile.Free(data, "company", self: "Company"));   // renaming to itself (another spelling)
        Assert.True(ThemeSetFile.Free(data, "Private"));
    }

    [Fact]
    public void RenameAndDeleteTakeTheDesktopsAndTheAppAlong()
    {
        var data = WithCompany();
        data.Desktops["{work}"] = "Company";
        data.App = "Company";
        ThemeSetFile.Rename(data, "Company", "Office");
        Assert.Equal("Office", data.Desktops["{work}"]);
        Assert.Equal("Office", data.App);
        ThemeSetFile.Delete(data, "Office");
        Assert.Empty(data.Desktops);
        Assert.Equal(ThemeSetFile.Default, data.App);
        Assert.Empty(data.Sets);
    }

    [Fact]
    public void AProjectsSetGoesRoundTheProjectsFile()
    {
        var path = Path.Combine(dir, ProjectStore.FileName);
        var store = ProjectStore.Load(path);
        store.NewProject("A").ThemeSet = "Company";
        store.NewProject("B");
        store.Save();
        var again = ProjectStore.Load(path);
        Assert.Equal("Company", again.Projects[0].ThemeSet);
        Assert.Null(again.Projects[1].ThemeSet);
    }

    [Fact]
    public void ThePageMarksTheSameNames()
    {
        // actions.js marks the theme set's rows in the settings window from its own list: it must be this one.
        var actions = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "actions.js"));
        var at = actions.IndexOf("const THEME_SET_NAMES", StringComparison.Ordinal);
        var list = actions[actions.IndexOf('[', at)..(actions.IndexOf(']', at) + 1)];
        var names = System.Text.RegularExpressions.Regex.Matches(list, "'([A-Za-z]+)'").Select(m => m.Groups[1].Value);
        Assert.Equal(ThemeSetFile.Names.Order(), names.Order());
    }
}
