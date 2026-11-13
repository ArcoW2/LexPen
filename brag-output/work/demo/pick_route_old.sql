-- Pick route for one wave, in aisle order
select l.aisle, l.bay, l.bin, o.item, o.qty
from   wave_order o
join   location   l on l.bin = o.bin
where  o.wave = :wave
  and  o.qty  >= 0
order  by l.bin;
