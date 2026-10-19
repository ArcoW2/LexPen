namespace LexPen;

/// <summary>tab-colours.json in the data folder: rules that colour tabs by file name or path. Written
/// with the default rules the first time it is asked for; after that it is the user's and never changed.
/// The page reads it (comments allowed) and applies it, see applyTabStyle in app.js.</summary>
static class TabColourFile
{
    public const string Name = "tab-colours.json";

    /// <summary>The file's text; written first with the default when it does not exist. Null when it
    /// cannot be read (another program holds it for longer than the retries).</summary>
    public static string? Read(string dir)
    {
        var path = Path.Combine(dir, Name);
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                if (!File.Exists(path))
                {
                    Directory.CreateDirectory(dir);
                    File.WriteAllText(path, Default);
                }
                return File.ReadAllText(path);
            }
            catch (IOException) when (attempt < 4) { Thread.Sleep(50); }   // being saved by an editor
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
        }
    }

    /// <summary>The default rules: docs\examples\tab-colours.json, embedded in the program, so the
    /// example in the project and what LexPen writes are always the same file.</summary>
    public static string Default { get; } = LoadDefault();

    static string LoadDefault()
    {
        using var stream = typeof(TabColourFile).Assembly.GetManifestResourceStream(Name)
            ?? throw new InvalidOperationException($"{Name} is not embedded in the program.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
