# Embedded languages

A sample of code blocks in other languages inside markdown. In the editor each block is coloured as its own
language (and its bar shows the language); the preview and the Print window colour them too. The name after the
opening fence picks the language: a pack's id, name or alias (`cs`, `delphi`, `tsql`, `ps1`, ...).

## C#

```csharp
// Picks the stock for an order line from the oldest batch first.
public sealed class Picker
{
    public IEnumerable<Pick> Pick(OrderLine line, IReadOnlyList<Batch> batches)
    {
        var left = line.Quantity;
        foreach (var batch in batches.OrderBy(b => b.Received))
        {
            if (left <= 0) yield break;
            var take = Math.Min(left, batch.Available);
            left -= take;
            yield return new Pick(batch.Location, take);
        }
    }
}
```

## Delphi / Pascal

```delphi
function TInvoice.Total: Currency;
var
  Line: TInvoiceLine;
begin
  Result := 0;
  for Line in FLines do
    Result := Result + Line.Quantity * Line.Price;  { VAT is added later }
end;
```

## SQL

```tsql
-- Stock per warehouse, below its minimum
SELECT w.Code, a.Number, SUM(s.Quantity) AS OnHand, a.MinStock
FROM Stock s
JOIN Article a ON a.Id = s.ArticleId
JOIN Warehouse w ON w.Id = s.WarehouseId
GROUP BY w.Code, a.Number, a.MinStock
HAVING SUM(s.Quantity) < a.MinStock
ORDER BY w.Code, a.Number;
```

## JavaScript

```js
// The total of an order, its lines rounded per line.
const orderTotal = order => order.lines
  .map(l => Math.round(l.quantity * l.price * 100) / 100)
  .reduce((sum, x) => sum + x, 0);
console.log(`Total: ${orderTotal({ lines: [{ quantity: 3, price: 1.25 }] })}`);
```

## Python

```python
def reorder(articles, days=14):
    """Articles that run out within `days` at their current rate."""
    for a in articles:
        rate = a.sold_last_30 / 30
        if rate and a.on_hand / rate < days:
            yield a.number, round(rate * days - a.on_hand)
```

## PowerShell

```ps1
# The ten largest log files of today
Get-ChildItem -Path 'D:\Logs' -Filter *.log |
    Where-Object { $_.LastWriteTime -ge (Get-Date).Date } |
    Sort-Object Length -Descending |
    Select-Object -First 10 Name, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
```

## Shell

```bash
#!/bin/bash
# Back up the exports of today, one archive per warehouse
for wh in WH-1 WH-2 WH-3; do
  tar -czf "backup-$wh-$(date +%F).tar.gz" "exports/$wh" && echo "done: $wh"
done
```

## Batch

```bat
@echo off
rem Copy the labels to the printer share
set SOURCE=C:\Labels\Out
for %%f in ("%SOURCE%\*.zpl") do copy /b "%%f" \\printserver\zebra01 >nul
echo %DATE% %TIME% labels sent
```

## JSON

```json
{
  "order": "SO-2026-00412",
  "customer": { "id": 1031, "name": "Example BV" },
  "lines": [
    { "article": "ART-1001", "quantity": 12, "price": 4.95 },
    { "article": "ART-1007", "quantity": 1, "price": 129.00, "backorder": true }
  ]
}
```

## XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<Shipment id="SH-7781" carrier="DHL">
  <!-- one parcel per pallet -->
  <Parcel weight="12.4" unit="kg">
    <Line article="ART-1001" quantity="12"/>
  </Parcel>
</Shipment>
```

## YAML

```yaml
# Warehouse zones and their pick order
warehouse: WH-1
zones:
  - name: Fast movers
    aisles: [A, B]
    pickOrder: 1
  - name: Bulk
    aisles: [X, Y, Z]
    pickOrder: 2
```

## CSS

```css
/* A packing slip on paper */
@page { size: A5; margin: 10mm; }
.slip h1 { font: 700 14pt/1.2 "Segoe UI", sans-serif; }
.slip td.quantity { text-align: right; width: 4em; }
```

## HTML (with a script and a style inside)

```html
<!doctype html>
<html lang="en">
<head>
<style>
  .late { color: #c00; }
</style>
</head>
<body>
  <table id="orders"><tr><td>SO-2026-00412</td><td class="late">2 days late</td></tr></table>
<script>
  document.querySelectorAll('.late').forEach(td => td.title = 'Past its delivery date');
</script>
</body>
</html>
```

## Plain text

```text
No colours here: a block of plain text keeps its   spacing
and its line breaks as they are.
```
