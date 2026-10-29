namespace LexPen.Tests;

public class MacroStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-macros-" + Guid.NewGuid().ToString("N"));

    public MacroStoreTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    [Fact]
    public void WrittenReadAndListedByName()
    {
        MacroStore.Write(dir, "tidy", "type \"x\"");
        MacroStore.Write(dir, "Collect", "stop");
        MacroStore.Write(dir, MacroStore.Last, "moveto end");
        Assert.Equal("type \"x\"", MacroStore.Read(dir, "tidy"));
        Assert.Equal(["Collect", "tidy"], MacroStore.List(dir));   // the last recording is not one of them
        Assert.Equal("moveto end", MacroStore.Read(dir, MacroStore.Last));
        Assert.True(File.Exists(Path.Combine(dir, "macros", "tidy.lpm")));
        Assert.Null(MacroStore.Read(dir, "nothing"));
    }

    [Theory]
    [InlineData("", "a macro needs a name")]
    [InlineData(" tidy", "a name does not start or end with a space")]
    [InlineData("a/b", "a name cannot hold")]
    [InlineData("a:b", "a name cannot hold")]
    [InlineData("~mine", "a name does not start with ~ or .")]
    [InlineData("name.", "a name does not end with a dot")]
    public void NamesRefused(string name, string why) => Assert.StartsWith(why, MacroStore.Refusal(name));

    // Manage > Key...: the key at the end of your keys.json, its comments kept; made when there is none.
    [Fact]
    public void AKeyForAMacroInYourKeysFile()
    {
        var path = Path.Combine(dir, KeysFile.Name);
        Assert.Equal("Ctrl+Alt+1", KeysFile.AddMacroKey(dir, "ctrl+alt+1", "tidy")["key"]!.GetValue<string>());
        File.WriteAllText(path, "// mine\n{\n  \"Ctrl+S\": \"save\"   // no comma\n}\n");
        KeysFile.AddMacroKey(dir, "Ctrl+K, M", "collect");
        var text = File.ReadAllText(path);
        Assert.Contains("// mine", text);
        Assert.Contains("\"Ctrl+K, M\": [\"macroRun\", \"collect\"]", text);
        var merged = KeysFile.Merge("{}", text, path);
        Assert.Equal("collect", merged["keys"]!["Ctrl+K, M"]![1]!.GetValue<string>());
        Assert.Equal("save", merged["keys"]!["Ctrl+S"]!.GetValue<string>());
        Assert.NotNull(KeysFile.AddMacroKey(dir, "Ctrl+Nonsense", "x")["error"]);
        // A key in the file already: refused, the file as it was.
        Assert.StartsWith("Ctrl+K, M is in your keys.json already", KeysFile.AddMacroKey(dir, "ctrl+k, m", "other")["error"]!.GetValue<string>());
        Assert.Equal(text, File.ReadAllText(path));
    }

    [Fact]
    public void RenamedAndDeleted()
    {
        MacroStore.Write(dir, MacroStore.Last, "stop");
        Assert.Null(MacroStore.Rename(dir, MacroStore.Last, "saved"));   // the last recording saved under a name
        Assert.Null(MacroStore.Read(dir, MacroStore.Last));
        Assert.Equal("stop", MacroStore.Read(dir, "saved"));
        MacroStore.Write(dir, "other", "x");
        Assert.Equal("a macro \"other\" exists already", MacroStore.Rename(dir, "saved", "other"));
        Assert.Null(MacroStore.Rename(dir, "saved", "Saved"));   // only its case: allowed
        Assert.Equal("there is no macro \"none\"", MacroStore.Rename(dir, "none", "x"));
        MacroStore.Delete(dir, "other");
        Assert.Equal(["Saved"], MacroStore.List(dir));
    }
}
