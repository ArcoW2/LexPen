using System.Text.Json.Nodes;

namespace LexPen.Tests;

public class ColumnStoreTests : IDisposable
{
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-columns-" + Guid.NewGuid().ToString("N"));
    string StorePath => Path.Combine(dir, "file-columns.json");
    string Csv => Path.Combine(dir, "data.csv");

    public ColumnStoreTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    static JsonObject Table(string url, string delimiter = ";") => new()
    {
        ["@context"] = "http://www.w3.org/ns/csvw", ["url"] = url, ["dialect"] = new JsonObject { ["delimiter"] = delimiter },
    };

    [Fact]
    public void ADefinitionComesBackAfterARestart()
    {
        new ColumnStore(StorePath).Set(BookmarkStore.Key(@"C:\A\Data.csv", null), Table("Data.csv"));
        var again = new ColumnStore(StorePath).Open(@"c:\a\data.csv");
        Assert.Equal(";", (string?)again?["dialect"]?["delimiter"]);
    }

    [Fact]
    public void NullRemovesTheFile()
    {
        var store = new ColumnStore(StorePath);
        store.Set("c:\\a.csv", Table("a.csv"));
        store.Set("c:\\a.csv", null);
        Assert.Null(new ColumnStore(StorePath).Open("c:\\a.csv"));
    }

    [Fact]
    public void PastTheMaximumTheOldestGoes()
    {
        var store = new ColumnStore(StorePath);
        for (var i = 0; i <= ColumnStore.Max; i++) store.Set($"c:\\{i}.csv", Table($"{i}.csv"));
        Assert.Equal(ColumnStore.Max, store.Keys.Count());
        Assert.DoesNotContain("c:\\0.csv", store.Keys);
    }

    [Fact]
    public void ARenameTakesTheDefinitionAlong()
    {
        var store = new ColumnStore(StorePath);
        store.Set(BookmarkStore.Key(@"C:\A\x.csv", null), Table("x.csv"));
        store.Rename(@"C:\A", @"C:\B");
        Assert.NotNull(store.Open(BookmarkStore.Key(@"C:\B\x.csv", null)));
    }

    [Fact]
    public void NothingBesideAFileWithoutMetadata() => Assert.Null(ColumnStore.Beside(Csv));

    [Fact]
    public void TheFilesOwnMetadataFirst()
    {
        File.WriteAllText(Path.Combine(dir, "csv-metadata.json"), Table("data.csv", ",").ToJsonString());
        File.WriteAllText(ColumnStore.OwnName(Csv), Table("data.csv", "|").ToJsonString());
        var found = ColumnStore.Beside(Csv);
        Assert.Equal(ColumnStore.OwnName(Csv), found?.Path);
        Assert.Equal("|", (string?)found?.Table["dialect"]?["delimiter"]);
    }

    [Fact]
    public void TheFoldersMetadataWhenItDescribesTheFile()
    {
        var all = new JsonObject
        {
            ["@context"] = "http://www.w3.org/ns/csvw", ["dialect"] = new JsonObject { ["delimiter"] = "\t" },
            ["tables"] = new JsonArray(new JsonObject { ["url"] = "other.csv" }, new JsonObject { ["url"] = "./DATA.csv" }),
        };
        File.WriteAllText(ColumnStore.FolderName(Csv), all.ToJsonString());
        var found = ColumnStore.Beside(Csv);
        Assert.Equal(ColumnStore.FolderName(Csv), found?.Path);
        Assert.Equal("\t", (string?)found?.Table["dialect"]?["delimiter"]);   // the dialect of the whole
        Assert.Null(ColumnStore.Beside(Path.Combine(dir, "third.csv")));
    }

    [Fact]
    public void SavingWritesTheFilesOwnByDefault()
    {
        Assert.Equal(ColumnStore.OwnName(Csv), ColumnStore.SaveBeside(Csv, Table("data.csv")));
        Assert.Equal(";", (string?)ColumnStore.Beside(Csv)?.Table["dialect"]?["delimiter"]);
    }

    [Fact]
    public void ASavedFileIsReadableJson()
    {
        var table = Table("data.csv");
        table["dialect"]!["quoteChar"] = "\"";
        ColumnStore.SaveBeside(Csv, table);
        Assert.Contains("\"quoteChar\": \"\\\"\"", File.ReadAllText(ColumnStore.OwnName(Csv)));
    }

    [Fact]
    public void SavingIntoTheFoldersMetadataKeepsTheOtherTables()
    {
        var all = new JsonObject { ["tables"] = new JsonArray(new JsonObject { ["url"] = "other.csv" }, new JsonObject { ["url"] = "data.csv" }) };
        File.WriteAllText(ColumnStore.FolderName(Csv), all.ToJsonString());
        Assert.Equal(ColumnStore.FolderName(Csv), ColumnStore.SaveBeside(Csv, Table("data.csv", "|")));
        var back = JsonNode.Parse(File.ReadAllText(ColumnStore.FolderName(Csv)))!;
        Assert.Equal("other.csv", (string?)back["tables"]![0]!["url"]);
        Assert.Equal("|", (string?)back["tables"]![1]!["dialect"]!["delimiter"]);
        Assert.False(File.Exists(ColumnStore.OwnName(Csv)));
    }
}
