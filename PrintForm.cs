using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LexPen;

/// <summary>
/// The Print window (docs/plans/executed/PLAN-printing.md): a window of its own, modal to the LexPen window that asks. Its page
/// (web\print.html, print.js) shows the pages as they will come out and the options beside them; what it prints comes
/// from the asking window's page (`source`: the document's text, coloured, its rendered view, its highlights and
/// notes). Save as PDF prints that page to a file; Print sends it to the printer: by WebView2's own print when the
/// set has no printer settings of its own, else as page images with the stored DEVMODE (WebView2's print takes no
/// DEVMODE, so the driver's own choices would be lost).
/// </summary>
sealed class PrintForm : Form
{
    const string AppUrl = "https://lexpen.example/";
    const string FileUrl = "https://file.lexpen.example/";

    readonly AppHost app;
    readonly MainForm owner;
    readonly JsonNode source;
    readonly WebView2 web = new() { Dock = DockStyle.Fill };
    readonly string temp = Path.Combine(Path.GetTempPath(), "lexpen-print-" + Guid.NewGuid().ToString("N"));

    public PrintForm(AppHost app, MainForm owner, JsonNode source)
    {
        this.app = app;
        this.owner = owner;
        this.source = source;
        Fonts.Warm();
        Text = $"Print {source["title"]?.GetValue<string>()} - LexPen";
        Icon = owner.Icon;
        app.FollowCaption(this, () => owner);
        ShowInTaskbar = false;
        MinimumSize = new Size(760, 480);
        StartPosition = FormStartPosition.Manual;
        var at = owner.WindowState == FormWindowState.Normal ? owner.Bounds : owner.RestoreBounds;
        var size = new Size(Math.Max(760, at.Width * 9 / 10), Math.Max(480, at.Height * 9 / 10));
        Bounds = new Rectangle(at.X + (at.Width - size.Width) / 2, at.Y + (at.Height - size.Height) / 2, size.Width, size.Height);
        Controls.Add(web);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        BackColor = web.DefaultBackgroundColor = app.AppBackground(owner);
        var on = app.Mode == "dark" ? 1 : 0;
        DwmSetWindowAttribute(Handle, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, ref on, sizeof(int));
        app.ApplyCaption(this, owner);
        await web.EnsureCoreWebView2Async(await app.WebEnvironment());
        var core = web.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
#endif
        core.Settings.IsZoomControlEnabled = false;
        WebFiles.Serve(core);
        core.AddWebResourceRequestedFilter(FileUrl + "*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
        core.WebResourceRequested += OnFileRequested;
        core.ContextMenuRequested += (_, m) => WebFiles.BrowserMenu(m);
        core.WebMessageReceived += (_, m) =>
        {
            var json = m.WebMessageAsJson;
            BeginInvoke(() => OnMessage(json));
        };
        core.NavigationStarting += (_, n) => { if (!n.Uri.StartsWith(AppUrl)) n.Cancel = true; };
        core.NewWindowRequested += (_, n) => n.Handled = true;
        await core.AddScriptToExecuteOnDocumentCreatedAsync(app.FirstPaintScript(owner));
        core.Navigate($"{AppUrl}print.html");
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        try { if (Directory.Exists(temp)) Directory.Delete(temp, true); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    // The document's images and a PDF (its own, and the one made to print as images), as the window serves them.
    void OnFileRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (!e.Request.Uri.StartsWith(FileUrl, StringComparison.OrdinalIgnoreCase)) return;
        var path = Uri.UnescapeDataString(e.Request.Uri[FileUrl.Length..].Split('?', '#')[0]);
        var env = web.CoreWebView2.Environment;
        var cors = $"Access-Control-Allow-Origin: {AppUrl.TrimEnd('/')}";
        string? type = Path.GetExtension(path).Equals(".pdf", StringComparison.OrdinalIgnoreCase) ? "application/pdf"
            : MainForm.ImageTypes.GetValueOrDefault(Path.GetExtension(path));
        if (source["pdf"]?["path"]?.GetValue<string>() is { } own && string.Equals(own, path, StringComparison.OrdinalIgnoreCase)) type = "application/pdf";
        try
        {
            e.Response = type is not null && File.Exists(path)
                ? env.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(path)), 200, "OK", $"Content-Type: {type}\r\n{cors}")
                : env.CreateWebResourceResponse(null, 404, "Not Found", cors);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", cors);
        }
    }

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    async void OnMessage(string json)
    {
        if (IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        try { reply["result"] = await Answer(msg); }
        catch (Exception ex) { reply["error"] = ex.Message; }
        if (!IsDisposed) web.CoreWebView2.PostWebMessageAsJson(reply.ToJsonString());
    }

    /// <summary>A text's rendering as markdown, made by the main window after this one opened (printsource.js: it
    /// takes a moment for a large file): kept with the source (init gives it) and told to the page.</summary>
    public void Rendered(JsonNode msg)
    {
        if (source["views"] is JsonObject views) views["rendered"] = msg["rendered"]?.DeepClone();
        if (source["selection"]?["views"] is JsonObject part) part["rendered"] = msg["selection"]?.DeepClone();
        if (!IsDisposed && web.CoreWebView2 is { } core)
            core.PostWebMessageAsJson(new JsonObject { ["event"] = "rendered", ["rendered"] = msg["rendered"]?.DeepClone(), ["selection"] = msg["selection"]?.DeepClone() }.ToJsonString());
    }

    string Arg(JsonNode msg, string name) => msg[name]?.GetValue<string>() ?? "";

    async Task<JsonNode?> Answer(JsonNode msg)
    {
        switch (msg["op"]?.GetValue<string>())
        {
            case "init":
                return new JsonObject
                {
                    ["settings"] = app.SettingsFor(owner)["values"]?.DeepClone(), ["look"] = app.Look(owner),
                    // The date as Windows writes it (the header's and footer's date when no format is given).
                    ["datePattern"] = System.Globalization.CultureInfo.CurrentCulture.DateTimeFormat.ShortDatePattern,
                    ["culture"] = System.Globalization.CultureInfo.CurrentCulture.Name,
                    // The file's date (last written), for the header's and footer's $M; none for a new document.
                    ["fileDate"] = source["path"]?.GetValue<string>() is { } file && File.Exists(file) ? File.GetLastWriteTime(file).ToString("o") : null,
                    ["source"] = source.DeepClone(), ["printers"] = Printing.Printers(),
                    ["stored"] = new JsonObject { ["list"] = app.Prints.List(), ["last"] = app.Prints.Last },
                };
            case "printerInfo":
                return Printing.Info(Arg(msg, "name"));
            case "themeVars":
                return app.ThemeVars(Arg(msg, "theme"));
            case "fonts":   // as MainForm's: the font lists; null while they are being built (Fonts.Warm)
                if (!Fonts.Ready) return null;
                return new JsonArray(Fonts.List().Select(f => (JsonNode)new JsonObject { ["name"] = f.Name, ["mono"] = f.Mono }).ToArray());
            case "printerDialog":
                return Printing.Dialog(Handle, Arg(msg, "printer"), msg["devmode"]?.GetValue<string>(), msg["options"]!.AsObject());

            // The stored settings (PrintStore): as the stored sorts.
            case "printList":
                return new JsonObject { ["list"] = app.Prints.List(), ["last"] = app.Prints.Last };
            case "printSave":
                app.Prints.Save(Arg(msg, "name"), msg["settings"]!);
                return null;
            case "printDelete":
                return app.Prints.Delete(Arg(msg, "name"));
            case "printRename":
                return app.Prints.Rename(Arg(msg, "from"), Arg(msg, "to"));
            case "printTemplate":
                return app.Prints.SetTemplate(Arg(msg, "name"), msg["on"]?.GetValue<bool>() == true);
            case "printLast":
                app.Prints.SetLast(msg["last"]!);
                return null;

            case "confirm":
                return AskForm.Answer(app, this, new AskForm.Question
                {
                    Text = Arg(msg, "text"), Sign = AskForm.Sign.Warning,
                    Buttons = msg["ok"]?.GetValue<string>() is { } ok ? [("yes", ok, null), (null, "Cancel", null)] : [("yes", "Yes", null), (null, "No", null)],
                }) == "yes";

            // Save as PDF: a file picked, the page printed to it. Its path, or null (cancelled).
            case "savePdf":
            {
                using var d = new SaveFileDialog
                {
                    Filter = "PDF (*.pdf)|*.pdf", FileName = Arg(msg, "name"), OverwritePrompt = true,
                    InitialDirectory = Path.GetDirectoryName(source["path"]?.GetValue<string>() ?? "") ?? "",
                };
                if (d.ShowDialog(this) != DialogResult.OK) return null;
                return await ToPdf(msg, d.FileName) ? d.FileName : throw new IOException("The PDF could not be written.");
            }

            // To print as images: the pages as a PDF in the window's temporary folder, served to the page (it draws them).
            case "tempPdf":
            {
                Directory.CreateDirectory(temp);
                var path = Path.Combine(temp, "print.pdf");
                return await ToPdf(msg, path) ? FileUrl + Uri.EscapeDataString(path) : throw new IOException("The pages could not be made.");
            }
            case "pageImage":
            {
                Directory.CreateDirectory(temp);
                var path = Path.Combine(temp, $"page{msg["n"]!.GetValue<int>():D5}.png");
                await File.WriteAllBytesAsync(path, Convert.FromBase64String(Arg(msg, "data")));
                return null;
            }
            case "printImages":
            {
                var pages = Directory.Exists(temp) ? Directory.GetFiles(temp, "page*.png").Order(StringComparer.Ordinal).ToList() : [];
                var problem = await Task.Run(() => Printing.PrintImages(source["title"]?.GetValue<string>() ?? "LexPen", Arg(msg, "printer"),
                    msg["devmode"]?.GetValue<string>(), msg["options"]!.AsObject(), pages));
                return problem is null ? true : throw new IOException(problem);
            }

            // Print without printer settings of its own: WebView2's print, to the printer by name.
            case "print":
            {
                var s = PageSettings(msg);
                var o = msg["options"]!;
                s.PrinterName = Arg(msg, "printer");
                s.Copies = Math.Clamp(o["copies"]?.GetValue<int>() ?? 1, 1, 999);
                s.Duplex = o["duplex"]?.GetValue<string>() switch
                {
                    "long" => CoreWebView2PrintDuplex.TwoSidedLongEdge, "short" => CoreWebView2PrintDuplex.TwoSidedShortEdge,
                    "one" => CoreWebView2PrintDuplex.OneSided, _ => CoreWebView2PrintDuplex.Default,
                };
                if (o["colour"] is { } colour) s.ColorMode = colour.GetValue<bool>() ? CoreWebView2PrintColorMode.Color : CoreWebView2PrintColorMode.Grayscale;
                var status = await web.CoreWebView2.PrintAsync(s);
                return status == CoreWebView2PrintStatus.Succeeded ? true
                    : throw new IOException(status == CoreWebView2PrintStatus.PrinterUnavailable ? "The printer is not available." : "Printing failed.");
            }

            case "close":
                BeginInvoke(Close);
                return null;
            case var op:
                throw new InvalidOperationException($"Unknown request '{op}'.");
        }
    }

    // The page's paper (mm, as it lays it out: width and height already turned for landscape), no margins of the
    // browser's own (the pages have theirs), backgrounds on (the highlights, a theme's page), no browser header.
    CoreWebView2PrintSettings PageSettings(JsonNode msg)
    {
        var s = web.CoreWebView2.Environment.CreatePrintSettings();
        s.Orientation = CoreWebView2PrintOrientation.Portrait;
        s.PageWidth = msg["width"]!.GetValue<double>() / 25.4;
        s.PageHeight = msg["height"]!.GetValue<double>() / 25.4;
        s.MarginTop = s.MarginBottom = s.MarginLeft = s.MarginRight = 0;
        s.ScaleFactor = 1;
        s.ShouldPrintBackgrounds = true;
        s.ShouldPrintHeaderAndFooter = false;
        if (msg["ranges"]?.GetValue<string>() is { Length: > 0 } ranges) s.PageRanges = ranges;
        return s;
    }

    Task<bool> ToPdf(JsonNode msg, string path) => web.CoreWebView2.PrintToPdfAsync(path, PageSettings(msg));
}
