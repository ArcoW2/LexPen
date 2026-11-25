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

    // A run where every action is noted: "name arg arg" per call, a line each.
    static string RunActions(string text)
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        engine.SetValue("text", text);
        engine.Execute("""
            var out = [];
            const env = { action(name, args) { out.push([name, ...args].join(' ')); } };
            const program = macroProgram(text, {});
            if (program.problems.length) out.push(program.problems.map(p => p.message).join('; '));
            else runMacro(program, env);
            """);
        engine.Advanced.ProcessTasks();
        return engine.Evaluate("out.join('\\n')").ToString();
    }

    [Fact]
    public void AnActionTakesANegativeNumberAsItsArgument()
    {
        Assert.Equal("stepTab -1\nstepTab 1", RunActions("stepTab -1\nstepTab 1"));
        Assert.Equal("go -2.5 3", RunActions("go -2.5 3"));
    }

    // A run with message, ask, type and actions noted, a line each ("ask text | button | button"); ask answers
    // `answer` when it has buttons, else OK (as the host); a mistake or an error as its message.
    static string RunAsk(string text, string answer)
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        engine.SetValue("text", text);
        engine.SetValue("answer", answer);
        engine.Execute("""
            var out = [];
            const env = {
              message(t) { out.push('message ' + t); },
              ask(t, buttons) { out.push(['ask ' + t, ...buttons].join(' | ')); return buttons.length ? answer : 'OK'; },
              type(t) { out.push('type ' + t); },
              action(name) { out.push(name); },
            };
            const program = macroProgram(text, {});
            const errors = program.problems.filter(p => p.severity === 'error');
            if (errors.length) out.push(errors.map(p => p.message).join('; '));
            else runMacro(program, env).then(r => { if (r.error) out.push('error ' + r.error.message); });
            """);
        engine.Advanced.ProcessTasks();
        return engine.Evaluate("out.join('\\n')").ToString();
    }

    [Fact]
    public void MessageAndMessageboxShowTheirTextAndTheMacroGoesOn()
    {
        Assert.Equal("message Found 3\nask Done\nnext", RunAsk("set $n = 3\nmessage \"Found \" & $n\nmessagebox \"Done\"\nnext", ""));
    }

    [Fact]
    public void AskPutsTheButtonUsedInItsVariable()
    {
        Assert.Equal("ask Replace 2 times? | Yes | No\ntype No", RunAsk("ask $go \"Replace \" & 2 & \" times?\" \"Yes\" \"No\"\ntype $go", "No"));
        Assert.Equal("ask Sure? | Yes\ntype []", RunAsk("ask $go \"Sure?\" \"Yes\"\ntype \"[\" & $go & \"]\"", ""));   // closed: ""
        Assert.Equal("ask Sure?\ntype OK", RunAsk("ask $go \"Sure?\"\ntype $go", ""));   // no buttons: a messagebox
    }

    [Fact]
    public void AVariableSetByAskGivesNoWarningWhenRead()
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        engine.SetValue("text", "ask $go \"Sure?\" \"Yes\"\ntype $go");
        Assert.Equal("[]", engine.Evaluate("JSON.stringify(macroProgram(text, {}).problems)").ToString());
    }

    [Fact]
    public void AskMessageAndMessageboxNeedTheirParts()
    {
        Assert.Contains("a variable ($name) is needed here", RunAsk("ask \"Sure?\" \"Yes\"", ""));
        Assert.Contains("ask needs a text after its variable", RunAsk("ask $a", ""));
        Assert.Contains("message needs a text", RunAsk("message", ""));
        Assert.Contains("messagebox needs a text", RunAsk("messagebox", ""));
    }

    [Fact]
    public void ABackslashOnTheLastLineIsAMistake()
    {
        var (problems, _) = Program("type \"x\" \\");
        Assert.Equal("1:9 this line goes on (\\ at its end), but no line follows", Assert.Single(problems));
    }
}
