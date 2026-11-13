-- Pick lines for one wave, with the stock on hand
   select o.wave, l.aisle, l.bay, l.bin, o.item,
 sum(o.qty) as qty, max(s.on_hand) as on_hand
      from wave_order o
 join location l on l.bin = o.bin
         left join stock s on s.bin = l.bin and s.item = o.item
   where o.wave = :wave
 and o.qty > 0
         and l.blocked = 0
group by o.wave, l.aisle, l.bay, l.bin, o.item
     having sum(o.qty) <= max(s.on_hand)
  order by l.aisle, l.bay, l.bin;
