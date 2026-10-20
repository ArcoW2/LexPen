namespace LexPen.Tests;

public class FormattersTests
{
    static string Json(string text, bool keep = true) => Formatters.Json(text, "  ", keep).Text!;

    [Fact]
    public void JsonIsIndentedWithEveryTokenAsWritten()
    {
        Assert.Equal("{\n  \"b\": 1.0,\n  \"a\": [\n    12345678901234567890123,\n    \"\\u00e9\\\"x\",\n    true,\n    null\n  ]\n}",
            Json("{\"b\":1.0,\"a\":[12345678901234567890123,\"\\u00e9\\\"x\",true,null]}"));
    }

    [Fact]
    public void EmptyObjectsAndListsStayOnOneLine()
    {
        Assert.Equal("{\n  \"a\": {},\n  \"b\": [],\n  \"c\": [\n    []\n  ]\n}", Json("{ \"a\": { }, \"b\": [\n], \"c\": [[]] }"));
    }

    [Fact]
    public void UnicodeAndTheIndentGiven()
    {
        Assert.Equal("[\n\t\"\u00e9\u4e2d\"\n]", Formatters.Json("[\"\u00e9\u4e2d\"]", "\t", true).Text);
    }

    [Fact]
    public void CommentsAreKeptOnTheirOwnLineOrAfterTheValue()
    {
        var text = "// head\n{\"a\": 1, // after a\n/* before b */ \"b\": 2 /* after b */}";
        Assert.True(Formatters.JsonHasComments(text));
        Assert.Equal("// head\n{\n  \"a\": 1, // after a\n  /* before b */ \"b\": 2 /* after b */\n}", Json(text));
    }

    [Fact]
    public void ACommentBeforeTheCloseGetsTheCloseIndentation()
    {
        Assert.Equal("{\n  \"a\": 1\n  // last\n}", Json("{\"a\": 1\n// last\n}"));
        Assert.Equal("[\n  // nothing yet\n]", Json("[\n// nothing yet\n]"));
    }

    [Fact]
    public void CommentsCanBeRemoved()
    {
        Assert.Equal("{\n  \"a\": 1,\n  \"b\": []\n}", Json("// head\n{\"a\": 1, // x\n\"b\": [ /* none */ ] }", keep: false));
        Assert.False(Formatters.JsonHasComments("{\"url\": \"http://x\"}"));
    }

    [Fact]
    public void ATrailingCommaIsKept()
    {
        Assert.Equal("[\n  1,\n]", Json("[1,]"));
    }

    [Theory]
    [InlineData("{\"a\" 1}", 1, 6)]
    [InlineData("{\n  \"a\": 1,\n  \"b\": }", 3, 8)]
    [InlineData("[1, 2", 1, 6)]
    [InlineData("{\"a\": 1]", 1, 8)]
    [InlineData("{\"a\": tru}", 1, 7)]
    [InlineData("{\"a\": \"open}", 1, 7)]
    [InlineData("[1] [2]", 1, 5)]
    [InlineData("{1: 2}", 1, 2)]
    public void InvalidJsonSaysWhere(string text, int line, int column)
    {
        var result = Formatters.Json(text, "  ", true);
        Assert.Null(result.Text);
        Assert.NotNull(result.Error);
        Assert.Equal((line, column), (result.Line, result.Column));
    }

    [Fact]
    public void XmlIsIndentedKeepingCommentsCdataAndTheDeclaration()
    {
        var text = "<?xml version=\"1.0\" encoding=\"utf-8\"?><root><!-- note --><a x=\"1\"><b/></a><c><![CDATA[ <raw> ]]></c><?pi data?></root>";
        Assert.Equal("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<root>\n  <!-- note -->\n  <a x=\"1\">\n    <b />\n  </a>\n  <c><![CDATA[ <raw> ]]></c>\n  <?pi data?>\n</root>",
            Formatters.Xml(text, "  ").Text);
    }

    [Fact]
    public void XmlMixedContentKeepsItsText()
    {
        Assert.Equal("<doc>\n  <p>Some <b>bold</b> and <i>italic</i> text.</p>\n</doc>",
            Formatters.Xml("<doc>   <p>Some <b>bold</b> and <i>italic</i> text.</p></doc>", "  ").Text);
    }

    [Fact]
    public void AnXmlFragmentOfSeveralElements()
    {
        Assert.Equal("<a>\n  <b />\n</a>\n<c />", Formatters.Xml("<a><b/></a>  <c/>", "  ").Text);
    }

    [Fact]
    public void InvalidXmlSaysWhere()
    {
        var result = Formatters.Xml("<a>\n  <b></a>", "  ");
        Assert.Null(result.Text);
        Assert.Equal(2, result.Line);
        Assert.True(result.Column > 0);
    }
}
