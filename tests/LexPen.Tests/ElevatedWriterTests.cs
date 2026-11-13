using System.IO.Pipes;
using System.Text;

namespace LexPen.Tests;

// docs/plans/PLAN-elevated-save.md: the write a save does over a read-only file, and the helper's side of the pipe (run
// here unelevated, in this process: the elevation itself is Windows' and is tested by hand).
public class ElevatedWriterTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-elevated-" + Guid.NewGuid().ToString("N"));

    public ElevatedWriterTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        foreach (var f in Directory.EnumerateFiles(dir)) File.SetAttributes(f, FileAttributes.Normal);
        Directory.Delete(dir, true);
    }

    string ReadOnlyFile(string name, string text)
    {
        var path = Path.Combine(dir, name);
        File.WriteAllText(path, text);
        File.SetAttributes(path, FileAttributes.ReadOnly);
        return path;
    }

    static bool IsReadOnly(string path) => File.GetAttributes(path).HasFlag(FileAttributes.ReadOnly);

    [Fact]
    public void ReadOnlyFileRefusedWithoutKeep()
    {
        var path = ReadOnlyFile("a.txt", "old");
        Assert.Throws<UnauthorizedAccessException>(() => ElevatedWriter.Write(path, "new"u8.ToArray(), false, false));
        Assert.Equal("old", File.ReadAllText(path));
    }

    [Fact]
    public void KeepReadOnlyWritesAndSetsTheMarkAgain()
    {
        var path = ReadOnlyFile("a.txt", "old");
        ElevatedWriter.Write(path, "new"u8.ToArray(), true, true);
        Assert.Equal("new", File.ReadAllText(path));
        Assert.True(IsReadOnly(path));
        Assert.Equal("old", File.ReadAllText(path + ".bak"));
    }

    [Fact]
    public void KeepReadOnlyFailedWriteLeavesTheFileAsItWas()
    {
        var path = ReadOnlyFile("a.txt", "old");
        using (new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))   // locked: the replace fails
            Assert.ThrowsAny<IOException>(() => ElevatedWriter.Write(path, "new"u8.ToArray(), false, true));
        Assert.Equal("old", File.ReadAllText(path));
        Assert.True(IsReadOnly(path));
    }

    [Fact]
    public void KeepReadOnlyOnAnOrdinaryFileJustWrites()
    {
        var path = Path.Combine(dir, "b.txt");
        File.WriteAllText(path, "old");
        ElevatedWriter.Write(path, "new"u8.ToArray(), false, true);
        Assert.Equal("new", File.ReadAllText(path));
        Assert.False(IsReadOnly(path));
    }

    // LexPen's end of the pipe, as ElevatedWriter's own side speaks it.
    static string Send(NamedPipeServerStream pipe, string path, string text, bool backup, bool keepReadOnly)
    {
        using var send = new BinaryWriter(pipe, Encoding.UTF8, leaveOpen: true);
        var bytes = Encoding.UTF8.GetBytes(text);
        send.Write(path);
        send.Write(backup);
        send.Write(keepReadOnly);
        send.Write(bytes.Length);
        send.Write(bytes);
        send.Flush();
        using var read = new BinaryReader(pipe, Encoding.UTF8, leaveOpen: true);
        return read.ReadString();
    }

    [Fact]
    public async Task HelperServesWritesUntilThePipeCloses()
    {
        var name = "lexpen-test-" + Guid.NewGuid().ToString("N");
        var pipe = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var helper = Task.Run(() => ElevatedWriter.Serve(name, Environment.ProcessId));
        await pipe.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(10));
        var a = Path.Combine(dir, "a.txt");
        var b = ReadOnlyFile("b.txt", "old");
        Assert.Equal("", Send(pipe, a, "one", false, false));
        Assert.Equal("", Send(pipe, b, "two", true, true));
        Assert.NotEqual("", Send(pipe, Path.Combine(dir, "no-such-folder", "c.txt"), "x", false, false));   // its message
        pipe.Dispose();
        await helper.WaitAsync(TimeSpan.FromSeconds(10));   // ends with the pipe
        Assert.Equal("one", File.ReadAllText(a));
        Assert.Equal("two", File.ReadAllText(b));
        Assert.True(IsReadOnly(b));
    }

    [Fact]
    public async Task HelperRefusesAnotherProcessAtThePipe()
    {
        var name = "lexpen-test-" + Guid.NewGuid().ToString("N");
        using var pipe = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        var helper = Task.Run(() => ElevatedWriter.Serve(name, Environment.ProcessId + 1));   // not the pipe's process
        await pipe.WaitForConnectionAsync().WaitAsync(TimeSpan.FromSeconds(10));
        await helper.WaitAsync(TimeSpan.FromSeconds(10));   // gone without serving
        var a = Path.Combine(dir, "a.txt");
        Assert.ThrowsAny<IOException>(() => Send(pipe, a, "one", false, false));
        Assert.False(File.Exists(a));
    }
}
