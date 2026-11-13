namespace Warehouse.Picking;

/// <summary>A storage place: aisle, bay and level.</summary>
public sealed class Bin
{
    public string Aisle { get; init; } = "";
    public int Bay { get; init; }
    public int Level { get; init; }

    public override string ToString() => $"{Aisle}-{Bay:00}-{Level}";
}
