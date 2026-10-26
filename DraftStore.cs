using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace LexPen;

/// <summary>
/// New documents that were never saved as a file: kept as Drafts\editN.md so they survive a restart; a name given to
/// one (Rename draft) beside it as editN.name.
/// Writes run on a background thread, one after another, so the page never waits for the disk.
/// </summary>
sealed partial class DraftStore(string dir)
{
    readonly HashSet<string> issued = new(StringComparer.OrdinalIgnoreCase);
    readonly Lock gate = new();
    Task last = Task.CompletedTask;

    [GeneratedRegex(@"^edit(\d+)$", RegexOptions.IgnoreCase)]
    private static partial Regex IdPattern();

    /// <summary>The lowest editN that is not in <paramref name="taken"/>.</summary>
    public static string NextId(IEnumerable<string> taken)
    {
        var set = taken.ToHashSet(StringComparer.OrdinalIgnoreCase);
        for (var n = 1; ; n++)
            if (!set.Contains("edit" + n)) return "edit" + n;
    }

    /// <summary>A new id, never handed out before in this run and not on disk.</summary>
    public string NewId()
    {
        var id = NextId(issued.Concat(OnDisk().Select(f => Path.GetFileNameWithoutExtension(f))));
        issued.Add(id);
        return id;
    }

    /// <summary>All drafts on disk as {id, text}, by number.</summary>
    public JsonArray LoadAll()
    {
        var result = new JsonArray();
        var files = OnDisk()
            .Select(f => (File: f, Id: Path.GetFileNameWithoutExtension(f)))
            .Where(f => IdPattern().IsMatch(f.Id))
            .OrderBy(f => int.Parse(IdPattern().Match(f.Id).Groups[1].Value));
        foreach (var (file, id) in files)
        {
            try
            {
                var draft = new JsonObject { ["id"] = id, ["text"] = File.ReadAllText(file) };
                if (File.Exists(NamePathOf(id))) draft["name"] = File.ReadAllText(NamePathOf(id)).Trim();
                result.Add(draft);
            }
            catch (IOException) { continue; }
            issued.Add(id);
        }
        return result;
    }

    public void Write(string id, string text)
    {
        var path = PathOf(id);
        Queue(() =>
        {
            Directory.CreateDirectory(dir);
            File.WriteAllText(path, text);
        });
    }

    public void Delete(string id)
    {
        var path = PathOf(id);
        var name = NamePathOf(id);
        Queue(() => { File.Delete(path); File.Delete(name); });
    }

    /// <summary>The draft's name (Rename draft); empty or null: none.</summary>
    public void SetName(string id, string? name)
    {
        var path = NamePathOf(id);
        Queue(() =>
        {
            if (string.IsNullOrWhiteSpace(name)) File.Delete(path);
            else
            {
                Directory.CreateDirectory(dir);
                File.WriteAllText(path, name.Trim());
            }
        });
    }

    /// <summary>Waits for the pending writes, for at most a few seconds (on exit).</summary>
    public void Flush()
    {
        Task pending;
        lock (gate) pending = last;
        pending.Wait(TimeSpan.FromSeconds(5));
    }

    void Queue(Action write)
    {
        lock (gate)
        {
            last = last.ContinueWith(_ =>
            {
                try { write(); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }, TaskScheduler.Default);
        }
    }

    IEnumerable<string> OnDisk() => Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "edit*.md") : [];

    // The page names the draft; only editN is accepted, so it cannot point anywhere else.
    string PathOf(string id) => IdPattern().IsMatch(id)
        ? Path.Combine(dir, id + ".md")
        : throw new ArgumentException($"Invalid draft id '{id}'.");
    string NamePathOf(string id) => Path.ChangeExtension(PathOf(id), ".name");
}
