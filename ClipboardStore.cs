using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// LexPen's own clipboards 1 to 9 (0 is the Windows clipboard, which this class never touches). One of
/// them is active: copy, cut and paste work on that one. Shared by all windows; the texts are kept across
/// restarts in clipboards.json, but every start begins with the Windows clipboard active. A text copied from a
/// block (column mode) is marked as one, so paste puts it back as a column; in the file such an entry is
/// { "text": ..., "column": true }, any other a plain string.
/// </summary>
sealed class ClipboardStore
{
    public const int Count = 10;
    readonly string path;
    readonly string[] texts = new string[Count];
    readonly bool[] columns = new bool[Count];

    public int Active { get; private set; }

    public ClipboardStore(string path)
    {
        this.path = path;
        Array.Fill(texts, "");
        try
        {
            var saved = JsonNode.Parse(File.ReadAllText(path)) as JsonArray ?? [];
            for (var i = 1; i < Count && i < saved.Count; i++)
            {
                if (saved[i] is JsonObject entry)
                {
                    texts[i] = entry["text"]?.GetValue<string>() ?? "";
                    columns[i] = entry["column"]?.GetValue<bool>() == true;
                }
                else texts[i] = saved[i]?.GetValue<string>() ?? "";
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException) { }
    }

    static void Check(int n)
    {
        if (n is < 0 or >= Count) throw new ArgumentOutOfRangeException(nameof(n), $"There is no clipboard {n}.");
    }

    public void Select(int n)
    {
        Check(n);
        Active = n;
    }

    public string Get(int n)
    {
        Check(n);
        if (n == 0) throw new ArgumentException("Clipboard 0 is the Windows clipboard.");
        return texts[n];
    }

    /// <summary>Is the text of clipboard n a block (copied in column mode)?</summary>
    public bool IsColumn(int n)
    {
        Check(n);
        return n != 0 && columns[n];
    }

    public void Set(int n, string text, bool column = false)
    {
        Check(n);
        if (n == 0) throw new ArgumentException("Clipboard 0 is the Windows clipboard.");
        texts[n] = text;
        columns[n] = column;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var all = new JsonArray(texts.Select((t, i) => i == 0 ? (JsonNode?)""
            : columns[i] ? new JsonObject { ["text"] = t, ["column"] = true } : (JsonNode?)t).ToArray());
        File.WriteAllText(path, all.ToJsonString());
    }

    /// <summary>The start of a text for a list or a tooltip: its first line that is not empty, shortened.</summary>
    public static string Preview(string text)
    {
        var line = text.Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0) ?? "";
        return line.Length > 60 ? line[..57] + "..." : line;
    }

    /// <summary>{ active, previews: ["", start of 1, ..., start of 9], columns: [false, block?, ...] } for the page.</summary>
    public JsonObject State() => new()
    {
        ["active"] = Active,
        ["previews"] = new JsonArray(texts.Select((t, i) => (JsonNode?)(i == 0 ? "" : Preview(t))).ToArray()),
        ["columns"] = new JsonArray(columns.Select((c, i) => (JsonNode?)(i != 0 && c)).ToArray()),
    };
}
