using System.Text.Json;

namespace LexPen.Tests;

// web/macrolang.js run under Jint: a line ending in \ goes on on the next.
public class MacroLangTests
{
    static readonly string Source = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "macrolang.js"));

    // The macro's problems as "line:col message" and its steps as "op@line".
    static (string[] Problems, string[] Steps) Program(string text)
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        engine.SetValue("text", text);
        var json = engine.Evaluate("JSON.stringify((p => ({ problems: p.problems, steps: p.main.code }))(macroProgram(text, {})))").ToString();
        var root = JsonDocument.Parse(json).RootElement;
        return (
            root.GetProperty("problems").EnumerateArray().Select(p => $"{p.GetProperty("line")}:{p.GetProperty("col")} {p.GetProperty("message").GetString()}").ToArray(),
            root.GetProperty("steps").EnumerateArray().Select(s => $"{s.GetProperty("op").GetString()}@{s.GetProperty("line")}").ToArray());
    }

    [Fact]
    public void ABackslashAtTheEndJoinsTheNextLineIntoOneStatementAtItsFirstLine()
    {
        var joined = Program("set $a = 1 + \\\n   2 + \\\r\n   3\ntype $a");
        var plain = Program("set $a = 1 + 2 + 3\ntype $a");
        Assert.Empty(joined.Problems);
        Assert.Equal(plain.Steps.Select(s => s.Split('@')[0]), joined.Steps.Select(s => s.Split('@')[0]));
        Assert.Equal("1", joined.Steps[0].Split('@')[1]);
        Assert.Equal("4", joined.Steps[^1].Split('@')[1]);
    }

    [Fact]
    public void AMistakeOnAContinuedLineIsReportedAtThatLineAndColumn()
    {
        var (problems, _) = Program("set $a = 1 + \\\n 2 + \\\n 3 ~");
        Assert.Equal("3:3 \"~\" is not part of the macro language", Assert.Single(problems));
    }

    [Fact]
    public void ABackslashInTextOrACommentDoesNotContinue()
    {
        Assert.Empty(Program("# a note \\\ntype \"b\"").Problems);
        Assert.Contains(Program("type \"a\\\ntype \"b\"").Problems, p => p.StartsWith("1:"));
        Assert.Empty(Program("type \"x\\\\\" \\\n & \"y\"").Problems);
    }

    // A run where every action throws `thrown` (JavaScript): the error it ends with as "line message".
    static string RunError(string text, string thrown)
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        engine.SetValue("text", text);
        engine.Execute($$"""
            var out = 'pending';
            const env = { action() { throw {{thrown}}; } };
            runMacro(macroProgram(text, {}), env).then(r => { out = (r.error?.line ?? 'none') + ' ' + r.error?.message; });
            """);
        engine.Advanced.ProcessTasks();
        return engine.Evaluate("out").ToString();
    }

    [Fact]
    public void AStepsErrorThatStopsTheMacroKeepsItsLine()
    {
        Assert.Equal("2 there is no action x", RunError("set $a = 1\nx", "new MacroError('there is no action x')"));
        Assert.Equal("2 broken", RunError("set $a = 1\nx", "new Error('broken')"));
        // Inside a procedure: the line of the step there, not of the call.
        Assert.Equal("3 there is no action x", RunError("p\nprocedure p\n  x\nendprocedure", "new MacroError('there is no action x')"));
    }

    [Fact]
    public void ABackslashOnTheLastLineIsAMistake()
    {
        var (problems, _) = Program("type \"x\" \\");
        Assert.Equal("1:9 this line goes on (\\ at its end), but no line follows", Assert.Single(problems));
    }
}
