using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace LexPen;

/// <summary>
/// Search through the files in a folder and below it, skipping what the tree skips (dot folders,
/// node_modules, hidden files) and what cannot be text (binary, over the size limit). The page builds
/// the regular expression (its ^p, ^t, ... codes included), so the page and this agree on what matches.
/// </summary>
static class FolderSearch
{
    public const long MaxFileSize = 10 * 1024 * 1024;
    static readonly string[] MarkdownExtensions = [".md", ".markdown", ".mdown", ".mkd", ".mdx", ".txt"];

    /// <summary>
    /// Matches as [{path, matches: [{line, col, endLine, endCol, text}]}], files by path; at most
    /// <paramref name="max"/> matches in all ("truncated" then says so). Files in <paramref name="skip"/>
    /// are left out (the page searches their unsaved text itself).
    /// </summary>
    public static JsonObject Search(string root, string pattern, bool ignoreCase, bool markdownOnly,
        IReadOnlySet<string> skip, int max = 2000)
    {
        var options = RegexOptions.CultureInvariant | (ignoreCase ? RegexOptions.IgnoreCase : 0);
        var regex = new Regex(pattern, options, TimeSpan.FromSeconds(2));
        var files = new JsonArray();
        var count = 0;
        var truncated = false;
        foreach (var path in Files(root, markdownOnly).Where(p => !skip.Contains(p)))
        {
            if (truncated) break;
            var text = ReadText(path);
            if (text is null) continue;
            var matches = new JsonArray();
            var lines = LineStarts(text);
            foreach (Match m in regex.Matches(text))
            {
                if (m.Length == 0) continue;
                if (count++ >= max)
                {
                    truncated = true;   // one more than shown: there are more
                    break;
                }
                var (line, col) = Position(lines, m.Index);
                var (endLine, endCol) = Position(lines, m.Index + m.Length);
                var lineEnd = line + 1 < lines.Count ? lines[line + 1] : text.Length;
                matches.Add(new JsonObject
                {
                    ["line"] = line, ["col"] = col, ["endLine"] = endLine, ["endCol"] = endCol,
                    ["text"] = text[lines[line]..lineEnd].TrimEnd('\r', '\n'),
                });
            }
            if (matches.Count > 0) files.Add(new JsonObject { ["path"] = path, ["matches"] = matches });
        }
        return new JsonObject { ["files"] = files, ["truncated"] = truncated };
    }

    // All files below the folder, in a stable order (by path), the way the tree shows them.
    static IEnumerable<string> Files(string root, bool markdownOnly)
    {
        var pending = new Stack<DirectoryInfo>([new DirectoryInfo(root)]);
        var result = new List<string>();
        while (pending.Count > 0)
        {
            var dir = pending.Pop();
            try
            {
                foreach (var sub in dir.EnumerateDirectories())
                    if (!sub.Name.StartsWith('.') && sub.Name != "node_modules" && !sub.Attributes.HasFlag(FileAttributes.Hidden))
                        pending.Push(sub);
                foreach (var file in dir.EnumerateFiles())
                    if (!file.Attributes.HasFlag(FileAttributes.Hidden) && file.Length <= MaxFileSize &&
                        (!markdownOnly || MarkdownExtensions.Contains(file.Extension, StringComparer.OrdinalIgnoreCase)))
                        result.Add(file.FullName);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        }
        result.Sort(StringComparer.OrdinalIgnoreCase);
        return result;
    }

    // Null for what is not text (a zero byte, unless UTF-16) or cannot be read.
    static string? ReadText(string path)
    {
        try
        {
            var bytes = File.ReadAllBytes(path);
            var utf16 = bytes is [0xFF, 0xFE, ..] or [0xFE, 0xFF, ..];
            if (!utf16 && Array.IndexOf(bytes, (byte)0, 0, Math.Min(bytes.Length, 8000)) >= 0) return null;
            return TextFile.Decode(bytes).Text;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    static List<int> LineStarts(string text)
    {
        var starts = new List<int> { 0 };
        for (var i = 0; i < text.Length; i++)
            if (text[i] == '\n' || (text[i] == '\r' && (i + 1 == text.Length || text[i + 1] != '\n')))
                starts.Add(i + 1);
        return starts;
    }

    static (int Line, int Col) Position(List<int> starts, int index)
    {
        var line = starts.BinarySearch(index);
        if (line < 0) line = ~line - 1;
        return (line, index - starts[line]);
    }
}
