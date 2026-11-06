using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json.Nodes;

namespace LexPen;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        // --delete-backups (Explorer's Delete .bak file / Delete all .bak files, plan 33): a file's backup, or every backup
        // in a folder and below it, to the Recycle Bin; no question, no window.
        if (Array.IndexOf(args, "--delete-backups") is var del and >= 0)
        {
            if (del + 1 < args.Length && Path.GetFullPath(args[del + 1]) is var path)
                Backups.Delete(File.Exists(path) ? (Backups.Of(path) is string own ? [own] : []) : Backups.In(path, true).ToList());
            return;
        }
        // --compare-left (Explorer's Select left side to compare): the left side kept, the entries rewritten, no window.
        if (Array.IndexOf(args, "--compare-left") is var at and >= 0)
        {
            if (at + 1 < args.Length) ExplorerMenu.SelectLeft(Path.GetFullPath(args[at + 1]));
            return;
        }
        var (newWindow, compare, view, edit, rest) = ParseArgs(args);
        var shift = newWindow || (Control.ModifierKeys & Keys.Shift) != 0;
        var paths = rest.Select(Path.GetFullPath).ToArray();   // against this process's current folder

        // One instance per user and exe: a debug build and the published one do not meet.
        var exe = Environment.ProcessPath ?? AppContext.BaseDirectory;
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(exe.ToLowerInvariant())))[..16];
        var name = $"LexPen-{WindowsIdentity.GetCurrent().User?.Value}-{hash}";

        using var mutex = new Mutex(true, @"Local\" + name, out var owner);
        if (!owner)
        {
            if (Send(name, paths, shift, compare, view, edit)) return;
            // The running instance is closing: wait for it, then take over.
            try { owner = mutex.WaitOne(TimeSpan.FromSeconds(5)); }
            catch (AbandonedMutexException) { owner = true; }
        }

        // The first LexPen process moves an older data folder layout over, before any window or browser starts.
        if (owner) DataFolder.Migrate(AppHost.DataDir);
        if (owner) MacroStore.MigrateLast(AppHost.DataDir);   // the last recording of before: a Macro N (plan 36)
        var app = new AppHost();
        // The UI thread's stalls (every window shares it), in stalls.log; a control of its own to ask the thread for a beat.
        var beat = new Control();
        _ = beat.Handle;   // its window handle: BeginInvoke needs one
        StallLog.Start(beat, DataFolder.StatePath(AppHost.DataDir, "stalls.log"));
        app.WatchSettings();
        app.WatchThemes();
        app.WatchLanguages();
        app.WatchMacros();
        if (owner) app.RefreshExplorerMenu();   // a new version over the old one: Explorer's entries its way
        app.Launch(paths, shift, compare, view, edit);
        if (owner) app.Listen(name);
        Application.EnterThreadModal += ShowPointer;
        Application.LeaveThreadModal += RestorePointer;
        Application.Run(app);
        if (owner) mutex.ReleaseMutex();
    }

    // The mouse pointer over a dialog (Open, Save as, a question). Typing in the editor hides it (Windows' "Hide pointer
    // while typing"), and the browser view shows it again on a mouse move over itself only: a dialog opened from the
    // keyboard (Alt+F O) had no pointer until it closed. Shown while the dialog is open, then hidden again as it was;
    // the browser view shows it on the next move, as before. Per dialog, a dialog over a dialog included: how often it
    // was raised, lowered as often when that dialog closes.
    static readonly Stack<int> pointerRaised = new();

    static void ShowPointer(object? sender, EventArgs e)
    {
        var raised = 1;
        for (var count = ShowCursor(true); count < 0; count = ShowCursor(true)) raised++;
        pointerRaised.Push(raised);
    }

    static void RestorePointer(object? sender, EventArgs e)
    {
        if (!pointerRaised.TryPop(out var raised)) return;
        for (; raised > 0; raised--) ShowCursor(false);
    }

    [DllImport("user32.dll")]
    static extern int ShowCursor(bool show);

    // "-n" or "--new-window": a new window, as with Shift held. "-c" or "--compare": the two paths compared (two files
    // or two folders), in a new window. "--view": the files and folders in the project for viewing (Explorer's View in
    // LexPen, docs/plans/executed/PLAN-view-window.md). "--edit": as without a switch, the files in the editor whatever the
    // language opens in (Explorer's Edit in LexPen). Everything else is a file or folder.
    internal static (bool NewWindow, bool Compare, bool View, bool Edit, string[] Paths) ParseArgs(string[] args)
    {
        static bool IsNewWindow(string a) => a is "-n" or "--new-window";
        static bool IsCompare(string a) => a is "-c" or "--compare";
        static bool IsView(string a) => a == "--view";
        static bool IsEdit(string a) => a == "--edit";
        return (args.Any(IsNewWindow), args.Any(IsCompare), args.Any(IsView), args.Any(IsEdit),
            args.Where(a => !IsNewWindow(a) && !IsCompare(a) && !IsView(a) && !IsEdit(a)).ToArray());
    }

    // Hands the paths to the running instance; false when it does not answer.
    static bool Send(string name, string[] paths, bool shift, bool compare, bool view, bool edit)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.CurrentUserOnly);
            client.Connect(3000);
            AllowSetForegroundWindow(-1);   // ASFW_ANY: let the running instance bring its window to the front
            var msg = new JsonObject
            {
                ["paths"] = new JsonArray(paths.Select(p => (JsonNode?)p).ToArray()),
                ["shift"] = shift,
                ["compare"] = compare,
                ["view"] = view,
                ["edit"] = edit,
            };
            client.Write(Encoding.UTF8.GetBytes(msg.ToJsonString() + "\n"));
            using var reader = new StreamReader(client);
            return reader.ReadLine() == "ok";
        }
        catch (Exception ex) when (ex is TimeoutException or IOException) { return false; }
    }

    [DllImport("user32.dll")]
    static extern bool AllowSetForegroundWindow(int processId);
}
