using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class LanguagePacksTests : IDisposable
{
    static readonly string Shipped = Path.Combine(AppContext.BaseDirectory, "wwwroot", "languages");
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
        Assert.Equal(["csharp", "javascript", "json", "markdown", "pascal", "plaintext", "powershell", "sql", "xml", "yaml"],
            all["packs"]!.AsObject().Select(p => p.Key));
        Assert.DoesNotContain("_template", all["packs"]!.AsObject().Select(p => p.Key));
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
