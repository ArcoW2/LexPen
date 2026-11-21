using System.Runtime.InteropServices;
using System.Runtime.InteropServices.Marshalling;
using System.Text;
using Microsoft.Win32;

namespace LexPen;

/// <summary>
/// LexPen as a Windows preview handler (docs/plans/PLAN-preview-handler.md): a COM class LexPen.exe serves itself, as a
/// local server (registered at its start with CoRegisterClassObject; Windows starts "LexPen.exe -Embedding" when no
/// LexPen runs). A host (Explorer's preview pane, Foldex) creates one handler per preview it shows, gives it a file
/// (or a stream) and a window; the handler shows the file in a previewer: a MainForm without a project, a child of the
/// host's window, read-only (AppHost.OpenPreviewer).
/// </summary>
static class Previewer
{
    public static readonly Guid Clsid = new("5A311364-459D-4F66-8434-18A69C5691AC");
    public const string Name = "LexPen preview";

    // The handlers' own COM wrappers: the generated ones (no built-in COM interop needed).
    internal static readonly StrategyBasedComWrappers Wrappers = new();
    static uint cookie;

    /// <summary>Registers the class with COM for this process, so a host's CoCreateInstance reaches it. On the UI thread
    /// (an STA): the calls come in on it, between the window messages.</summary>
    public static void Serve(AppHost app)
    {
        if (cookie != 0) return;
        var factory = Wrappers.GetOrCreateComInterfaceForObject(new PreviewClassFactory(app), CreateComInterfaceFlags.None);
        var clsid = Clsid;
        if (CoRegisterClassObject(ref clsid, factory, ClsctxLocalServer, RegclsMultipleUse, out cookie) != 0) cookie = 0;
        Marshal.Release(factory);   // COM holds its own reference while registered
    }

    public static void Revoke()
    {
        if (cookie == 0) return;
        CoRevokeClassObject(cookie);
        cookie = 0;
    }

    // ---------- Registration (for the current user; below LEXPEN_REGISTRY_ROOT in the tests, as FileTypes) ----------
    static string ClassKey => $@"{FileTypes.Classes}\CLSID\{Clsid:B}";
    static string HandlersKey => $@"{FileTypes.Software}\Microsoft\Windows\CurrentVersion\PreviewHandlers";

    /// <summary>The exe the class is registered with; null when it is not.</summary>
    public static string? RegisteredExe
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(ClassKey + @"\LocalServer32");
            return key?.GetValue(null) is string command ? command.Trim().Trim('"') : null;
        }
    }

    /// <summary>The class (served by `exe`), listed as a preview handler, with the extensions LexPen shows: a list that
    /// binds nothing, the same for every host that reads it (a host choosing its previewers itself, as Foldex). Binding an
    /// extension for Explorer is the File types dialog's.</summary>
    public static void Register(string exe, IEnumerable<string> extensions)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(ClassKey))
        {
            key.SetValue(null, Name);
            key.SetValue("DisplayName", Name);
            key.SetValue("Extensions", extensions.Order(StringComparer.OrdinalIgnoreCase).ToArray(), RegistryValueKind.MultiString);
        }
        using (var key = Registry.CurrentUser.CreateSubKey(ClassKey + @"\LocalServer32"))
            key.SetValue(null, $"\"{exe}\"");
        using (var key = Registry.CurrentUser.CreateSubKey(HandlersKey))
            key.SetValue(Clsid.ToString("B"), Name);
    }

    /// <summary>At the start: registered when it is not yet, again when it names this exe (a new list of extensions) or an
    /// exe that is gone (LexPen moved). Another LexPen's (a debug build, another folder) stays. A debug build never
    /// registers itself where none is: it would take the previews from the LexPen you use.</summary>
    public static void Refresh(string exe, IEnumerable<string> extensions)
    {
        var registered = RegisteredExe;
        if (registered is not null && !string.Equals(registered, exe, StringComparison.OrdinalIgnoreCase) && File.Exists(registered))
            return;
#if DEBUG
        if (registered is null) return;
#endif
        try { Register(exe, extensions); }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException) { }
    }

    /// <summary>The class and its listing taken off (Settings: Remove LexPen's previewer), every extension of
    /// `extensions` bound to it first (each one's handler before it back).</summary>
    public static void Unregister(IEnumerable<string> extensions)
    {
        foreach (var e in extensions) Unbind(e);
        Registry.CurrentUser.DeleteSubKeyTree(ClassKey, throwOnMissingSubKey: false);
        using var key = Registry.CurrentUser.OpenSubKey(HandlersKey, writable: true);
        key?.DeleteValue(Clsid.ToString("B"), throwOnMissingValue: false);
    }

    // ---------- Binding an extension for Explorer (the File types dialog's Preview column) ----------
    // `.ext\shellex\{IPreviewHandler}` = LexPen's class. A handler of yours that was there before (in HKCU) is kept under
    // LexPen's class (Previous, per extension) and put back when LexPen is taken off; one of the machine's (HKLM) shows
    // again by itself once LexPen's is gone.
    const string HandlerIid = "{8895b1c6-b41f-4c1c-a562-0d564250836f}";
    static string ShellexKey(string extension) => $@"{FileTypes.Classes}\{extension}\shellex\{HandlerIid}";
    static string PreviousKey => ClassKey + @"\Previous";

    /// <summary>Whether Explorer previews the extension in LexPen, as far as LexPen set it (your own key).</summary>
    public static bool IsBound(string extension)
    {
        using var key = Registry.CurrentUser.OpenSubKey(ShellexKey(extension));
        return key?.GetValue(null) is string clsid && Guid.TryParse(clsid, out var g) && g == Clsid;
    }

    public static void Bind(string extension)
    {
        if (IsBound(extension)) return;
        using (var key = Registry.CurrentUser.OpenSubKey(ShellexKey(extension)))
            if (key?.GetValue(null) is string before && before.Length > 0)
                using (var previous = Registry.CurrentUser.CreateSubKey(PreviousKey))
                    previous.SetValue(extension, before);
        using (var key = Registry.CurrentUser.CreateSubKey(ShellexKey(extension)))
            key.SetValue(null, Clsid.ToString("B"));
    }

    public static void Unbind(string extension)
    {
        if (!IsBound(extension)) return;
        string? before;
        using (var previous = Registry.CurrentUser.OpenSubKey(PreviousKey, writable: true))
        {
            before = previous?.GetValue(extension) as string;
            previous?.DeleteValue(extension, throwOnMissingValue: false);
        }
        if (before is not null)
        {
            using var key = Registry.CurrentUser.CreateSubKey(ShellexKey(extension));
            key.SetValue(null, before);
        }
        else Registry.CurrentUser.DeleteSubKeyTree(ShellexKey(extension), throwOnMissingSubKey: false);
    }

    /// <summary>The preview handler Windows uses now for an extension: its name, and whether it is LexPen's; null for
    /// none. Asks Windows itself (AssocQueryString), so the machine's handlers and the file type's count too.</summary>
    public static (string? Name, bool Ours) PreviewsWith(string extension)
    {
        var size = 64u;
        var result = new StringBuilder((int)size);
        if (AssocQueryString(0, 16 /* ASSOCSTR_SHELLEXTENSION */, extension, HandlerIid, result, ref size) != 0
            || !Guid.TryParse(result.ToString(), out var clsid)) return (null, false);
        if (clsid == Clsid) return (Name, true);
        using var key = Registry.ClassesRoot.OpenSubKey($@"CLSID\{clsid:B}");
        return (key?.GetValue(null) as string is { Length: > 0 } name ? name : clsid.ToString("B"), false);
    }

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    static extern int AssocQueryString(int flags, int what, string assoc, string? extra, StringBuilder result, ref uint size);

    /// <summary>Started by COM for a host (no LexPen ran): "-Embedding" (or "/Embedding").</summary>
    public static bool IsEmbedding(string[] args) => args.Any(a => a.Equals("-Embedding", StringComparison.OrdinalIgnoreCase) || a.Equals("/Embedding", StringComparison.OrdinalIgnoreCase));

    const uint ClsctxLocalServer = 4;
    const uint RegclsMultipleUse = 1;

    [DllImport("ole32.dll")]
    static extern int CoRegisterClassObject(ref Guid clsid, nint unknown, uint context, uint flags, out uint cookie);

    [DllImport("ole32.dll")]
    static extern int CoRevokeClassObject(uint cookie);
}

// ---------- The interfaces (shell's, as Windows declares them; a pointer where the generator takes no struct) ----------

[StructLayout(LayoutKind.Sequential)]
struct NativeRect { public int Left, Top, Right, Bottom; }

[GeneratedComInterface, Guid("00000001-0000-0000-C000-000000000046")]
partial interface IClassFactory
{
    [PreserveSig] int CreateInstance(nint outer, nint iid, out nint instance);
    void LockServer([MarshalAs(UnmanagedType.Bool)] bool lockIt);
}

[GeneratedComInterface, Guid("b7d14566-0509-4cce-a71f-0a554233bd9b")]
partial interface IInitializeWithFile
{
    void Initialize([MarshalAs(UnmanagedType.LPWStr)] string path, uint mode);
}

[GeneratedComInterface, Guid("b824b49d-22ac-4161-ac8a-9916e8fa3f7f")]
partial interface IInitializeWithStream
{
    void Initialize(nint stream, uint mode);
}

[GeneratedComInterface, Guid("8895b1c6-b41f-4c1c-a562-0d564250836f")]
partial interface IPreviewHandler
{
    void SetWindow(nint hwnd, in NativeRect rect);
    void SetRect(in NativeRect rect);
    void DoPreview();
    void Unload();
    void SetFocus();
    nint QueryFocus();
    [PreserveSig] int TranslateAccelerator(nint msg);
}

[GeneratedComInterface, Guid("FC4801A3-2BA9-11CF-A229-00AA003D7352")]
partial interface IObjectWithSite
{
    void SetSite(nint site);
    [PreserveSig] int GetSite(nint iid, out nint site);
}

[StructLayout(LayoutKind.Sequential)]
struct NativeMsg { public nint Hwnd; public uint Message; public nint WParam, LParam; public uint Time; public int X, Y; }

// The host's side (3.7): its site gives it; TranslateAccelerator hands it a key the preview did not use.
[GeneratedComInterface, Guid("fec87aaf-35f9-447a-adb7-20234491401a")]
partial interface IPreviewHandlerFrame
{
    void GetWindowContext(nint info);
    [PreserveSig] int TranslateAccelerator(in NativeMsg msg);
}

[GeneratedComInterface, Guid("00000114-0000-0000-C000-000000000046")]
partial interface IOleWindow
{
    nint GetWindow();
    void ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)] bool enter);
}

[GeneratedComClass]
sealed partial class PreviewClassFactory(AppHost app) : IClassFactory
{
    public int CreateInstance(nint outer, nint iid, out nint instance)
    {
        instance = 0;
        if (outer != 0) return unchecked((int)0x80040110);   // CLASS_E_NOAGGREGATION
        var unknown = Previewer.Wrappers.GetOrCreateComInterfaceForObject(new PreviewHandler(app), CreateComInterfaceFlags.None);
        var hr = Marshal.QueryInterface(unknown, Marshal.PtrToStructure<Guid>(iid), out instance);
        Marshal.Release(unknown);
        return hr;
    }

    public void LockServer(bool lockIt) { }
}

/// <summary>One preview of a host: the file (or the stream's content) it was given, its window and place; the
/// previewer it shows them in, made on the first DoPreview and kept for the next file of the same host.</summary>
[GeneratedComClass]
sealed partial class PreviewHandler(AppHost app) : IInitializeWithFile, IInitializeWithStream, IPreviewHandler, IObjectWithSite, IOleWindow
{
    string? path;
    (string Name, string Text)? stream;
    nint parent;
    NativeRect rect;
    nint site;
    IPreviewHandlerFrame? frame;   // the host's, when its site has one (Explorer's has; a host may give none)
    MainForm? form;

    public void Initialize(string path, uint mode)
    {
        this.path = path;
        stream = null;
    }

    // A stream (a host without a path: an attachment): read whole now, a stream may not be read twice.
    void IInitializeWithStream.Initialize(nint stream, uint mode)
    {
        path = null;
        this.stream = ComStream.Read(stream);
    }

    public void SetWindow(nint hwnd, in NativeRect rect)
    {
        parent = hwnd;
        this.rect = rect;
        form?.EmbedIn(parent, Bounds());
    }

    public void SetRect(in NativeRect rect)
    {
        this.rect = rect;
        form?.EmbedIn(parent, Bounds());
    }

    public void DoPreview()
    {
        if (parent == 0) return;
        if (form is null || form.IsDisposed)
        {
            form = app.OpenPreviewer();
            form.HostKey = HostKey;
            form.EmbedIn(parent, Bounds());
        }
        if (path is not null) form.ShowPreview(path, null, null);
        else if (stream is { } s) form.ShowPreview(null, s.Name, s.Text);
    }

    // The file let go of; the previewer stays for the next file of this host until the host lets go (SetSite null).
    public void Unload()
    {
        form?.ClearPreview();
        path = null;
        stream = null;
    }

    public void SetFocus() => form?.FocusPreview();
    public nint QueryFocus() => GetFocus();
    public int TranslateAccelerator(nint msg) => 1;   // S_FALSE: LexPen's own keys are the page's

    public void SetSite(nint site)
    {
        if (this.site != 0) Marshal.Release(this.site);
        this.site = site;
        frame = null;
        if (site != 0)
        {
            Marshal.AddRef(site);
            var iid = typeof(IPreviewHandlerFrame).GUID;
            if (Marshal.QueryInterface(site, in iid, out var f) == 0)
            {
                frame = (IPreviewHandlerFrame)Previewer.Wrappers.GetOrCreateObjectForComInstance(f, CreateObjectFlags.None);
                Marshal.Release(f);
            }
        }
        else Close();
    }

    // A key the page did not use, to the host as the key message Windows would have sent it (Alt: a system key), as
    // preview handlers do (IPreviewHandlerFrame.TranslateAccelerator). True: the host took it.
    bool HostKey(int vk, bool alt)
    {
        if (frame is null || form is null) return false;
        var lParam = 1 | (nint)(MapVirtualKey((uint)vk, 0) << 16) | (alt ? 1 << 29 : 0);
        var msg = new NativeMsg { Hwnd = form.Handle, Message = alt ? 0x0104u : 0x0100u, WParam = vk, LParam = lParam, Time = (uint)Environment.TickCount };
        try { return frame.TranslateAccelerator(in msg) == 0; }
        catch (Exception ex) when (ex is COMException or InvalidCastException) { return false; }   // the host gone
    }

    [DllImport("user32.dll")]
    static extern uint MapVirtualKey(uint code, uint mapType);

    public int GetSite(nint iid, out nint site)
    {
        site = 0;
        return this.site == 0 ? unchecked((int)0x80004005) : Marshal.QueryInterface(this.site, Marshal.PtrToStructure<Guid>(iid), out site);
    }

    public nint GetWindow() => form?.Handle ?? parent;
    public void ContextSensitiveHelp(bool enter) { }

    void Close()
    {
        form?.Close();
        form = null;
    }

    Rectangle Bounds() => Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);

    [DllImport("user32.dll")]
    static extern nint GetFocus();
}

/// <summary>An IStream read to its end, with the name it gives (STATSTG.pwcsName; "" when none), as text.</summary>
static class ComStream
{
    public static (string Name, string Text) Read(nint stream)
    {
        var name = "";
        unsafe
        {
            var vtbl = *(nint**)stream;
            // IStream: QueryInterface, AddRef, Release, Read (3), Write, Seek, SetSize, CopyTo, Commit, Revert, LockRegion,
            // UnlockRegion, Stat (12), Clone.
            var stat = (delegate* unmanaged[Stdcall]<nint, StatStg*, uint, int>)vtbl[12];
            StatStg s;
            if (stat(stream, &s, 0 /* STATFLAG_DEFAULT: with the name */) == 0 && s.Name != 0)
            {
                name = Marshal.PtrToStringUni(s.Name) ?? "";
                Marshal.FreeCoTaskMem(s.Name);
            }
            var read = (delegate* unmanaged[Stdcall]<nint, byte*, uint, uint*, int>)vtbl[3];
            using var bytes = new MemoryStream();
            var buffer = new byte[64 * 1024];
            fixed (byte* b = buffer)
                for (;;)
                {
                    uint got = 0;
                    var hr = read(stream, b, (uint)buffer.Length, &got);
                    if (got > 0) bytes.Write(buffer, 0, (int)got);
                    if (hr != 0 || got == 0) break;
                }
            return (name, TextFile.Decode(bytes.ToArray()).Text);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct StatStg
    {
        public nint Name;
        public uint Type;
        public ulong Size;
        public long Modified, Created, Accessed;
        public uint Mode, Locks;
        public Guid Clsid;
        public uint StateBits, Reserved;
    }
}
