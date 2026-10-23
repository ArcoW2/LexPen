using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class LanguagePacksTests : IDisposable
{
    static readonly string Shipped = Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder, "languages");
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-packs-" + Guid.NewGuid().ToString("N"));

    public LanguagePacksTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static string[] Problems(JsonObject all) => all["problems"]!.AsArray().Select(p => p!.GetValue<string>()).ToArray();

    [Fact]
    public void TheShippedPacksLoadWithoutProblems()
    {
        var all = LanguagePacks.Load(Shipped, Path.Combine(dir, "none"));
        Assert.Empty(Problems(all));
        Assert.Equal(["ahk", "asa", "batch", "cpp", "csharp", "css", "html", "java", "javascript", "json", "kusto", "markdown", "pascal",
            "perl", "php", "plaintext", "powershell", "python", "ruby", "shell", "sql", "vb", "vbscript", "xml", "yaml"],
            all["packs"]!.AsObject().Select(p => p.Key));
        Assert.DoesNotContain("_template", all["packs"]!.AsObject().Select(p => p.Key));
    }

    [Fact]
    public void TheYamlKeepsItsOrder()
    {
        // The order of the word lists is their priority: the first list with a word wins.
        var words = LanguagePacks.Yaml("words:\n  keyword: [a]\n  atom: [b]\n  builtin: [c]\n")!["words"]!.AsObject();
        Assert.Equal(["keyword", "atom", "builtin"], words.Select(w => w.Key));
        // The page gets the keys sorted (WebView2): the order goes along as wordOrder.
        var ahk = LanguagePacks.Load(Shipped, Path.Combine(dir, "none"))["packs"]!["ahk"]!;
        Assert.Equal(["keyword", "atom", "variable-2", "builtin", "key", "type"], ahk["wordOrder"]!.AsArray().Select(k => k!.GetValue<string>()));
    }

    [Fact]
    public void NoExtensionIsInTwoShippedPacks()
    {
        var claims = LanguagePacks.Load(Shipped, Path.Combine(dir, "none"))["packs"]!.AsObject()
            .SelectMany(p => (p.Value!["extensions"]?.AsArray() ?? []).Select(e => (Ext: e!.GetValue<string>().TrimStart('.').ToLowerInvariant(), Pack: p.Key)));
        var twice = claims.GroupBy(c => c.Ext).Where(g => g.Count() > 1).Select(g => $"{g.Key}: {string.Join(", ", g.Select(c => c.Pack))}");
        Assert.Empty(twice);
    }

    [Fact]
    public void EmbeddedBlocksAreCheckedAndAWrongOneLeftOut()
    {
        Directory.CreateDirectory(Path.Combine(dir, "mine"));
        File.WriteAllText(Path.Combine(dir, "mine", "language.yaml"), """
            name: Mine
            aliases: [MyLang, ' ml ']
            embedded:
              - { open: '/*==[', close: ']==*/', language: json }
              - { openRegex: '^```(\w+)', closeRegex: '^```$', languageGroup: 1 }
              - { open: '<<' }
              - { openRegex: '(', close: 'x', language: json }
              - { openRegex: '^a', close: 'b', languageGroup: 3 }
            """);
        var all = LanguagePacks.Load(Shipped, dir);
        var mine = all["packs"]!["mine"]!;
        Assert.Equal(2, mine["embedded"]!.AsArray().Count);
        Assert.Equal(["myLang".ToLowerInvariant(), "ml"], mine["aliases"]!.AsArray().Select(a => a!.GetValue<string>()));
        var problems = Problems(all);
        Assert.Contains(problems, p => p.Contains("needs \"close\""));
        Assert.Contains(problems, p => p.Contains("\"openRegex\" is not a valid pattern"));
        Assert.Contains(problems, p => p.Contains("\"languageGroup\" must be a group"));
    }

    [Fact]
    public void NoAliasIsInTwoShippedPacksOrAnotherPacksName()
    {
        var packs = LanguagePacks.Load(Shipped, Path.Combine(dir, "none"))["packs"]!.AsObject();
        var owners = packs.SelectMany(p => (p.Value!["aliases"]?.AsArray() ?? []).Select(a => (Name: a!.GetValue<string>(), Pack: p.Key))).ToList();
        Assert.Empty(owners.GroupBy(o => o.Name).Where(g => g.Count() > 1).Select(g => g.Key));
        var idsAndNames = packs.SelectMany(p => new[] { (Name: p.Key, Pack: p.Key), (Name: p.Value!["name"]!.GetValue<string>().ToLowerInvariant(), Pack: p.Key) });
        Assert.Empty(owners.Where(o => idsAndNames.Any(n => n.Name == o.Name && n.Pack != o.Pack)).Select(o => $"{o.Name} ({o.Pack})"));
    }

    [Fact]
    public void ADebugBuildFindsTheProjectsFolders()
    {
        var bin = Path.Combine(dir, "project", "bin", "Debug", "net10.0-windows");
        Directory.CreateDirectory(bin);
        File.WriteAllText(Path.Combine(dir, "project", "LexPen.csproj"), "<Project />");
        Assert.Equal(Path.Combine(dir, "project", "defaults"), AppHost.FindProjectFolder(bin, "defaults"));
        Assert.Null(AppHost.FindProjectFolder(Path.Combine(dir, "none"), "web"));
    }

    [Fact]
    public void ExtensionsPointToTheirPack()
    {
        var ext = LanguagePacks.Load(Shipped, Path.Combine(dir, "none"))["extensions"]!.AsObject();
        Assert.Equal("csharp", ext[".cs"]!.GetValue<string>());
        Assert.Equal("markdown", ext[".md"]!.GetValue<string>());
        Assert.Equal("markdown", ext[".txt"]!.GetValue<string>());   // as before the packs
        Assert.Equal("pascal", ext[".pas"]!.GetValue<string>());
        Assert.Equal("xml", ext[".csproj"]!.GetValue<string>());
        Assert.Equal("ahk", ext[".ahk"]!.GetValue<string>());
        Assert.Equal("asa", ext[".evn"]!.GetValue<string>());
        Assert.Equal("asa", ext[".sql"]!.GetValue<string>());   // .sql is ASA SQL
        Assert.Equal("sql", ext[".ddl"]!.GetValue<string>());
    }

    [Fact]
    public void APackReadsAsJson()
    {
        var sql = LanguagePacks.Load(Shipped, Path.Combine(dir, "none"))["packs"]!["sql"]!;
        Assert.Equal("SQL", sql["name"]!.GetValue<string>());
        Assert.False(sql["caseSensitive"]!.GetValue<bool>());
        Assert.Contains("select", sql["words"]!["keyword"]!.AsArray().Select(w => w!.GetValue<string>()));
        Assert.Equal("null", sql["words"]!["atom"]![0]!.GetValue<string>());   // quoted: text, not null
        Assert.Equal(1, sql["outline"]![0]!["name"]!.GetValue<long>());
        Assert.StartsWith("SELECT $0", sql["actions"]!["snippetSelect"]!["insert"]!.GetValue<string>());
        Assert.True(sql["bar"]!.AsArray().Count > 0);
        Assert.Contains("<svg", LanguagePacks.Load(Shipped, Path.Combine(dir, "none"))["packs"]!["plaintext"]!["icons"]!["comment"]!.GetValue<string>());
    }

    [Fact]
    public void TheTemplateIsAValidPack()
    {
        var copy = Path.Combine(dir, "tcc");
        Directory.CreateDirectory(copy);
        foreach (var f in Directory.GetFiles(Path.Combine(Shipped, "_template"))) File.Copy(f, Path.Combine(copy, Path.GetFileName(f)));
        var all = LanguagePacks.Load(Shipped, dir);
        Assert.Empty(Problems(all));
        Assert.Equal("tcc", all["extensions"]![".btm"]!.GetValue<string>());
        Assert.True(all["packs"]!["tcc"]!["mine"]!.GetValue<bool>());
    }

    [Fact]
    public void YourPackReplacesAShippedOneAndTakesItsExtensions()
    {
        Directory.CreateDirectory(Path.Combine(dir, "sql"));
        File.WriteAllText(Path.Combine(dir, "sql", "language.yaml"), "name: My SQL\nextensions: [sql, .psql]\n");
        var all = LanguagePacks.Load(Shipped, dir);
        Assert.Equal("My SQL", all["packs"]!["sql"]!["name"]!.GetValue<string>());
        Assert.Equal("sql", all["extensions"]![".psql"]!.GetValue<string>());
        Assert.Equal("sql", all["extensions"]![".sql"]!.GetValue<string>());
    }

    [Fact]
    public void ABrokenPackIsReportedAndLeftOut()
    {
        Directory.CreateDirectory(Path.Combine(dir, "bad"));
        File.WriteAllText(Path.Combine(dir, "bad", "language.yaml"), "name: Bad\nwords: [unclosed\n");
        Directory.CreateDirectory(Path.Combine(dir, "odd"));
        File.WriteAllText(Path.Combine(dir, "odd", "language.yaml"), "name: Odd\nopen: sideways\nfirstLine: '(['\n");
        Directory.CreateDirectory(Path.Combine(dir, "empty"));
        var all = LanguagePacks.Load(Shipped, dir);
        var problems = Problems(all);
        Assert.Contains(problems, p => p.Contains("bad") && p.Contains("line"));
        Assert.Contains(problems, p => p.Contains("\"open\" must be edit, split or preview"));
        Assert.Contains(problems, p => p.Contains("\"firstLine\" is not a valid pattern"));
        Assert.Contains(problems, p => p.Contains("empty") && p.Contains("language.yaml is missing"));
        Assert.Null(all["packs"]!["bad"]);
        Assert.NotNull(all["packs"]!["odd"]);   // usable without the wrong parts
    }

    [Fact]
    public void YamlScalarsKeepTheirKind()
    {
        var o = LanguagePacks.Yaml("a: true\nb: 12\nc: 1.5\nd: ~\ne: 'true'\nf: text\ng: [1, x]\n")!.AsObject();
        Assert.True(o["a"]!.GetValue<bool>());
        Assert.Equal(12, o["b"]!.GetValue<long>());
        Assert.Equal(1.5, o["c"]!.GetValue<double>());
        Assert.Null(o["d"]);
        Assert.Equal("true", o["e"]!.GetValue<string>());
        Assert.Equal("text", o["f"]!.GetValue<string>());
        Assert.Equal(2, o["g"]!.AsArray().Count);
    }
}
