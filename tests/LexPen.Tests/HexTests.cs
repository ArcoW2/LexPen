using System.Text.Json;

namespace LexPen.Tests;

// The Hex view (docs/plans/executed/PLAN-hex-view.md): a file's bytes read (HexFile), a text tab's bytes as a save writes them
// and read back (TextFile), and the page's rules for a line and a byte's digits (web/hexmodel.js under Jint).
public class HexTests : IDisposable
{
    static readonly string Model = File.ReadAllText(Path.Combine(AppHost.FindProjectFolder(AppContext.BaseDirectory, "web")!, "hexmodel.js"));
    readonly string dir = Path.Combine(Path.GetTempPath(), "lexpen-hex-" + Guid.NewGuid().ToString("N"));

    public HexTests() => Directory.CreateDirectory(dir);

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, true);
    }

    string FileOf(string name, byte[] bytes)
    {
        var path = Path.Combine(dir, name);
        File.WriteAllBytes(path, bytes);
        return path;
    }

    static JsonElement Js(string expr)
    {
        var engine = new Jint.Engine();
        engine.Execute(Model);
        return JsonDocument.Parse(engine.Evaluate($"JSON.stringify({expr})").ToString()).RootElement;
    }

    // ---------- HexFile ----------

    [Fact]
    public void AZeroByteMakesAFileBinaryUnlessItIsUtf16()
    {
        Assert.True(HexFile.IsBinary(FileOf("a.bin", [0x50, 0x44, 0x00, 0x46])));
        Assert.False(HexFile.IsBinary(FileOf("a.txt", "Hello\r\n"u8.ToArray())));
        Assert.False(HexFile.IsBinary(FileOf("u.txt", [0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00])));   // UTF-16: zeros, but text
        Assert.False(HexFile.IsBinary(FileOf("empty", [])));
    }

    [Fact]
    public void TheBytesReadWholeAndAFileOverTheLimitRefused()
    {
        byte[] bytes = [.. Enumerable.Range(0, 256).Select(i => (byte)i)];
        Assert.Equal(bytes, HexFile.Read(FileOf("all.bin", bytes)));
        var big = Path.Combine(dir, "big.bin");
        using (var f = File.Create(big)) f.SetLength(HexFile.MaxSize + 1);
        Assert.Contains("too large for Hex", Assert.Throws<IOException>(() => HexFile.Read(big)).Message);
    }

    // ---------- A text tab's bytes ----------

    [Theory]
    [InlineData(TextFile.Utf8)]
    [InlineData(TextFile.Utf8Bom)]
    [InlineData(TextFile.Utf16Le)]
    [InlineData(TextFile.Utf16Be)]
    [InlineData(TextFile.Ansi)]
    public void ATextEncodedAsASaveWritesItAndReadBackTheSame(string encoding)
    {
        foreach (var text in new[] { "Hello\r\nWorld\r\n", "one\ntwo\n", "caf\u00E9" })
        {
            var bytes = TextFile.Encode(text, encoding, "x.txt");
            var path = Path.Combine(dir, "saved.txt");
            TextFile.Write(path, text, encoding, false);
            Assert.Equal(File.ReadAllBytes(path), bytes);   // what Hex shows is what a save writes
            Assert.Equal(text, TextFile.DecodeAs(bytes, encoding));
        }
    }

    [Fact]
    public void ABytesItsEncodingCannotReadBecomesTheStandInAndIsWrittenBack()
    {
        byte[] bytes = [0x48, 0xE9, 0x6C];   // E9 alone is no UTF-8
        var text = TextFile.DecodeAs(bytes, TextFile.Utf8);
        Assert.Equal((char)(TextFile.StandIn + 0xE9), text[1]);
        Assert.Equal(bytes, TextFile.Encode(text, TextFile.Utf8, "x.txt"));
        Assert.Equal("Hi", TextFile.DecodeAs([0xEF, 0xBB, 0xBF, 0x48, 0x69], TextFile.Utf8Bom));   // its BOM left out
    }

    // ---------- The page's rules (hexmodel.js) ----------

    static string Line(string bytes, int from, int per, int group, int size) =>
        Js($"hexLineText({bytes}, {from}, {per}, {group}, {size})").GetString()!;

    [Fact]
    public void ALineForSeveralWidthsAndGroups()
    {
        const string hello = "[0x48,0x65,0x6C,0x6C,0x6F,0x20,0x57,0x6F,0x72,0x6C,0x64,0x0A]";
        // The hex part as wide as a full line (16 / 8: 16 x 2 digits + 15 spaces + 1 extra = 48), then two spaces.
        static string Pad(string hex, int width) => hex + new string(' ', width - hex.Length + 2);
        Assert.Equal("00000000  " + Pad("48 65 6C 6C 6F 20 57 6F  72 6C 64 0A", 48) + "Hello Wo rld\u00B7", Line(hello, 0, 16, 8, 12));
        Assert.Equal("00000000  " + Pad("48 65 6C 6C 6F 20 57 6F", 23) + "Hello Wo", Line(hello, 0, 8, 0, 12));
        Assert.Equal("00000008  " + Pad("72 6C 64 0A", 23) + "rld\u00B7", Line(hello, 8, 8, 0, 12));
        Assert.Equal("00000000  " + Pad("48 65 6C 6C  6F 20 57 6F  72 6C 64 0A", 32 * 2 + 31 + 7) + "Hell o Wo rld\u00B7", Line(hello, 0, 32, 4, 12));
    }

    [Fact]
    public void OneByteOneCharacterAsWindows1252AndADotWhereThereIsNone()
    {
        string Ch(int b) => Js($"hexChar({b})").ValueKind == JsonValueKind.Null ? "dot" : Js($"hexChar({b})").GetString()!;
        Assert.Equal("A", Ch(0x41));
        Assert.Equal("\u00E9", Ch(0xE9));
        Assert.Equal("\u20AC", Ch(0x80));   // 1252's euro sign
        Assert.Equal("\u2019", Ch(0x92));
        foreach (var b in new[] { 0x00, 0x0A, 0x1F, 0x7F, 0x81, 0x8D, 0x8F, 0x90, 0x9D }) Assert.Equal("dot", Ch(b));
        Assert.Equal(0xE9, Js("hexByteOf('\u00E9')").GetInt32());
        Assert.Equal(0x80, Js("hexByteOf('\u20AC')").GetInt32());
        Assert.Equal(JsonValueKind.Null, Js("hexByteOf('\u0101')").ValueKind);   // a-macron: no byte of its own
    }

    [Fact]
    public void TheOffsetAsWideAsTheFileNeedsAtLeastEight()
    {
        Assert.Equal(8, Js("hexOffsetDigits(1)").GetInt32());
        Assert.Equal(8, Js("hexOffsetDigits(0x100000000)").GetInt32());
        Assert.Equal(9, Js("hexOffsetDigits(0x100000001)").GetInt32());
    }

    [Fact]
    public void ADigitGoneCountsAs0()
    {
        Assert.Equal(0x0F, Js("hexValue([null, 'F'])").GetInt32());   // Delete on the high digit of 3F
        Assert.Equal(0x30, Js("hexValue(['3', null])").GetInt32());   // Backspace after its low digit
        Assert.Equal(0x00, Js("hexValue([null, null])").GetInt32());
        Assert.Equal(0xAB, Js("hexValue(['a', 'B'])").GetInt32());   // either case
        Assert.True(Js("isHexDigit('f') && isHexDigit('F') && !isHexDigit('g')").GetBoolean());
    }

    // ---------- Hex pasted in the hex part ----------

    [Theory]
    [InlineData("3F 00 A1")]
    [InlineData("3f00a1")]
    [InlineData("3F\r\n00\tA1\r\n")]
    [InlineData("0x3F, 0x00, 0xA1")]
    [InlineData("{ 0x3F, 0x0, 0xa1 }")]
    [InlineData("$3F $00 $A1")]
    [InlineData(@"\x3F\x00\xA1")]
    [InlineData("#3F00A1")]
    [InlineData("&H3F &H0 &HA1")]
    [InlineData("%3F%00%A1")]
    [InlineData("3Fh 00h A1h")]
    [InlineData("3F:00:A1")]
    [InlineData("3F-00-A1")]
    [InlineData("[3F; 00; A1]")]
    public void HexIsReadInTheUsualWays(string text)
    {
        Assert.Equal("[63,0,161]", Js($"hexParseBytes({JsonSerializer.Serialize(text)})").GetRawText());
    }

    [Theory]
    [InlineData("Hello")]
    [InlineData("3F0")]
    [InlineData("3F 0G")]
    [InlineData("")]
    [InlineData("  ,  ")]
    public void AnythingElseIsNoHex(string text)
    {
        Assert.Equal(JsonValueKind.Null, Js($"hexParseBytes({JsonSerializer.Serialize(text)})").ValueKind);
    }
}
