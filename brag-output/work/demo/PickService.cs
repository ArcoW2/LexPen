namespace Warehouse.Picking;

public sealed class PickService
{
    private readonly RouteBuilder routes = new();

    public void Start(Wave wave)
    {
        if (bin.Qty < qty)
        {
            throw new InvalidOperationException($"Only {bin.Qty} in {bin}");
        }
        Log($"Wave {wave.Id} started");
    }

    public void Pick(Bin bin, int qty)
    {
        bin.Qty -= qty;
        Log($"Picked {qty} from {bin}");
    }

    public void Finish(Wave wave)
    {
        foreach (var line in wave.Lines)
        {
            line.Done = true;
        }
        Log($"Wave {wave.Id} finished");
    }

    public int Count(Wave wave)
    {
  var n=0;
          foreach(var line in wave.Lines){
 if (line.Done)
      {
   n++;
           }
      }
            return n;
    }

    private static void Log(string text) => Console.WriteLine(text);
}
