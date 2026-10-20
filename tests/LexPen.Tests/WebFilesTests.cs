namespace LexPen.Tests;

public class WebFilesTests
{
    static readonly string ProjectWeb = AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!;

    [Fact]
    public void EveryFileOfThePageIsInTheExe()
    {
        var files = Directory.GetFiles(ProjectWeb, "*", SearchOption.AllDirectories)
            .Select(f => Path.GetRelativePath(ProjectWeb, f).Replace('\\', '/')).ToList();
        Assert.NotEmpty(files);
        Assert.Empty(files.Except(WebFiles.Paths, StringComparer.OrdinalIgnoreCase));
        foreach (var f in files)
        {
            using var stream = WebFiles.Resource(f);
            Assert.NotNull(stream);
            Assert.Equal(new FileInfo(Path.Combine(ProjectWeb, f)).Length, stream!.Length);
        }
    }

    [Theory]
    [InlineData("index.html")]
    [InlineData("/app.js")]
    [InlineData("vendor/versions.json")]
    [InlineData("VENDOR/versions.json")]
    public void TheNameAUrlAsksForFindsTheFile(string path)
    {
        using var stream = WebFiles.Resource(path);
        Assert.NotNull(stream);
    }

    [Fact]
    public void AFontAndAStyleSheetOfKatex()
    {
        Assert.Contains(WebFiles.Paths, p => p.StartsWith("vendor/katex/", StringComparison.Ordinal) && p.EndsWith(".woff2", StringComparison.Ordinal));
        Assert.Contains(WebFiles.Paths, p => p.StartsWith("vendor/katex/", StringComparison.Ordinal) && p.EndsWith(".css", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("nothing.js")]
    [InlineData("../LexPen.csproj")]
    [InlineData("vendor")]
    public void AnUnknownNameGivesNone(string path) => Assert.Null(WebFiles.Resource(path));

    [Theory]
    [InlineData("index.html", "text/html; charset=utf-8")]
    [InlineData("app.js", "text/javascript; charset=utf-8")]
    [InlineData("app.css", "text/css; charset=utf-8")]
    [InlineData("vendor/versions.json", "application/json; charset=utf-8")]
    [InlineData("x.woff2", "font/woff2")]
    [InlineData("x.svg", "image/svg+xml")]
    [InlineData("x.bin", "application/octet-stream")]
    public void TheContentTypeComesFromTheExtension(string path, string type) => Assert.Equal(type, WebFiles.ContentType(path));

    [Fact]
    public void TheDefaultsAreNextToTheExeAndNoPageFile()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, AppHost.DefaultsFolder);
        foreach (var name in new[] { "keys.json", "settings.json", "languages", "themes" })
            Assert.True(File.Exists(Path.Combine(dir, name)) || Directory.Exists(Path.Combine(dir, name)), name);
        Assert.False(Directory.Exists(Path.Combine(AppContext.BaseDirectory, "web")));
        Assert.False(Directory.Exists(Path.Combine(AppContext.BaseDirectory, "wwwroot")));
    }
}
