using System.Runtime.InteropServices;

namespace LexPen;

/// <summary>
/// The monitor a window is on (docs/plans/31-PLAN-settings-layers.md, zoom per screen): a key that follows the monitor,
/// not its place in the list or the port it is on (Screen.DeviceName, "\\.\DISPLAY2", can change with docking): the
/// device id Windows gives the monitor (EnumDisplayDevices with the device interface name), else the DeviceName.
/// With a name to show: the monitor's own and its size.
/// </summary>
static class Monitors
{
    /// <summary>The key and the name of the monitor most of the window is on.</summary>
    public static (string Key, string Name) Of(Form f)
    {
        var screen = Screen.FromControl(f);
        var size = $"{screen.Bounds.Width} x {screen.Bounds.Height}";
        var dd = new DisplayDevice { cb = Marshal.SizeOf<DisplayDevice>() };
        if (EnumDisplayDevices(screen.DeviceName, 0, ref dd, EddGetDeviceInterfaceName) && dd.DeviceID.Length > 0)
            return (dd.DeviceID, dd.DeviceString.Length > 0 ? $"{dd.DeviceString} ({size})" : size);
        return (screen.DeviceName, $"{screen.DeviceName.TrimStart('\\', '.')} ({size})");
    }

    const uint EddGetDeviceInterfaceName = 1;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct DisplayDevice
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern bool EnumDisplayDevices(string? device, uint index, ref DisplayDevice info, uint flags);
}

/// <summary>LexPen's own zoom of one monitor, on top of the global base (editorSize, zoom): points added to the editor
/// font, a factor on the preview zoom. Kept per monitor in state.json (AppHost.AppState.Screens).</summary>
sealed class ScreenZoom
{
    public double EditorStep { get; set; }
    public double PreviewFactor { get; set; } = 1;

    /// <summary>Changes a monitor's zoom (null: that part stays); a monitor back at the base (no step, factor 1) is
    /// dropped, so it shows the base.</summary>
    public static void Set(Dictionary<string, ScreenZoom> screens, string key, double? editorStep, double? previewFactor)
    {
        var zoom = screens.GetValueOrDefault(key) ?? new ScreenZoom();
        if (editorStep is double step) zoom.EditorStep = step;
        if (previewFactor is double factor) zoom.PreviewFactor = factor;
        if (zoom.EditorStep == 0 && Math.Abs(zoom.PreviewFactor - 1) < 1e-9) screens.Remove(key);
        else screens[key] = zoom;
    }
}
