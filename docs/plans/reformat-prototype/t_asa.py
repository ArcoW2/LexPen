import sys
sys.path.insert(0, __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0])
from engine import format_text
from langs import ASA

cases = {}
cases['if 1'] = """select (if a = b then
          'equal'
        else
          'not equal'
        endif
       )"""
cases['if 2'] = """select (
  if a = b then
     'equal'
   else
     'not equal'
   endif)"""
cases['if 3'] = """select (
  if a = b then 'equal' else
     'not equal'
  endif
)"""
cases['params'] = """create or replace procedure "KingSystem".api_suppliers_HELPER_ACTION
(
  // Operators
  in pAction smallint, //0 = POST (add), 1 = PATCH (change)
  in pParentEntity_Name nchar(80) default null, // Only valid for sub-entities
  in pParentEntity_Id integer default null,
  // Settings
  in pUseDefaults smallint default null
)"""
cases['condition'] = """if (@current.mailing_address_type is not distinct from @original.mailing_address_type)
and (@current.mailing_address_type = 1 /*specific*/)
and (@current.mailing_address_id is not null)
then
if @original.mailing_country_id is distinct from @current.mailing_country_id or
@original.NawGid is distinct from @current.NawGid or
@original.mailing_ean_code is distinct from @current.mailing_ean_code
then
update tabAdres
set
AdrLndGid = @current.mailing_country_id,
AdrNawGid = @current.NawGid,
AdrCode = null,
AdrLastModified = @current.last_modified
where AdrGid = @current.mailing_address_id;
end if;
end if;"""
cases['joins'] = """select *
    from
      tabNaw naw
      left outer join tabAdres address_primary on ( address_primary.AdrGid = naw.NawGidVestiging and address_primary.AdrCode is null )
      left outer join tabAdres address_mailing on ( address_mailing.AdrGid = naw.NawGidCorrespondentie )
      left outer join tabNawRekening bank_account_default on ( bank_account_default.NawrekNawGid = naw.nawGid and bank_account_default.nawRekSoort like '%D%' )
      left outer join tabNawRekening bank_account_payment_init on ( bank_account_payment_init.NawrekNawGid = naw.nawGid and bank_account_payment_init.nawRekSoort like '%B%' )
      inner join (
        tabNawFile nawfile
        inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
      ) on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
      left outer join tabNawOpmerkingen comments on (comments.NawOpmNawGid = naw.NawGid)
    where
      NawSoort = 1
      and nawfile.NawFilGid = pId;"""
cases['long on'] = """select *
from
  tabNaw naw
  left outer join tabAdres address_mailing on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabAdres address_primary on (address_primary.AdrGid = naw.NawGidVestiging and address_primary.AdrCode is null and bank_account_default.NawrekNawGid = naw.nawGid and bank_account_default.nawRekSoort like '%D%')
where x = 1;"""
cases['begin'] = """begin declare x integer; set x = 1; if x = 1 then message 'one'; else message 'other'; end if; end"""
import os
cases['proc'] = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'case_proc.txt')).read().rstrip()
cases['exception'] = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'case_exception.txt')).read().rstrip()
only = sys.argv[1:]
for name, text in cases.items():
    if only and name not in only: continue
    out, _ = format_text(text, ASA)
    print('== ' + name); print(out)
