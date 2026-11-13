namespace Warehouse.Picking;

public sealed class RouteBuilder
{
    public IReadOnlyList<Bin> Build(Wave wave) =>
        wave.Lines
            .Where(l => l.Qty > 0)
            .Select(l => l.Bin)
            .OrderBy(b => b.Aisle).ThenBy(b => b.Bay)
            .ToList();
}
