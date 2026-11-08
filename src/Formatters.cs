using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace LexPen;

/// <summary>
/// Pretty print (docs/plans/executed/PLAN-formatters.md 3.3): JSON by a formatter of its own, so every token stays as written
/// (1.0 stays 1.0, a long number keeps its digits, an escape stays an escape, the key order is kept) and comments can
/// be kept; XML by XDocument and XmlWriter. Lines are joined with "\n" (the editor writes the file's own line ends).
/// A text that does not parse gives the line and column where it failed (1-based) and no text.
/// </summary>
static class Formatters
{
    public record Result(string? Text, string? Error = null, int Line = 0, int Column = 0);

    // ---------- JSON ----------

    enum Kind { Open, Close, Comma, Colon, String, Literal, LineComment, BlockComment }
    record Token(Kind Kind, string Text, int Line, int Column, int EndLine);

    class JsonError(string message, int line, int column) : Exception(message)
    {
        public int Line { get; } = line;
        public int Column { get; } = column;
    }

    /// <summary>Does the JSON text have // or /* */ comments? False when it cannot be read (the format says why).</summary>
    public static bool JsonHasComments(string text)
    {
        try { return Tokens(text).Any(t => t.Kind is Kind.LineComment or Kind.BlockComment); }
        catch (JsonError) { return false; }
    }

    public static Result Json(string text, string indent, bool keepComments)
    {
        try { return new Result(PrintJson(Tokens(text), indent, keepComments)); }
        catch (JsonError e) { return new Result(null, e.Message, e.Line, e.Column); }
    }

    static List<Token> Tokens(string text)
    {
        var tokens = new List<Token>();
        int i = 0, line = 1, lineStart = 0;
        while (i < text.Length)
        {
            var c = text[i];
            if (c == '\n') { i++; line++; lineStart = i; continue; }
            if (char.IsWhiteSpace(c) || c == '\uFEFF') { i++; continue; }
            int start = i, column = i - lineStart + 1, startLine = line;
            Token Make(Kind kind) => new(kind, text[start..i], startLine, column, line);
            switch (c)
            {
                case '{' or '[': i++; tokens.Add(Make(Kind.Open)); continue;
                case '}' or ']': i++; tokens.Add(Make(Kind.Close)); continue;
                case ',': i++; tokens.Add(Make(Kind.Comma)); continue;
                case ':': i++; tokens.Add(Make(Kind.Colon)); continue;
                case '"':
                    i++;
                    while (i < text.Length && text[i] != '"' && text[i] != '\n') i += text[i] == '\\' && i + 1 < text.Length && text[i + 1] != '\n' ? 2 : 1;
                    if (i >= text.Length || text[i] != '"') throw new JsonError("A string that is not closed (\" missing)", startLine, column);
                    i++;
                    tokens.Add(Make(Kind.String));
                    continue;
                case '/' when i + 1 < text.Length && text[i + 1] == '/':
                    while (i < text.Length && text[i] != '\n' && text[i] != '\r') i++;
                    tokens.Add(Make(Kind.LineComment));
                    continue;
                case '/' when i + 1 < text.Length && text[i + 1] == '*':
                    var end = text.IndexOf("*/", i + 2, StringComparison.Ordinal);
                    if (end < 0) throw new JsonError("A comment that is not closed (*/ missing)", startLine, column);
                    for (; i < end + 2; i++) if (text[i] == '\n') { line++; lineStart = i + 1; }
                    tokens.Add(Make(Kind.BlockComment));
                    continue;
            }
            while (i < text.Length && (char.IsLetterOrDigit(text[i]) || text[i] is '+' or '-' or '.')) i++;
            if (i == start) throw new JsonError($"Unexpected character '{c}'", startLine, column);
            var word = text[start..i];
            if (word is not ("true" or "false" or "null") && !System.Text.RegularExpressions.Regex.IsMatch(word, @"^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$"))
                throw new JsonError($"'{word}' is not a JSON value (a number, true, false or null)", startLine, column);
            tokens.Add(Make(Kind.Literal));
        }
        return tokens;
    }

    enum Expect { Value, ValueOrClose, KeyOrClose, Colon, CommaOrClose, End }

    static string PrintJson(List<Token> tokens, string indent, bool keepComments)
    {
        var sb = new StringBuilder();
        var stack = new Stack<char>();
        var expect = Expect.Value;
        bool breakNext = false, afterColon = false, spaceNext = false;
        Token? last = null;   // the last token written (comments too)
        void Line(int level) { sb.Append('\n'); for (var n = 0; n < level; n++) sb.Append(indent); }
        void Put(string s)
        {
            if (sb.Length > 0 && breakNext) Line(stack.Count);
            else if (afterColon || spaceNext) sb.Append(' ');
            sb.Append(s);
            breakNext = afterColon = spaceNext = false;
        }
        void AfterValue() => expect = stack.Count == 0 ? Expect.End : Expect.CommaOrClose;
        // The next token that is not a comment, its place, and whether comments come before it.
        (Token? next, int index, bool comments) Ahead(int at)
        {
            var seen = false;
            for (var j = at + 1; j < tokens.Count; j++)
            {
                if (tokens[j].Kind is not (Kind.LineComment or Kind.BlockComment)) return (tokens[j], j, seen);
                seen = true;
            }
            return (null, tokens.Count, seen);
        }
        JsonError Wrong(Token t, string what) => new(what, t.Line, t.Column);

        for (var at = 0; at < tokens.Count; at++)
        {
            var t = tokens[at];
            if (t.Kind is Kind.LineComment or Kind.BlockComment)
            {
                if (!keepComments) continue;
                if (last is not null && last.EndLine == t.Line && sb.Length > 0)   // after a token on its line: stays there
                    sb.Append(' ').Append(t.Text);
                else
                {
                    // On a line of its own, at the indentation inside its object or list; what follows it on its
                    // line (a block comment) stays after it.
                    if (sb.Length > 0) Line(stack.Count);
                    sb.Append(t.Text);
                    var (next, _, _) = Ahead(at);
                    breakNext = next is null || next.Line != t.EndLine;
                    spaceNext = !breakNext;
                    afterColon = false;
                }
                if (t.Kind == Kind.LineComment) breakNext = true;
                last = t;
                continue;
            }
            if (expect == Expect.End) throw Wrong(t, "Unexpected text after the end of the JSON value");
            switch (t.Kind)
            {
                case Kind.Open:
                    if (expect is not (Expect.Value or Expect.ValueOrClose)) throw Wrong(t, expect == Expect.KeyOrClose ? "Expected a key (a string)" : $"Expected {Wanted(expect)}");
                    Put(t.Text);
                    var (after, afterAt, between) = Ahead(at);
                    var close = t.Text == "{" ? "}" : "]";
                    if (after?.Kind == Kind.Close && after.Text == close && !(keepComments && between))
                    {
                        sb.Append(close);   // empty: {} or []
                        at = afterAt;
                        last = after;
                        AfterValue();
                        continue;
                    }
                    stack.Push(t.Text[0]);
                    expect = t.Text == "{" ? Expect.KeyOrClose : Expect.ValueOrClose;
                    breakNext = true;
                    break;
                case Kind.Close:
                    if (stack.Count == 0 || stack.Peek() != (t.Text == "}" ? '{' : '['))
                        throw Wrong(t, stack.Count == 0 ? $"'{t.Text}' without an opening one" : $"'{t.Text}' closes a '{stack.Peek()}'");
                    if (expect is not (Expect.KeyOrClose or Expect.ValueOrClose or Expect.CommaOrClose)) throw Wrong(t, $"Expected {Wanted(expect)}");
                    stack.Pop();
                    breakNext = true;
                    afterColon = false;
                    Put(t.Text);
                    AfterValue();
                    break;
                case Kind.Comma:
                    if (expect != Expect.CommaOrClose) throw Wrong(t, $"Expected {Wanted(expect)}");
                    sb.Append(',');
                    breakNext = true;
                    expect = stack.Peek() == '{' ? Expect.KeyOrClose : Expect.ValueOrClose;
                    break;
                case Kind.Colon:
                    if (expect != Expect.Colon) throw Wrong(t, $"Expected {Wanted(expect)}");
                    sb.Append(':');
                    afterColon = true;
                    expect = Expect.Value;
                    break;
                case Kind.String:
                    if (expect == Expect.KeyOrClose) { Put(t.Text); expect = Expect.Colon; break; }
                    if (expect is not (Expect.Value or Expect.ValueOrClose)) throw Wrong(t, $"Expected {Wanted(expect)}");
                    Put(t.Text);
                    AfterValue();
                    break;
                case Kind.Literal:
                    if (expect is not (Expect.Value or Expect.ValueOrClose)) throw Wrong(t, expect == Expect.KeyOrClose ? "Expected a key (a string)" : $"Expected {Wanted(expect)}");
                    Put(t.Text);
                    AfterValue();
                    break;
            }
            last = t;
        }
        if (expect != Expect.End)
        {
            var end = tokens.Count > 0 ? tokens[^1] : null;
            throw new JsonError(tokens.Any(t => t.Kind is not (Kind.LineComment or Kind.BlockComment)) ? "The text ends before the JSON value does" : "No JSON value",
                end?.EndLine ?? 1, end is null ? 1 : end.Column + end.Text.Length);
        }
        return sb.ToString();
    }

    static string Wanted(Expect e) => e switch
    {
        Expect.Value => "a value",
        Expect.ValueOrClose => "a value or the end of the list",
        Expect.KeyOrClose => "a key (a string)",
        Expect.Colon => "':' after the key",
        Expect.CommaOrClose => "',' or the end of the object or list",
        _ => "the end",
    };

    // ---------- XML ----------

    /// <summary>A whole document, or (when it is not one) whole elements on their own: a selection. Comments, processing
    /// instructions, CDATA and the declaration are kept; an element with text and elements mixed keeps its own spacing.</summary>
    public static Result Xml(string text, string indent)
    {
        XmlException? first = null;
        foreach (var fragment in new[] { false, true })
            try
            {
                var settings = new XmlReaderSettings
                {
                    DtdProcessing = DtdProcessing.Parse, XmlResolver = null,
                    ConformanceLevel = fragment ? ConformanceLevel.Fragment : ConformanceLevel.Document,
                };
                using var reader = XmlReader.Create(new StringReader(text), settings);
                XContainer root;
                string declaration = "";
                if (fragment)
                {
                    var holder = new XElement("fragment");
                    reader.Read();
                    while (reader.ReadState == ReadState.Interactive) holder.Add(XNode.ReadFrom(reader));
                    root = holder;
                }
                else
                {
                    var doc = XDocument.Load(reader, LoadOptions.PreserveWhitespace);
                    if (doc.Declaration is not null) declaration = doc.Declaration + "\n";
                    root = doc;
                }
                DropLayout(root);
                var sb = new StringBuilder();
                var write = new XmlWriterSettings
                {
                    Indent = true, IndentChars = indent, NewLineChars = "\n", NewLineHandling = NewLineHandling.None,
                    OmitXmlDeclaration = true, ConformanceLevel = ConformanceLevel.Fragment,
                };
                using (var w = XmlWriter.Create(sb, write))
                    foreach (var node in root.Nodes()) node.WriteTo(w);
                return new Result(declaration + sb.ToString().TrimStart('\n'));
            }
            catch (XmlException e) { first ??= e; }
        return new Result(null, first!.Message, first.LineNumber, first.LinePosition);
    }

    // The whitespace between nodes, where it is only layout: in an element without text of its own (and at the top).
    static void DropLayout(XContainer container, bool top = true)
    {
        static bool Layout(XText t) => t is not XCData && string.IsNullOrWhiteSpace(t.Value);
        var texts = container.Nodes().OfType<XText>().ToList();
        if (top || texts.All(Layout))
            foreach (var t in texts.Where(Layout)) t.Remove();
        foreach (var child in container.Elements()) DropLayout(child, false);
    }
}
