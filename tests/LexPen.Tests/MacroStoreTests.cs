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
        Assert.Equal("type \"x\"", MacroStore.Read(dir, "tidy"));
        Assert.Equal(["Collect", "tidy"], MacroStore.List(dir));
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
        var made = File.ReadAllText(path);   // made: the template's remarks, then the key
        Assert.StartsWith(KeysFile.Template[..^4], made);
        Assert.Equal("tidy", KeysFile.Merge("{}", made, path)["keys"]!["Ctrl+Alt+1"]![1]!.GetValue<string>());
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
        Assert.Equal("Macro 1", MacroStore.WriteRecording(dir, "stop"));
        Assert.Null(MacroStore.Rename(dir, "Macro 1", "saved"));   // a recording given a name
        Assert.Null(MacroStore.Read(dir, "Macro 1"));
        Assert.Equal("stop", MacroStore.Read(dir, "saved"));
        MacroStore.Write(dir, "other", "x");
        Assert.Equal("a macro \"other\" exists already", MacroStore.Rename(dir, "saved", "other"));
        Assert.Null(MacroStore.Rename(dir, "saved", "Saved"));   // only its case: allowed
        Assert.Equal("there is no macro \"none\"", MacroStore.Rename(dir, "none", "x"));
        MacroStore.Delete(dir, "other");
        Assert.Equal(["Saved"], MacroStore.List(dir));
    }

    // A recording is a macro of its own: Macro N, the lowest number free (plan 36).
    [Fact]
    public void RecordingsNumberedLowestFree()
    {
        Assert.Equal("Macro 1", MacroStore.NextName(dir));
        Assert.Equal("Macro 1", MacroStore.WriteRecording(dir, "type \"a\""));
        Assert.Equal("Macro 2", MacroStore.WriteRecording(dir, "type \"b\""));
        Assert.Equal("Macro 3", MacroStore.WriteRecording(dir, "type \"c\""));
        MacroStore.Delete(dir, "Macro 2");
        Assert.Equal("Macro 2", MacroStore.WriteRecording(dir, "type \"d\""));   // the gap filled
        MacroStore.Write(dir, "macro 4", "x");   // your own name, another case: that number is taken
        MacroStore.Write(dir, "Macro 7", "x");
        Assert.Equal("Macro 5", MacroStore.NextName(dir));
        Assert.Equal("type \"d\"", MacroStore.Read(dir, "Macro 2"));
    }

    [Fact]
    public void NewestIsTheOneWrittenLast()
    {
        Assert.Null(MacroStore.Newest(dir));
        MacroStore.Write(dir, "old", "x");
        File.SetLastWriteTimeUtc(Path.Combine(dir, "macros", "old.lpm"), DateTime.UtcNow.AddMinutes(-5));
        MacroStore.WriteRecording(dir, "y");
        Assert.Equal("Macro 1", MacroStore.Newest(dir));
    }

    // The last recording of before (~last.lpm): a Macro N, once.
    [Fact]
    public void TheOldLastRecordingBecomesAMacro()
    {
        Directory.CreateDirectory(Path.Combine(dir, "macros"));
        File.WriteAllText(Path.Combine(dir, "macros", "~last.lpm"), "moveto end");
        MacroStore.Write(dir, "Macro 1", "x");
        Assert.Equal("Macro 2", MacroStore.MigrateLast(dir));
        Assert.Equal("moveto end", MacroStore.Read(dir, "Macro 2"));
        Assert.False(File.Exists(Path.Combine(dir, "macros", "~last.lpm")));
        Assert.Null(MacroStore.MigrateLast(dir));   // once
        Assert.Equal(["Macro 1", "Macro 2"], MacroStore.List(dir));
    }
}