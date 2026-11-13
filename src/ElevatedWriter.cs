using System.ComponentModel;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace LexPen;

/// <summary>
/// Saving where the user may not write, and over a read-only file (docs/plans/PLAN-elevated-save.md). LexPen stays
/// unelevated: a second LexPen process, started as administrator (Windows' UAC prompt), does the write. It has no window;
/// it connects to a pipe of LexPen's (each end checks the other's process id) and writes what LexPen sends, one save at a
/// time, until the pipe closes. An ordinary save ends it after its write; while windows close (LexPen closing) it stays,
/// so every such file of that close goes through one UAC prompt. With the setting "elevation" at "keep" it stays after
/// the first save until stopped (the status bar's Elevated) or LexPen ends.
/// </summary>
sealed class ElevatedWriter(Action<bool> changed)
{
    /// <summary>The helper's command line: --write-elevated &lt;pipe&gt; &lt;LexPen's process id&gt;.</summary>
    public const string Arg = "--write-elevated";

    /// <summary>A file written as a save writes it (TextFile.WriteBytes). <paramref name="keepReadOnly"/>: a read-only
    /// file's mark is cleared for the write and set again after it, also when the write fails.</summary>
    public static void Write(string path, byte[] bytes, bool backup, bool keepReadOnly)
    {
        if (!keepReadOnly || !File.Exists(path) || !File.GetAttributes(path).HasFlag(FileAttributes.ReadOnly))
        {
            TextFile.WriteBytes(path, bytes, backup);
            return;
        }
        File.SetAttributes(path, File.GetAttributes(path) & ~FileAttributes.ReadOnly);
        try { TextFile.WriteBytes(path, bytes, backup); }
        finally { File.SetAttributes(path, File.GetAttributes(path) | FileAttributes.ReadOnly); }
    }

    // ---------- The helper (Program.Main, elevated) ----------

    /// <summary>Connects to LexPen's pipe, checks that LexPen (<paramref name="pid"/>) is at its other end, and writes
    /// what it sends until the pipe closes (LexPen done with it, or gone). Each answer: "" written, else the error.</summary>
    public static void Serve(string pipe, int pid)
    {
        using var client = new NamedPipeClientStream(".", pipe, PipeDirection.InOut);
        try { client.Connect(30000); }
        catch (TimeoutException) { return; }
        if (!GetNamedPipeServerProcessId(client.SafePipeHandle, out var server) || server != (uint)pid) return;
        // Not disposed: disposing flushes, and the pipe may be closed by then.
        var read = new BinaryReader(client, Encoding.UTF8, leaveOpen: true);
        var answer = new BinaryWriter(client, Encoding.UTF8, leaveOpen: true);
        while (true)
        {
            string path;
            bool backup, keepReadOnly;
            byte[] bytes;
            try
            {
                path = read.ReadString();
                backup = read.ReadBoolean();
                keepReadOnly = read.ReadBoolean();
                bytes = read.ReadBytes(read.ReadInt32());
            }
            catch (Exception ex) when (ex is EndOfStreamException or IOException) { return; }
            var error = "";
            try { Write(path, bytes, backup, keepReadOnly); }
            catch (Exception ex) { error = ex.Message; }
            try { answer.Write(error); answer.Flush(); }
            catch (IOException) { return; }
        }
    }

    // ---------- LexPen's side ----------

    NamedPipeServerStream? pipe;
    readonly SemaphoreSlim one = new(1, 1);
    readonly HashSet<object> closing = [];

    /// <summary>A window's close is going on (its page saving what it was asked to): the helper stays between saves.</summary>
    public bool Closing => closing.Count > 0;

    /// <summary>A helper runs (between saves only while windows close, or kept).</summary>
    public bool Running => pipe is { IsConnected: true };

    /// <summary>Kept after its save (the setting "elevation": "keep") until <see cref="Stop"/>.</summary>
    public bool Kept { get; private set; }

    /// <summary>The status bar's Elevated clicked: the kept helper ends (now, or after the write going on).</summary>
    public void Stop()
    {
        Kept = false;
        if (!Closing && one.Wait(0)) { End(); one.Release(); }
    }

    /// <summary>A close began (true) or ended (false: closed, or cancelled): a window's, or Manage projects closing
    /// several windows one after another. The last one to end ends the helper.</summary>
    public void SetClosing(object close, bool on)
    {
        if (on) { closing.Add(close); return; }
        if (!closing.Remove(close) || closing.Count > 0 || Kept) return;
        if (one.Wait(0)) { End(); one.Release(); }   // else the write going on ends it
    }

    /// <summary>A file written by the helper, started first when none runs (the UAC prompt, owned by
    /// <paramref name="owner"/>). <paramref name="noted"/> runs just before the write (our own write, not news).
    /// <paramref name="keep"/>: the helper stays after it. False: the UAC prompt was cancelled. A failed write throws
    /// IOException with the helper's message.</summary>
    public async Task<bool> Write(IntPtr owner, string path, byte[] bytes, bool backup, bool keepReadOnly, bool keep, Action noted)
    {
        await one.WaitAsync();
        try
        {
            if (!Running && !await Start(owner)) return false;
            Kept |= keep;
            var server = pipe!;
            noted();
            string error;
            try
            {
                error = await Task.Run(() =>
                {
                    var send = new BinaryWriter(server, Encoding.UTF8, leaveOpen: true);
                    send.Write(path);
                    send.Write(backup);
                    send.Write(keepReadOnly);
                    send.Write(bytes.Length);
                    send.Write(bytes);
                    send.Flush();
                    return new BinaryReader(server, Encoding.UTF8, leaveOpen: true).ReadString();
                });
            }
            catch (Exception ex) when (ex is IOException or ObjectDisposedException)   // the helper gone (ended, killed)
            {
                End();
                throw new IOException("The administrator's process for saving ended before the file was written.");
            }
            if (error.Length > 0) throw new IOException(error);
            return true;
        }
        finally
        {
            if (!Closing && !Kept) End();
            one.Release();
        }
    }

    // The pipe (only this user and administrators may open it), then the helper as administrator; it must connect from
    // the process that was started. False: the UAC prompt was cancelled.
    async Task<bool> Start(IntPtr owner)
    {
        var name = $"LexPen-write-{Guid.NewGuid():N}";
        var security = new PipeSecurity();
        security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User!, PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
            PipeAccessRights.ReadWrite | PipeAccessRights.Synchronize, AccessControlType.Allow));
        var server = NamedPipeServerStreamAcl.Create(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 0, 0, security);
        Process? helper;
        try
        {
            // ErrorDialog: the only way the owner window reaches ShellExecuteEx, so the UAC prompt comes to the front.
            helper = await Task.Run(() => Process.Start(new ProcessStartInfo(Environment.ProcessPath!)
            {
                UseShellExecute = true, Verb = "runas", Arguments = $"{Arg} {name} {Environment.ProcessId}",
                ErrorDialog = true, ErrorDialogParentHandle = owner,
            }));
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)   // ERROR_CANCELLED: the UAC prompt said No
        {
            server.Dispose();
            return false;
        }
        catch { server.Dispose(); throw; }
        using var stop = new CancellationTokenSource();
        var connect = server.WaitForConnectionAsync(stop.Token);
        var gone = helper is null ? Task.Delay(Timeout.Infinite, stop.Token) : helper.WaitForExitAsync(stop.Token);
        var first = await Task.WhenAny(connect, gone, Task.Delay(30000, stop.Token));
        stop.Cancel();
        if (first != connect || !connect.IsCompletedSuccessfully || helper is null
            || !GetNamedPipeClientProcessId(server.SafePipeHandle, out var client) || client != (uint)helper.Id)
        {
            server.Dispose();
            throw new IOException("The administrator's process for saving did not start.");
        }
        pipe = server;
        changed(true);
        return true;
    }

    // The pipe closed: the helper ends.
    void End()
    {
        Kept = false;
        if (pipe is null) return;
        pipe.Dispose();
        pipe = null;
        changed(false);
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetNamedPipeClientProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint processId);
}
