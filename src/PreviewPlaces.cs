using System.Text.Json;
using System.Text.Json.Nodes;

namespace LexPen;

/// <summary>
/// The previewer's place per file (docs/plans/PLAN-preview-handler.md 3.6): where the preview was scrolled to (the
/// source line and column at its top) and its cursor, so the next preview of that file opens there. LexPen's own
/// windows keep theirs in the session; the previewer has no session, so a store of its own, State\preview-places.json,
/// by path (case ignored), the most recent `Max` files only.
/// </summary>
sealed class PreviewPlaces(string file)
{
    public const int Max = 200;   // files kept; the oldest go (decided during the build)

    Dictionary<string, JsonObject>? places;

    Dictionary<string, JsonObject> All()
    {
        if (places is not null) return places;
        places = new(StringComparer.OrdinalIgnoreCase);
        try
        {
            if (JsonNode.Parse(File.ReadAllText(file)) is JsonObject o)
                foreach (var (path, place) in o) if (place is JsonObject p) places[path] = (JsonObject)p.DeepClone();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }   // none yet, or unreadable: none
        return places;
    }

    /// <summary>The place kept for the file, or null.</summary>
    public JsonObject? Get(string path) => All().GetValueOrDefault(path)?.DeepClone() as JsonObject;

    /// <summary>The file's place kept (the most recent first; past Max the oldest go) and written.</summary>
    public void Set(string path, JsonObject place)
    {
        var all = All();
        var kept = (JsonObject)place.DeepClone();
        kept["at"] = DateTime.UtcNow.Ticks;
        all[path] = kept;
        foreach (var old in all.OrderByDescending(p => p.Value["at"]?.GetValue<long>() ?? 0).Skip(Max).Select(p => p.Key).ToList()) all.Remove(old);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            var o = new JsonObject();
            foreach (var (k, v) in all) o[k] = v.DeepClone();
            File.WriteAllText(file, o.ToJsonString());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }   // not kept this time
    }
}
