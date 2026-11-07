namespace LexPen.Tests;

// The printers for the Print window (Printing, docs/plans/executed/PLAN-printing.md 3.3): read without failing, whatever is
// installed (a machine may have none).
public class PrintingTests
{
    [Fact]
    public void ThePrinterListIsReadWithoutFailing()
    {
        var printers = Printing.Printers();
        var list = printers["list"]!.AsArray().Select(n => (string)n!).ToList();
        Assert.All(list, n => Assert.False(string.IsNullOrEmpty(n)));
        if (printers["default"] is { } standard) Assert.Contains((string)standard!, list);
    }

    [Fact]
    public void AnUnknownPrinterHasNoInfo() => Assert.Null(Printing.Info("LexPen: no such printer " + Guid.NewGuid().ToString("N")));

    [Fact]
    public void AnInstalledPrinterHasPapersInMillimetres()
    {
        if (Printing.Printers()["default"] is not { } standard) return;   // none installed: nothing to read
        var info = Printing.Info((string)standard!);
        Assert.NotNull(info);
        foreach (var p in info!["papers"]!.AsArray())
            Assert.True((double)p!["w"]! > 0 && (double)p["w"]! <= (double)p["h"]!, (string)p["name"]!);
    }
}
