using System.Text.Json;

namespace LexPen.Tests;

// web/csv.js run under Jint: the page's CSV reader, detection, value formats and CSVW (docs/plans/29-PLAN-csv-columns.md).
public class CsvTests
{
    static readonly string Source = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "csv.js"));

    // An expression's value as JSON.
    static JsonElement Js(string setup, string expr)
    {
        var engine = new Jint.Engine();
        engine.Execute(Source);
        engine.Execute(setup);
        return JsonDocument.Parse(engine.Evaluate($"JSON.stringify({expr})").ToString()).RootElement;
    }

    static JsonElement Js(string expr) => Js("", expr);

    // JSON with its keys in order, to compare objects whose keys came in another order.
    static string Canonical(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Object => "{" + string.Join(",", e.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => JsonSerializer.Serialize(p.Name) + ":" + Canonical(p.Value))) + "}",
        JsonValueKind.Array => "[" + string.Join(",", e.EnumerateArray().Select(Canonical)) + "]",
        _ => e.GetRawText(),
    };

    static string[][] Rows(JsonElement read) =>
        read.GetProperty("rows").EnumerateArray().Select(r => r.GetProperty("fields").EnumerateArray().Select(f => f.GetProperty("text").GetString()!).ToArray()).ToArray();

    [Fact]
    public void AHeaderAndRowsWithQuotesDelimitersAndLineBreaksInside()
    {
        var read = Js("var t = 'a,b,c\\r\\n1,\"x, y\",\"say \"\"hi\"\"\"\\r\\n2,\"two\\nlines\",z\\r\\n';", "csvRead(t, csvDefinition())");
        Assert.Equal(["a", "b", "c"], read.GetProperty("names").EnumerateArray().Select(n => n.GetString()));
        var rows = Rows(read);
        Assert.Equal(["1", "x, y", "say \"hi\""], rows[0]);
        Assert.Equal(["2", "two\nlines", "z"], rows[1]);
        Assert.Equal(2, rows.Length);
    }

    [Fact]
    public void AFieldKnowsWhereItIsInTheText()
    {
        var read = Js("var t = 'a;b\\n12;\"cd\"\\n';", "csvRead(t, csvDefinition({ delimiter: ';' }))");
        var f = read.GetProperty("rows")[0].GetProperty("fields")[1];
        Assert.Equal(7, f.GetProperty("start").GetInt32());
        Assert.Equal(11, f.GetProperty("end").GetInt32());
        Assert.True(f.GetProperty("quoted").GetBoolean());
    }

    [Fact]
    public void AnEscapeCharacterInsteadOfADoubledQuote()
    {
        var read = Js("var t = '1,\"a\\\\\"b\"\\n';", "csvRead(t, csvDefinition({ skip: 0, header: 0, escape: 'char' }))");
        Assert.Equal(["1", "a\"b"], Rows(read)[0]);
    }

    [Fact]
    public void QuotesOfTwoSignsAndPerColumn()
    {
        var read = Js("var t = '[a],<b>\\n';",
            "csvRead(t, csvDefinition({ skip: 0, header: 0, quote: '[', quoteEnd: ']', columns: [{}, { quote: '<', quoteEnd: '>' }] }))");
        Assert.Equal(["a", "b"], Rows(read)[0]);
    }

    [Fact]
    public void AQuoteThatNeverEndsStopsAtItsLine()
    {
        var read = Js("var t = '1,\"open\\n2,b\\n';", "csvRead(t, csvDefinition({ skip: 0, header: 0 }))");
        var rows = read.GetProperty("rows");
        Assert.True(rows[0].GetProperty("problem").GetBoolean());
        Assert.Equal(["2", "b"], Rows(read)[1]);
    }

    [Fact]
    public void LinesBeforeTheData()
    {
        var read = Js("var t = 'Export of 2026\\nname,age\\nAnn,30\\n';", "csvRead(t, csvDefinition({ skip: 2, header: 2 }))");
        Assert.Equal("Export of 2026", read.GetProperty("pre")[0].GetProperty("text").GetString());
        Assert.Equal(["name", "age"], read.GetProperty("names").EnumerateArray().Select(n => n.GetString()));
        Assert.Equal(["Ann", "30"], Rows(read)[0]);
    }

    [Fact]
    public void DetectsTheDelimiterHeaderAndTypes()
    {
        var def = Js("var t = 'id;amount;when;ok;name\\n1;1.234,50;31-12-2025;yes;Ann\\n2;7,25;01-01-2026;no;Bob\\n';", "csvDetect(t)");
        Assert.Equal(";", def.GetProperty("delimiter").GetString());
        Assert.Equal(1, def.GetProperty("header").GetInt32());
        var cols = def.GetProperty("columns");
        Assert.Equal("integer", cols[0].GetProperty("type").GetString());
        Assert.Equal("decimal", cols[1].GetProperty("type").GetString());
        Assert.Equal(",", cols[1].GetProperty("decimal").GetString());
        Assert.Equal(".", cols[1].GetProperty("group").GetString());
        Assert.Equal("date", cols[2].GetProperty("type").GetString());
        Assert.Equal("dd-MM-yyyy", cols[2].GetProperty("pattern").GetString());
        Assert.Equal("boolean", cols[3].GetProperty("type").GetString());
        Assert.Equal("text", cols[4].GetProperty("type").GetString());
        Assert.Equal("name", cols[4].GetProperty("name").GetString());
    }

    [Fact]
    public void DetectsLinesBeforeTheHeader()
    {
        var def = Js("var t = 'Export of 2026-11-05\\r\\n\\r\\nid;name\\r\\n1;Ann\\r\\n2;Bob\\r\\n';", "csvDetect(t)");
        Assert.Equal(3, def.GetProperty("skip").GetInt32());
        Assert.Equal(3, def.GetProperty("header").GetInt32());
        Assert.Equal(2, def.GetProperty("columns").GetArrayLength());
        Assert.Equal("id", def.GetProperty("columns")[0].GetProperty("name").GetString());
    }

    [Fact]
    public void AKeptDefinitionFollowsColumnsByNameAndDetectsNewOnes()
    {
        var setup = """
            var kept = csvDefinition({ columns: [{ name: 'id', type: 'integer', align: 'right' }, { name: 'amount', type: 'decimal', decimal: ',', format: '0.00' }] });
            var t = 'amount,id,note\n1,5,x\n2,6,y\n';
            """;
        var cols = Js(setup, "csvFit(kept, t).columns");
        Assert.Equal("amount", cols[0].GetProperty("name").GetString());
        Assert.Equal("0.00", cols[0].GetProperty("format").GetString());
        Assert.Equal("integer", cols[1].GetProperty("type").GetString());
        Assert.Equal("note", cols[2].GetProperty("name").GetString());
        Assert.Equal("text", cols[2].GetProperty("type").GetString());
    }

    [Fact]
    public void NoHeaderWhenTheFirstRowHasNumbers()
    {
        var def = Js("var t = '1,2\\n3,4\\n';", "csvDetect(t)");
        Assert.Equal(0, def.GetProperty("header").GetInt32());
        Assert.Equal("Column 1", def.GetProperty("columns")[0].GetProperty("name").GetString());
    }

    [Theory]
    [InlineData("1.234,5", "{ type: 'decimal', decimal: ',', group: '.', format: '#,##0.00' }", "1.234,50", true)]
    [InlineData("1234.5", "{ type: 'decimal', decimal: '.', format: '0.0' }", "1234.5", true)]
    [InlineData("-1234", "{ type: 'integer', format: '#,##0' }", "-1,234", true)]
    [InlineData("12a", "{ type: 'integer' }", "12a", false)]
    [InlineData("31-12-2025", "{ type: 'date', pattern: 'dd-MM-yyyy' }", "2025-12-31", true)]
    [InlineData("2025-12-31T08:05", "{ type: 'date', pattern: \"yyyy-MM-dd'T'HH:mm\", format: 'dd/MM/yyyy HH:mm' }", "31/12/2025 08:05", true)]
    [InlineData("32-12-2025", "{ type: 'date', pattern: 'dd-MM-yyyy' }", "32-12-2025", false)]
    [InlineData("anything", "{ type: 'text' }", "anything", true)]
    public void AValueInItsColumnsFormat(string raw, string col, string shown, bool ok)
    {
        var r = Js($"csvShow({JsonSerializer.Serialize(raw)}, {col})");
        Assert.Equal(shown, r.GetProperty("text").GetString());
        Assert.Equal(ok, r.GetProperty("ok").GetBoolean());
    }

    [Fact]
    public void ADefinitionRoundTripsThroughCsvw()
    {
        var setup = """
            var def = csvDefinition({ delimiter: ';', quote: '[', quoteEnd: ']', skip: 3, header: 2, trim: true, columns: [
              { name: 'Id', type: 'integer', decimal: '.', group: '', align: 'right' },
              { name: 'Amount', type: 'decimal', decimal: ',', group: '.', format: '#,##0.00', align: 'right', width: 12 },
              { name: 'When', type: 'date', pattern: 'dd-MM-yyyy', align: 'right', hidden: true },
              { name: 'Note', type: 'auto', align: 'left', order: 0, quote: '<', quoteEnd: '>' } ] });
            var json = csvwWrite(def, 'data.csv');
            """;
        var back = Js(setup, "csvwRead(json)");
        var orig = Js(setup, "def");
        Assert.Equal(Canonical(orig), Canonical(back));
        var meta = Js(setup, "JSON.parse(json)");
        Assert.Equal("http://www.w3.org/ns/csvw", meta.GetProperty("@context").GetString());
        Assert.Equal(1, meta.GetProperty("dialect").GetProperty("skipRows").GetInt32());
        Assert.Equal("decimal", meta.GetProperty("tableSchema").GetProperty("columns")[1].GetProperty("datatype").GetProperty("base").GetString());
    }

    [Fact]
    public void ReadsAnotherToolsCsvw()
    {
        var json = """
            { "@context": "http://www.w3.org/ns/csvw", "url": "x.csv",
              "dialect": { "delimiter": "\t", "header": true },
              "tableSchema": { "columns": [
                { "name": "price", "titles": ["Price"], "datatype": { "base": "number", "format": { "decimalChar": "," } } },
                { "name": "day", "datatype": { "base": "date", "format": "d.M.yyyy" } },
                { "name": "x", "virtual": true } ] } }
            """;
        var def = Js($"csvwRead({JsonSerializer.Serialize(json)})");
        Assert.Equal("\t", def.GetProperty("delimiter").GetString());
        Assert.Equal(1, def.GetProperty("header").GetInt32());
        var cols = def.GetProperty("columns");
        Assert.Equal(2, cols.GetArrayLength());
        Assert.Equal("Price", cols[0].GetProperty("name").GetString());
        Assert.Equal("decimal", cols[0].GetProperty("type").GetString());
        Assert.Equal(",", cols[0].GetProperty("decimal").GetString());
        Assert.Equal("d.M.yyyy", cols[1].GetProperty("pattern").GetString());
    }
}
