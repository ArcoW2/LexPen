unit Inv;
interface
type
  TInvoice = class
    function Total: Currency;
  end;
implementation
function TInvoice.Total: Currency;
begin
  Result := 0;
end;
end.
