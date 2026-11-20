using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Win32;

namespace LexPen;

/// <summary>
/// Which extensions Explorer opens in LexPen (docs/plans/executed/PLAN-file-types.md): per extension a file type of LexPen
/// for its language and way of opening (edit, or view in the project for viewing), registered for the current user only
/// (HKCU\Software\Classes, no admin), with LexPen listed under Settings > Apps > Default apps. A choice of your own for
/// another app (Explorer's UserChoice, which only Windows may write) is removed for an extension assigned, so Windows
/// falls back to LexPen; what Windows still keeps elsewhere (associations it protects) the caller tells the user.
/// Registry paths below LEXPEN_REGISTRY_ROOT for the tests (its parent stands for HKCU\Software).
/// </summary>
static class FileTypes
{
    const string Prefix = "LexPen.";
    const string OldType = "LexPen.Document";   // register.ps1's file type for .md, before this

    internal static string Classes => Environment.GetEnvironmentVariable("LEXPEN_REGISTRY_ROOT") is { Length: > 0 } root ? root : @"Software\Classes";
    internal static string Software => Classes.EndsWith(@"\Classes", StringComparison.OrdinalIgnoreCase) ? Classes[..^@"\Classes".Length] : @"Software";
    static string Capabilities => $@"{Software}\LexPen\Capabilities";
    static string RegisteredApplications => $@"{Software}\RegisteredApplications";
    static string FileExts => Environment.GetEnvironmentVariable("LEXPEN_REGISTRY_ROOT") is { Length: > 0 }
        ? $@"{Software}\FileExts" : @"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts";

    /// <summary>A file type of LexPen: its language and way of opening ("edit" or "view").</summary>
    public static string TypeOf(string language, string mode) => $"{Prefix}{language}.{(mode == "view" ? "view" : "edit")}";

    /// <summary>How an extension opens in LexPen now: "edit", "view", or null when LexPen is not its file type.</summary>
    public static string? ModeOf(string extension)
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"{Classes}\{extension}");
        var type = key?.GetValue(null) as string;
        if (type == OldType) return "edit";
        if (type is null || !type.StartsWith(Prefix, StringComparison.Ordinal)) return null;
        return type.EndsWith(".view", StringComparison.Ordinal) ? "view" : "edit";
    }

    /// <summary>One extension to assign: its language (id and name) and way of opening.</summary>
    public sealed record Choice(string Extension, string Language, string LanguageName, string Mode);

    /// <summary>Assigns <paramref name="chosen"/> to LexPen (the exe <paramref name="exe"/>) and takes LexPen off every
    /// other extension it had among <paramref name="known"/> (the extensions of the language packs); the old file type
    /// of register.ps1 goes too.</summary>
    public static void Assign(string exe, IReadOnlyCollection<Choice> chosen, IEnumerable<string> known)
    {
        var wanted = chosen.Select(c => c.Extension).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var extension in known.Where(e => !wanted.Contains(e) && ModeOf(e) is not null)) TakeOff(extension);
        TakeOff(".md", onlyOld: true);
        if (chosen.Count == 0)   // none: LexPen no longer listed under Default apps either
        {
            Registry.CurrentUser.DeleteSubKeyTree($@"{Software}\LexPen", throwOnMissingSubKey: false);
            using (var registered = Registry.CurrentUser.OpenSubKey(RegisteredApplications, writable: true))
                registered?.DeleteValue("LexPen", throwOnMissingValue: false);
            DropUnusedTypes();
            SHChangeNotify(0x08000000 /* SHCNE_ASSOCCHANGED */, 0, IntPtr.Zero, IntPtr.Zero);
            return;
        }
        using (var caps = Registry.CurrentUser.CreateSubKey(Capabilities))
        {
            caps.SetValue("ApplicationName", "LexPen");
            caps.SetValue("ApplicationDescription", "Fast, intuitive and flexible text and code editor");
        }
        using (var registered = Registry.CurrentUser.CreateSubKey(RegisteredApplications))
            registered.SetValue("LexPen", $@"Software\LexPen\Capabilities");
        using (var app = Registry.CurrentUser.CreateSubKey($@"{Classes}\Applications\LexPen.exe"))
        {
            app.SetValue("FriendlyAppName", "LexPen");
            using var command = app.CreateSubKey(@"shell\open\command");
            command.SetValue(null, $"\"{exe}\" \"%1\"");
        }
        foreach (var c in chosen)
        {
            var type = TypeOf(c.Language, c.Mode);
            using (var t = Registry.CurrentUser.CreateSubKey($@"{Classes}\{type}"))
            {
                t.SetValue(null, $"{c.LanguageName} file");
                using (var icon = t.CreateSubKey("DefaultIcon")) icon.SetValue(null, $"\"{exe}\",0");
                using var command = t.CreateSubKey(@"shell\open\command");
                command.SetValue(null, c.Mode == "view" ? $"\"{exe}\" --view \"%1\"" : $"\"{exe}\" \"%1\"");
            }
            using (var ext = Registry.CurrentUser.CreateSubKey($@"{Classes}\{c.Extension}"))
            {
                // Another way of opening than before: the old one goes from Open with.
                if (ext.GetValue(null) is string old && old != type && old.StartsWith(Prefix, StringComparison.Ordinal))
                    using (var progIds = ext.OpenSubKey("OpenWithProgids", writable: true)) progIds?.DeleteValue(old, throwOnMissingValue: false);
                ext.SetValue(null, type);
                using var withProgIds = ext.CreateSubKey("OpenWithProgids");
                withProgIds.SetValue(type, "");
            }
            using (var supported = Registry.CurrentUser.CreateSubKey($@"{Classes}\Applications\LexPen.exe\SupportedTypes"))
                supported.SetValue(c.Extension, "");
            using (var associations = Registry.CurrentUser.CreateSubKey($@"{Capabilities}\FileAssociations"))
                associations.SetValue(c.Extension, type);
            // Your choice of another app for it (only Windows may write it, but it may be removed): Windows then starts
            // the default above.
            foreach (var choice in new[] { "UserChoice", "UserChoiceLatest" })
                try { Registry.CurrentUser.DeleteSubKeyTree($@"{FileExts}\{c.Extension}\{choice}", throwOnMissingSubKey: false); }
                catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException) { }
        }
        DropUnusedTypes();
        SHChangeNotify(0x08000000 /* SHCNE_ASSOCCHANGED */, 0, IntPtr.Zero, IntPtr.Zero);
    }

    // LexPen's entries for an extension removed (only register.ps1's old file type: onlyOld).
    static void TakeOff(string extension, bool onlyOld = false)
    {
        using (var ext = Registry.CurrentUser.OpenSubKey($@"{Classes}\{extension}", writable: true))
        {
            if (ext is null) return;
            if (ext.GetValue(null) is string type && (type == OldType || !onlyOld && type.StartsWith(Prefix, StringComparison.Ordinal)))
                ext.DeleteValue("", throwOnMissingValue: false);
            using var progIds = ext.OpenSubKey("OpenWithProgids", writable: true);
            foreach (var name in progIds?.GetValueNames() ?? [])
                if (name == OldType || !onlyOld && name.StartsWith(Prefix, StringComparison.Ordinal)) progIds!.DeleteValue(name);
        }
        if (onlyOld) return;
        using (var supported = Registry.CurrentUser.OpenSubKey($@"{Classes}\Applications\LexPen.exe\SupportedTypes", writable: true))
            supported?.DeleteValue(extension, throwOnMissingValue: false);
        using (var associations = Registry.CurrentUser.OpenSubKey($@"{Capabilities}\FileAssociations", writable: true))
            associations?.DeleteValue(extension, throwOnMissingValue: false);
    }

    // The file types of LexPen no extension uses any more go (register.ps1's old one too).
    static void DropUnusedTypes()
    {
        using var classes = Registry.CurrentUser.OpenSubKey(Classes);
        if (classes is null) return;
        var used = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in classes.GetSubKeyNames().Where(n => n.StartsWith('.')))
        {
            using var ext = classes.OpenSubKey(name);
            if (ext?.GetValue(null) is string type) used.Add(type);
            using var progIds = ext?.OpenSubKey("OpenWithProgids");
            foreach (var p in progIds?.GetValueNames() ?? []) used.Add(p);
        }
        foreach (var type in classes.GetSubKeyNames().Where(n => n.StartsWith(Prefix, StringComparison.Ordinal) && !used.Contains(n)))
            Registry.CurrentUser.DeleteSubKeyTree($@"{Classes}\{type}", throwOnMissingSubKey: false);
    }

    /// <summary>The app Windows starts now for an extension: its name, and whether it is <paramref name="exe"/>; null
    /// for none. Asks Windows itself (AssocQueryString), so a choice of yours counts.</summary>
    public static (string? Name, bool Ours) OpensWith(string extension, string exe)
    {
        static string? Ask(int what, string extension)
        {
            var size = 1024u;
            var result = new StringBuilder((int)size);
            return AssocQueryString(0x40 /* ASSOCF_NOTRUNCATE */, what, extension, "open", result, ref size) == 0 && result.Length > 0 ? result.ToString() : null;
        }
        var path = Ask(2 /* ASSOCSTR_EXECUTABLE */, extension);
        // None set: Windows' own "Pick an application" (OpenWith.exe); a file that runs itself (.cmd, .exe): "%1".
        if (path is null || string.Equals(Path.GetFileName(path), "OpenWith.exe", StringComparison.OrdinalIgnoreCase)) return (null, false);
        if (path.Contains("%1")) return ("Runs itself", false);
        var ours = string.Equals(Path.GetFullPath(path), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase);
        return (Ask(4 /* ASSOCSTR_FRIENDLYAPPNAME */, extension) ?? Path.GetFileNameWithoutExtension(path), ours);
    }

    /// <summary>The rows of the File types dialog: every extension of the language packs (<paramref name="languages"/>:
    /// LanguagePacks' JSON) with its language, how LexPen opens it now (null: not), and the app Windows starts now.</summary>
    public static JsonArray List(JsonObject languages, string exe)
    {
        var packs = languages["packs"] as JsonObject;
        return new JsonArray((languages["extensions"] as JsonObject ?? []).OrderBy(e => e.Key, StringComparer.OrdinalIgnoreCase).Select(e =>
        {
            var language = e.Value?.GetValue<string>() ?? "";
            var (name, ours) = OpensWith(e.Key, exe);
            var (previewer, ourPreview) = Previewer.PreviewsWith(e.Key);
            return (JsonNode?)new JsonObject
            {
                ["extension"] = e.Key, ["language"] = language,
                ["languageName"] = packs?[language]?["name"]?.GetValue<string>() ?? language,
                ["mode"] = ModeOf(e.Key), ["opensWith"] = name, ["lexpen"] = ours,
                // The preview handler (docs/plans/PLAN-preview-handler.md 3.8): LexPen's set by LexPen, what Windows uses now.
                ["preview"] = Previewer.IsBound(e.Key), ["previewsWith"] = previewer, ["previewLexPen"] = ourPreview,
            };
        }).ToArray());
    }

    [DllImport("shell32.dll")]
    static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2);

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    static extern int AssocQueryString(int flags, int what, string assoc, string? extra, StringBuilder result, ref uint size);
}
