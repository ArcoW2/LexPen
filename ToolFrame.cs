using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace LexPen;

/// <summary>
/// A tool's page docked in a LexPen window (docs/plans/executed/PLAN-docking.md 7b): the same page as in its own window
/// (charpicker.html, ...), in a frame of the window's page, named "tool:kind" (the window's) or "tool:kind:n" (editor
/// pane n's own: it works on that pane's document). Its requests come to the host through
/// the frame (CoreWebView2Frame) and are answered as its own window answers them, for this window; the app's events for
/// that kind of tool (settings, look, ...) reach it as they reach its window. Until the page asked "init", events wait.
/// </summary>
sealed class ToolFrame : IWebPost
{
    readonly AppHost app;
    readonly CoreWebView2Frame frame;
    readonly List<string> queue = [];
    bool ready, gone;

    public MainForm Window { get; }
    public string Kind { get; }
    public int? Pane { get; }   // an editor pane's own; null: the window's

    public ToolFrame(AppHost app, MainForm window, CoreWebView2Frame frame, string name)
    {
        (this.app, Window, this.frame) = (app, window, frame);
        var parts = name.Split(':');
        Kind = parts[0];
        if (parts.Length > 1 && int.TryParse(parts[1], out var pane)) Pane = pane;
        frame.WebMessageReceived += (_, m) =>
        {
            var json = m.WebMessageAsJson;
            window.BeginInvoke(() => OnMessage(json));
        };
        frame.Destroyed += (_, _) => { gone = true; app.ToolFrameGone(this); };
    }

    async void OnMessage(string json)
    {
        if (gone || Window.IsDisposed) return;
        var msg = JsonNode.Parse(json)!;
        if (msg["id"] is null) return;   // not a request (a pane page's own message)
        var reply = new JsonObject { ["id"] = msg["id"]!.GetValue<int>() };
        try { reply["result"] = await app.ToolRequest(this, msg); }
        catch (Exception ex) { reply["error"] = ex.Message; }
        Send(reply.ToJsonString());
        if (msg["op"]?.GetValue<string>() == "init")
        {
            ready = true;
            foreach (var queued in queue) Send(queued);
            queue.Clear();
        }
    }

    void Send(string json)
    {
        if (gone) return;
        try { frame.PostWebMessageAsJson(json); }
        catch (Exception ex) when (ex is InvalidOperationException or System.Runtime.InteropServices.COMException) { gone = true; }
    }

    public void Post(JsonObject message)
    {
        if (ready) Send(message.ToJsonString());
        else queue.Add(message.ToJsonString());
    }

    public void ApplyTheme() { }   // its page follows the look it is sent; the window's caption is its window's own
}
