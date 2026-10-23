using System.Reflection;
using Microsoft.Web.WebView2.Core;

namespace LexPen;

/// <summary>
/// The page's files (web\ in the project: index.html, the scripts, app.css, the settings page, vendor\): built into
/// the exe as resources, so nothing of the page lies next to it (docs/plans/PLAN-app-files.md). A window serves them
/// at https://lexpen.example/ from there. A debug build serves the project's own web\ folder instead, so an edit
/// applies on a reload, without a build.
/// </summary>
static class WebFiles
{
    public const string Host = "lexpen.example";
    const string Prefix = "web\\";   // the resource names: web\vendor\katex\katex.min.css (LexPen.csproj)

    static readonly Assembly Assembly = typeof(WebFiles).Assembly;
    static readonly Dictionary<string, string> Names = Assembly.GetManifestResourceNames()
        .Where(n => n.StartsWith(Prefix, StringComparison.Ordinal))
        .ToDictionary(n => n[Prefix.Length..].Replace('\\', '/'), n => n, StringComparer.OrdinalIgnoreCase);

#if DEBUG
    static readonly string? ProjectWeb = AppHost.FindProjectFolder(AppContext.BaseDirectory, "web");
#else
    static readonly string? ProjectWeb = null;   // readonly, not const: a const null makes every test of it a warning
#endif

    static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8", [".js"] = "text/javascript; charset=utf-8", [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8", [".svg"] = "image/svg+xml", [".png"] = "image/png",
        [".woff2"] = "font/woff2", [".woff"] = "font/woff", [".ttf"] = "font/ttf",
    };

    /// <summary>The content type of a file by its extension.</summary>
    public static string ContentType(string path) => Types.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream");

    /// <summary>The paths of all the page's files, as a URL names them ("vendor/katex/katex.min.css").</summary>
    public static IEnumerable<string> Paths => Names.Keys;

    /// <summary>One of the page's files ("app.css", "vendor/versions.json"), or null when there is none.</summary>
    public static Stream? Open(string path)
    {
        path = path.TrimStart('/');
        if (ProjectWeb is not null)
        {
            var file = Path.GetFullPath(Path.Combine(ProjectWeb, path));
            return file.StartsWith(ProjectWeb + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) && File.Exists(file) ? File.OpenRead(file) : null;
        }
        return Resource(path);
    }

    /// <summary>One of the page's files from the exe's resources (a release build always; the tests).</summary>
    internal static Stream? Resource(string path) =>
        Names.TryGetValue(path.TrimStart('/'), out var name) ? Assembly.GetManifestResourceStream(name) : null;

    public static string ReadText(string path)
    {
        using var stream = Open(path) ?? throw new FileNotFoundException($"The page's file {path} is missing.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    /// <summary>Makes a WebView2 serve the page at https://lexpen.example/.</summary>
    public static void Serve(CoreWebView2 core)
    {
        if (ProjectWeb is not null)
        {
            core.SetVirtualHostNameToFolderMapping(Host, ProjectWeb, CoreWebView2HostResourceAccessKind.Deny);
            return;
        }
        core.AddWebResourceRequestedFilter($"https://{Host}/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) =>
        {
            var uri = new Uri(e.Request.Uri);
            if (!uri.Host.Equals(Host, StringComparison.OrdinalIgnoreCase)) return;
            var path = Uri.UnescapeDataString(uri.AbsolutePath);
            var stream = Open(path);
            e.Response = stream is null
                ? core.Environment.CreateWebResourceResponse(null, 404, "Not Found", "")
                : core.Environment.CreateWebResourceResponse(stream, 200, "OK", $"Content-Type: {ContentType(path)}");
        };
    }
}
