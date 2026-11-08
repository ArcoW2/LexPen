begin
  call proc_name();
  call dba.proc_name();
  call "dba"."other_proc"(1);
  select * from orders;
  call missing_one();
end;
