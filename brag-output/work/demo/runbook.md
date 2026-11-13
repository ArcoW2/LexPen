# Wave 14 runbook

Check the stock before the wave starts:

```sql
select bin, item, on_hand
from   stock
where  on_hand < 5
order  by bin;
```

The route builder, as it runs tonight:

```csharp
public IReadOnlyList<Bin> Build(Wave wave) =>
    wave.Lines.Where(l => l.Qty > 0)
              .Select(l => l.Bin)
              .OrderBy(b => b.Aisle).ToList();
```

The wave as the scanner gets it:

```json
{ "wave": 14, "zone": "A", "lines": 6, "priority": true }
```

Restart the label printer service if it hangs:

```powershell
Restart-Service -Name 'LabelSpooler' -Force
Get-Service LabelSpooler | Select-Object Status
```
