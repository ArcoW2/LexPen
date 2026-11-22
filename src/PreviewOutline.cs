using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The previewer's outline open or closed, per language (docs/plans/PLAN-preview-handler.md 3.3): as you left it for a
/// file of that language, the next one of it opens so. LexPen's own windows keep theirs in the layout; the previewer has
/// none to keep, so a store of its own, State\preview-outline.json (language -> open). Shared by every previewer.
/// </summary>
sealed class PreviewOutline(string file)
{
    Dictionary<string, bool>? open;

    Dictionary<string, bool> All()
    {
        if (open is not null) return open;
        open = new(StringComparer.OrdinalIgnoreCase);
        try
        {
            if (JsonNode.Parse(File.ReadAllText(file)) is JsonObject o)
                foreach (var (language, value) in o)
                    if (value?.GetValueKind() is JsonValueKind.True or JsonValueKind.False) open[language] = value.GetValue<bool>();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }   // none yet, or unreadable: none
        return open;
    }

    /// <summary>Open (true), closed (false), or never set for the language (null).</summary>
    public bool? Get(string language) => All().TryGetValue(language, out var o) ? o : null;

    /// <summary>The language's outline open or closed, written.</summary>
    public void Set(string language, bool isOpen)
    {
        var all = All();
        if (all.TryGetValue(language, out var was) && was == isOpen) return;
        all[language] = isOpen;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            var o = new JsonObject();
            foreach (var (k, v) in all) o[k] = v;
            File.WriteAllText(file, o.ToJsonString());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }   // not kept this time
    }
}
