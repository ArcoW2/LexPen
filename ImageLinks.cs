namespace LexPen;

/// <summary>
/// Markdown image links for pasted or dropped images. An image in the document's folder (or below it)
/// is linked relatively as it is; one elsewhere is copied into the document's image folder first
/// ("readme.md" -> "readme.md.images"), unless the user chose otherwise (see Modes).
/// Links use forward slashes and URL-encoded names, so other viewers (GitHub) read them too.
/// </summary>
static class ImageLinks
{
    public static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase)
        { ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico", ".avif" };

    /// <summary>auto: link when inside, otherwise copy to the image folder. The others are the Shift choices.</summary>
    public static readonly string[] Modes = ["auto", "relative", "absolute", "copyHere", "copyImages"];

    public static bool IsImage(string path) => Extensions.Contains(Path.GetExtension(path));

    public static string ImagesFolder(string doc) => doc + ".images";

    /// <summary>The image is in <paramref name="folder"/> or a folder below it.</summary>
    public static bool IsInside(string folder, string path) =>
        path.StartsWith(folder.TrimEnd('\\') + '\\', StringComparison.OrdinalIgnoreCase);

    /// <summary>Copies or not, as the mode says, and returns the markdown for the image.</summary>
    public static string Place(string doc, string image, string mode)
    {
        var dir = Path.GetDirectoryName(doc)!;
        var target = mode switch
        {
            "auto" => IsInside(dir, image) ? image : Copy(image, ImagesFolder(doc)),
            "copyHere" => InFolder(dir, image) ? image : Copy(image, dir),
            "copyImages" => InFolder(ImagesFolder(doc), image) ? image : Copy(image, ImagesFolder(doc)),
            "relative" or "absolute" => image,
            _ => throw new ArgumentException($"Unknown mode '{mode}'."),
        };
        var link = mode == "absolute" ? Absolute(target) : Relative(dir, target) ?? Absolute(target);   // other drive: no relative path
        return Markdown(link, target);
    }

    /// <summary>A picture from the clipboard (no file yet): saved in the image folder.</summary>
    public static string SavePicture(string doc, byte[] png, DateTime now)
    {
        var folder = ImagesFolder(doc);
        Directory.CreateDirectory(folder);
        var target = UniqueName(folder, $"image-{now:yyyyMMdd-HHmmss}.png");
        File.WriteAllBytes(target, png);
        return Markdown(Relative(Path.GetDirectoryName(doc)!, target)!, target);
    }

    /// <summary>Relative URL from the folder to the file; null when they are on different drives.</summary>
    public static string? Relative(string dir, string path)
    {
        if (!string.Equals(Path.GetPathRoot(dir), Path.GetPathRoot(path), StringComparison.OrdinalIgnoreCase)) return null;
        return Encode(Path.GetRelativePath(dir, path).Split('\\'));
    }

    /// <summary>"D:/folder/name.png", which LexPen and VS Code show (a file:// URL is not loaded by viewers).</summary>
    public static string Absolute(string path)
    {
        var parts = path.Split('\\');
        return parts[0] + "/" + Encode(parts[1..]);
    }

    static string Encode(IEnumerable<string> parts) =>
        string.Join("/", parts.Select(p => p is "." or ".." ? p : Uri.EscapeDataString(p)));

    static string Markdown(string link, string file)
    {
        var alt = Path.GetFileNameWithoutExtension(file).Replace("[", "\\[").Replace("]", "\\]");
        return $"![{alt}]({link})";
    }

    static bool InFolder(string folder, string path) =>
        string.Equals(Path.GetDirectoryName(path), folder.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);

    static string Copy(string image, string folder)
    {
        Directory.CreateDirectory(folder);
        var target = UniqueName(folder, Path.GetFileName(image));
        File.Copy(image, target);
        return target;
    }

    /// <summary>The name in the folder, or name-2, name-3, ... when it is taken.</summary>
    public static string UniqueName(string folder, string name)
    {
        var target = Path.Combine(folder, name);
        for (var n = 2; File.Exists(target); n++)
            target = Path.Combine(folder, $"{Path.GetFileNameWithoutExtension(name)}-{n}{Path.GetExtension(name)}");
        return target;
    }
}
