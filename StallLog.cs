using System.Diagnostics;

namespace LexPen;

/// <summary>
/// Stalls of the UI thread, written to stalls.log in the state folder. Every LexPen window shares that one thread (one
/// process), so a long job of one window keeps the keys from every other one. A watchdog thread asks the UI thread for
/// a beat four times a second; when the answer is more than <see cref="Threshold"/> late, it notes what the UI thread
/// was doing meanwhile (<see cref="Doing"/>: a page request, a Windows message, an event to a page), and writes one line
/// when the thread answers again: when, how long, what. The page writes its own long scripts here too (op stallNote).
/// </summary>
static class StallLog
{
    const int Threshold = 500;          // ms late before it counts as a stall
    const int Beat = 250;               // ms between the watchdog's beats
    const long MaxBytes = 256 * 1024;   // past this the older half of the file goes

    static readonly object gate = new();
    static string? doing;               // what the UI thread is doing now (set and cleared on the UI thread)
    static string? lastDone;            // the last thing marked that ended, and when (for a stall outside them)
    static long lastDoneAt;
    static string? path;
    static Control? ui;

    /// <summary>Starts the watchdog for the UI thread that owns <paramref name="control"/>.</summary>
    public static void Start(Control control, string logPath)
    {
        ui = control;
        path = logPath;
        var thread = new Thread(Watch) { IsBackground = true, Name = "LexPen stall watchdog" };
        thread.Start();
    }

    /// <summary>Marks what the UI thread does until the result is disposed (nested: the outer one comes back).</summary>
    public static Scope Doing(string what)
    {
        var before = doing;
        doing = what;
        return new Scope(before);
    }

    public readonly struct Scope(string? before) : IDisposable
    {
        public void Dispose()
        {
            lastDone = doing;
            lastDoneAt = Environment.TickCount64;
            doing = before;
        }
    }

    /// <summary>A line of the page's own (a script that ran long).</summary>
    public static void Note(string text) => Write($"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  page  {text}");

    static void Watch()
    {
        var clock = Stopwatch.StartNew();
        long answered = 0;
        while (true)
        {
            Thread.Sleep(Beat);
            var control = ui;
            if (control is null || control.IsDisposed) continue;
            var asked = clock.ElapsedMilliseconds;
            var done = new ManualResetEventSlim();
            try { control.BeginInvoke(() => { Interlocked.Exchange(ref answered, clock.ElapsedMilliseconds); done.Set(); }); }
            catch (InvalidOperationException) { continue; }   // the window is closing
            if (done.Wait(Threshold)) continue;
            // Late: what the UI thread does meanwhile, sampled until it answers.
            var seen = new List<string>();
            var started = DateTime.Now;
            var before = lastDone is string last ? $"; the last before it: {last}, {Environment.TickCount64 - lastDoneAt} ms earlier" : "";
            while (!done.Wait(50))
                if (doing is string what && !seen.Contains(what)) seen.Add(what);
            var late = Interlocked.Read(ref answered) - asked;
            Write($"{started:yyyy-MM-dd HH:mm:ss}  host  {late} ms  " +
                (seen.Count > 0 ? string.Join("; ", seen) : $"not in LexPen's own code (WebView2 or Windows){before}"));
        }
    }

    static void Write(string line)
    {
        if (path is null) return;
        lock (gate)
        {
            try
            {
                // Opened only for the moment of writing, and shared: another program may read it (and keep it open)
                // meanwhile.
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                using var file = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.ReadWrite | FileShare.Delete);
                if (file.Length > MaxBytes)
                {
                    string kept;
                    using (var reader = new StreamReader(file, leaveOpen: true)) kept = reader.ReadToEnd();
                    kept = kept[(kept.IndexOf('\n', kept.Length / 2) + 1)..];   // the newer half, from a line's start
                    file.SetLength(0);
                    using var w = new StreamWriter(file, leaveOpen: true);
                    w.Write(kept);
                }
                file.Seek(0, SeekOrigin.End);
                using var writer = new StreamWriter(file);
                writer.Write(line + Environment.NewLine);
            }
            catch (IOException) { }
        }
    }
}
