# Plan: reformat (indent and block layout) for code languages

Status: executed 2026-10-21 (branch `reformat`, on top of `format-convert-menu`: the Format / Convert menus and
Ctrl+Alt+C). What was decided while building: section 5. The questions of section 4 that are still open stay open;
the built formatter follows the defaults and the rules as they stand.

## 1. What this is about

Format (pretty print) works for JSON and XML only: LexPen parses the text and writes it out again. For code
languages such as C#, SQL (ASA) and Pascal there is nothing; asked for: a reformat for those as well, at least
the indenting, and the same indenting while typing.

## 2. The solution, in brief

Indentation follows the structure by column, not by a fixed step per line: inside parentheses a line lines up
just right of the `(`, and the `)` under it; inside a block (`if ... then`, `begin`, `case`) a line goes one indent
step right of where the block's word stands, and `else` / `endif` line up with that word. Every language goes through the
same formatter, JSON, XML, C# and JavaScript included; a pack only names its words, signs and attribute values
(appendix: a full set per language, each tried on a sample by a prototype). The same rules give Enter its indentation while typing; Format also normalizes the layout of blocks
that span lines (a line break after `then`, `else` and `endif` on lines of their own). On top of that, Format
aligns: lines in a row line up on the same texts (`=`, `default`, `is distinct from`, a trailing `or`), and the
items of a list over lines become columns (a parameter list: mode, name, type, default). A condition over lines
lines up its operands, and clause words (`set`, `where`) stand under their statement. These are generic
mechanisms; the pack names the texts. Comments and strings never count. It runs on the selection or the whole
file, as one undo step, with the tab and indent settings. How it lays out is set by separate style attributes
(content after a `(` or on the next line, indentation from the block word or from its line, alignment on or
off, ...), each a setting per language with the pack's default; no named sets. Built in three steps:
indentation, alignment, conditions and clauses (4.4). The same pass can check the text as well: an opener
without its closer, a closer without its opener (3.7e).

## 3. Details

### 3.1 What a full formatter would take, and why not now

| Way | What it gives | Against it |
|---|---|---|
| Indent and block layout (this plan) | Indentation by structure, blocks over lines laid out the same way | Spacing inside a line and long statements are not touched |
| A real formatter per language: Roslyn for C#, a SQL formatter | Everything, as Visual Studio does | Roslyn is a large dependency for one language (its size in the single-file exe: [not measured]); no ready formatter knows Sybase ASA's dialect; one formatter per language to keep up |

One mechanism for every language, a few lines per pack. A full formatter for one language can still come later
as its own `format:` kind, as JSON and XML are now.

### 3.2 Built-in modes

Decided: no separate path. C# and JavaScript get `format` parameters like every
other pack (appendix), and their editor mode keeps only the colouring. JSON's and XML's pretty print move onto
the same formatter too (3.7c). The earlier idea, CodeMirror's smart indent for the built-in modes, is dropped.

### 3.3 Pack rules: indentation by column

Packs with their own colouring get a key `indent`:

```yaml
indent:
  open:   [begin, case, loop, if]
  close:  [end, 'end if', endif, 'end case', 'end loop']
  middle: [else, elseif, when]
```

Parentheses always count; they need no entry.

Each opener puts an anchor on a stack, at the column where it stands in its line (not the line's indentation):

| Line starts with | Its column |
|---|---|
| (inside a `(`) | the column just right of the `(` |
| a closing `)` | the column of its `(` |
| (inside a block word) | the block word's column plus the indent size |
| a `middle` or `close` word of that block | the block word's column |

Your examples, with indent size 2. As typed, all three are fine to type:

```sql
select (if a = b then
          'equal'
        else
          'not equal'
        endif
       )

select (
  if a = b then
     'equal'
   else
     'not equal'
   endif)

select (
  if a = b then 'equal' else
     'not equal'
  endif
)
```

After Format each becomes the same (the `if` at the column right of the `(`, its contents two right of the
`if`, `else` and `endif` under the `if`, the `)` under the `(`):

```sql
select (
        if a = b then
          'equal'
        else
          'not equal'
        endif
       )
```

or, compacter (the `open` attribute, 3.7):

```sql
select (if a = b then
          'equal'
        else
          'not equal'
        endif)
```

- Words match whole words, with the pack's `caseSensitive`; the longest first, so `end if` is one close, not a
  close and an open.
- Only code counts: the colouring already knows what is a comment or a string, so `begin -- end` or `'end'` do
  not count.
- A block opened and closed on one line (`if a = b then 'x' else 'y' endif`) adds nothing (4.1).
- A `close` pops back to its own opener: `endif` closes the `if`, also when a `(` inside it was left open by a
  mistake (that `(` is dropped, so one mistake does not shift the rest of the file).
- Lines inside a block comment or a string over several lines keep their indentation.
- With `useTabs`, the leading whitespace is tabs as far as it goes (a leading tab is an indent step wide) and
  spaces for the rest of the column.

First rule sets, to be checked against real files (4.2): ASA (`begin`/`end`, `if`/`endif`/`end if`,
`case`/`end case`, `loop`/`end loop`; `else`, `elseif`, `when`), SQL (`begin`/`end`), Pascal (`begin`, `case`,
`try`, `record`, `class` ... `end`; `except`, `finally` as middle; a forward `class;` must not open), VB /
VBScript (`If ... Then`, `For`/`Next`, `Sub`/`End Sub`, ...). Python and YAML are left out: their indentation is
the structure.

### 3.4 Typing and Format

- **Enter** (your remark: the indent works for typing too): the new line gets its column from the same stack:
  after `select (if a = b then` it lands two right of the `if`, after `select (` just right of the `(`. Typing a
  `close` or `middle` word, or a `)`, at the start of a line moves that line to its column (as CodeMirror's
  electric keys). What you typed stays as you typed it otherwise; only Format normalizes.
- **Format** (`format: indent` as the pack's action, beside `json` and `xml`; the Format button and menu pick it
  up as now):
  - Layout of a block that spans lines: a line break after its opener's line end (`then`, `begin`), before and
    after a `middle` word, before its `close` word. A block that is on one line stays on one line.
  - Then every line's indentation from 3.3.
  - The `(`: kept where it is, or the content moved onto the next line (the `open` attribute, 3.7).
- The selection's lines, or the whole file. With a selection the stack is built from the lines above it, so a
  selected procedure body lands where it belongs.
- **Every language in the text**: each part is formatted by its own language's rules, the
  file's language for its lines and each embedded language for its lines: a JSON block in a .sql file by the
  JSON pretty print, a fenced block in markdown by its fence's language, lines you gave a language by that
  language, and so on inside those (a script in HTML). The marker lines stay with the outer language. An inner
  part keeps its place: its lines start at the indentation its block has in the outer text, and its own rules
  indent from there. A part without rules (plain text, a language without `indent`) keeps its lines as they
  are, shifted with its block.
- An inner part only partly in the selection: see 4.14.
- One undo step; on a read-only file it does nothing, as the other conversions.

### 3.5 Alignment (every pack with rules)

Your examples, as Format should leave them:

```sql
create or replace procedure "KingSystem".api_suppliers_HELPER_ACTION
(
  // Operators
  in  pAction                        smallint, //0 = POST (add), 1 = PATCH (change)
  in  pParentEntity_Name             nchar(80)     default null, // Only valid for sub-entities
  in  pParentEntity_Id               integer       default null,
  // Settings
  in  pUseDefaults                   smallint      default null,
...
```

```sql
if    (@current.mailing_address_type is not distinct from @original.mailing_address_type)
  and (@current.mailing_address_type = 1 /*specific*/)
  and (@current.mailing_address_id is not null)
then
  if @original.mailing_country_id          is distinct from @current.mailing_country_id          or
     @original.NawGid                      is distinct from @current.NawGid                      or
     @original.mailing_ean_code            is distinct from @current.mailing_ean_code
  then
    update tabAdres
    set
      AdrLndGid       = @current.mailing_country_id,
      AdrNawGid       = @current.NawGid,
      AdrCode         = null,
      AdrLastModified = @current.last_modified
    where AdrGid = @current.mailing_address_id;
  end if;
end if;
```

Two generic mechanisms do this; the pack only names the texts:

```yaml
align:     ['=', ':=', 'is distinct from', 'is not distinct from', default]
operators: [and, or, 'and not', 'or not', xor]   # per language: nand, ... where it has them
statements:                      # a statement's first word, and the clause words that belong to it
  select: [into, from, where, 'group by', having, 'order by', union]
  update: [set, from, where]
  insert: [values, select]
  delete: [from, where]
  set:    []                     # the assignment statement (set x = 1), not update's set
  call:   []
  return: []
```

- **A run**: lines in a row at the same depth in the same block or list. A line with only a comment does not end
  a run (`// Settings` above); a blank line, or a line at another depth, does.
- **Anchors** (`align`): in a run, the same anchor starts in the same column on every line that has it: the
  widest text before it plus one space. Left to right, anchor after anchor. Only when at least two lines of the
  run have it (a lone `where AdrGid = ...` is left as it is). The `=` of the `set` list and the
  `is distinct from` of the condition are this.
- **Operators at a line end** (`or` above) are anchors too: they line up after the widest text before them.
- **Columns of a list**: a list in parentheses with one item per line (the parameter list): the words of each
  item before its first anchor are columns (`in`, the name, the type), each as wide as its widest word in the
  whole list plus one space; a word with signs inside (`nchar(80)`, `"KingSystem".x`) is one word. Then the
  anchors (`default`). An item with fewer words ends earlier (`smallint,` without a default).
- **Comments at a line end** follow their line with one space and are not aligned (`, //0 = POST`,
  `, // Only valid`, as in your example). A comment-only line gets the run's indentation.
- Matching is on code only, as for the indentation: an `=` in a string or a comment is no anchor.

### 3.6 Conditions and clauses

- **Operators** (`operators`) are per language and can be more than one word: `and not`, `or not`, `xor`,
  `nand`. The longest is tried first, so `and not` is one operator and is never split over two lines.
- **Where the operator goes** is the attribute `operator` (3.7), one of three, the same for every operator
  of the condition:
  - `end`: at the end of the line before; the lines after line up with the first operand (just right of
    `if `), the operators line up in one column (3.5):

    ```sql
    if @original.mailing_country_id is distinct from @current.mailing_country_id or
       @original.NawGid             is distinct from @current.NawGid             or not
       @original.mailing_ean_code   is distinct from @current.mailing_ean_code
    then
    ```

  - `start`: at the start of the next line, one indent step right of the `if`, the operators lined up
    (right-aligned, 4.5); the first line's operand moves right to line up with the operands after the
    operators:

    ```sql
    if        (@current.mailing_address_type is not distinct from @original.mailing_address_type)
      and     (@current.mailing_address_type = 1 /*specific*/)
      and not (@current.mailing_address_id is null)
    then
    ```

  - `own`: on a line of its own between the operands; every operand, the first one included, one step right
    of the operators:

    ```sql
    if
        (@current.mailing_address_type is not distinct from @original.mailing_address_type)
      and
        (@current.mailing_address_type = 1 /*specific*/)
      and not
        (@current.mailing_address_id is null)
    then
    ```

  Format moves the operators to the place `operator` says. (The earlier text kept them where you typed them; that is
  gone. A fourth value `asTyped` is possible if you want it, 4.11.)
- **`then`** goes on its own line, under its `if`, when the condition spans lines; after a condition on one line
  it stays at the end of that line.
- **Clauses** (the words under `statements`): a clause word starts in its statement's column (`set` and `where`
  under `update`). A clause whose list spans lines has the list on the next lines, one step right (`set`
  above); a clause with one item stays on its line (`where AdrGid = ...`).
- **Where a clause ends**: at the next clause word of the same statement (outside parentheses), or where the
  statement ends.
- **Where a statement ends** (your question: ASA needs no `;` before an `end`), the first of:
  1. a `;` outside parentheses;
  2. a block word of the block it is in: `close` or `middle` (`end`, `end if`, `endif`, `else`, `elseif`,
     `when`, `exception`), so `update t set x = 1 end if` ends at the `end if`;
  3. the word that ends a condition: `then` (`if ... then`), `do`, `loop`, as the pack's `indent` names them;
  4. a new statement word (`statements`) at the start of a line, outside parentheses, that is not a clause of
     the statement running: `set` after `update t` is its clause, `set` after `x = 1` without `update` is a new
     statement; `select` after `insert into t` is its clause, `select` after a finished `update` is a new one;
  5. the end of the selection or the file.
  Blank lines do not end a statement (a long `select` may have them).
- A statement ended in the wrong place only changes the layout of that statement's clauses: the indentation of
  the block words (3.3) does not depend on it, so the next `end` or `else` puts everything right again.
- Pascal and VB get `align` (`:=`, `=`) but no `statements`.

**Joins.** Your messy example:

```sql
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
      and nawfile.NawFilGid = pId;
```

Your layouts for it (the `where` left out). A join without a join inside it keeps its `on`
on its own line. Three forms:

Aligned, also the first comparison of each `on` (`open: same, close: own, base: word, align: on, alignClause: first, afterClose: next`):

```sql
from
  tabNaw naw
  left outer join tabAdres          address_primary              on (address_primary.AdrGid                 = naw.NawGidVestiging and address_primary.AdrCode is null)
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid                 = naw.NawGidCorrespondentie)
  left outer join tabNawRekening    bank_account_default         on (bank_account_default.NawrekNawGid      = naw.nawGid and bank_account_default.nawRekSoort like '%D%')
  left outer join tabNawRekening    bank_account_payment_init    on (bank_account_payment_init.NawrekNawGid = naw.nawGid and bank_account_payment_init.nawRekSoort like '%B%')
  inner join (tabNawFile nawfile
              inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
             )
          on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
  left outer join tabNawOpmerkingen comments                     on (comments.NawOpmNawGid = naw.NawGid)
```

What the rules give with this label (drawn by a script from the rules):

```sql
from
  tabNaw naw
  left outer join tabAdres          address_primary              on (address_primary.AdrGid                 = naw.NawGidVestiging and address_primary.AdrCode is null)
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid                 = naw.NawGidCorrespondentie)
  left outer join tabNawRekening    bank_account_default         on (bank_account_default.NawrekNawGid      = naw.nawGid and bank_account_default.nawRekSoort like '%D%')
  left outer join tabNawRekening    bank_account_payment_init    on (bank_account_payment_init.NawrekNawGid = naw.nawGid and bank_account_payment_init.nawRekSoort like '%B%')
  inner join (tabNawFile nawfile
              inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
             )
          on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
  left outer join tabNawOpmerkingen comments                     on (comments.NawOpmNawGid                  = naw.NawGid)
```

The difference: the last join's `=` is in the `=` column too (yours: right after its left side).

The `on` clauses not aligned inside (`open: same, close: own, base: word, align: on, alignClause: off, afterClose: next`):

```sql
from
  tabNaw naw
  left outer join tabAdres          address_primary              on (address_primary.AdrGid = naw.NawGidVestiging and address_primary.AdrCode is null)
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabNawRekening    bank_account_default         on (bank_account_default.NawrekNawGid = naw.nawGid and bank_account_default.nawRekSoort like '%D%')
  left outer join tabNawRekening    bank_account_payment_init    on (bank_account_payment_init.NawrekNawGid = naw.nawGid and bank_account_payment_init.nawRekSoort like '%B%')
  inner join (tabNawFile nawfile
              inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
             )
          on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
  left outer join tabNawOpmerkingen comments on (comments.NawOpmNawGid = naw.NawGid)
```

What the rules give with this label:

```sql
from
  tabNaw naw
  left outer join tabAdres          address_primary              on (address_primary.AdrGid = naw.NawGidVestiging and address_primary.AdrCode is null)
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabNawRekening    bank_account_default         on (bank_account_default.NawrekNawGid = naw.nawGid and bank_account_default.nawRekSoort like '%D%')
  left outer join tabNawRekening    bank_account_payment_init    on (bank_account_payment_init.NawrekNawGid = naw.nawGid and bank_account_payment_init.nawRekSoort like '%B%')
  inner join (tabNawFile nawfile
              inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
             )
          on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
  left outer join tabNawOpmerkingen comments                     on (comments.NawOpmNawGid = naw.NawGid)
```

The difference: the last join's `on` is in the `on` column (yours: right after `comments`).

The `on` of the join with a join inside after its `)` (`open: same, close: own, base: word, align: on, alignClause: off, afterClose: same`):

```sql
  inner join (tabNawFile nawfile
              inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
             ) on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
```

What the rules give with this label (the whole list):

```sql
from
  tabNaw naw
  left outer join tabAdres          address_primary              on (address_primary.AdrGid = naw.NawGidVestiging and address_primary.AdrCode is null)
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabNawRekening    bank_account_default         on (bank_account_default.NawrekNawGid = naw.nawGid and bank_account_default.nawRekSoort like '%D%')
  left outer join tabNawRekening    bank_account_payment_init    on (bank_account_payment_init.NawrekNawGid = naw.nawGid and bank_account_payment_init.nawRekSoort like '%B%')
  inner join (tabNawFile nawfile
              inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
             ) on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
  left outer join tabNawOpmerkingen comments                     on (comments.NawOpmNawGid = naw.NawGid)
```

The difference: as the second form, the last join's `on` in the `on` column.

A long `on` (fictive): its comparisons under each other, the `on` staying in its column (`open: same, close: own,
base: word, align: on, operator: start, longClause: column`):

```sql
from
  tabNaw naw
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabAdres          address_primary              on (    address_primary.AdrGid = naw.NawGidVestiging
                                                                     and address_primary.AdrCode is null
                                                                     and bank_account_default.NawrekNawGid = naw.nawGid
                                                                     and bank_account_default.nawRekSoort like '%D%'
                                                                    )
```

What the rules give with this label (`align: on` lines up the comparisons of the long `on`):

```sql
  left outer join tabAdres          address_mailing              on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabAdres          address_primary              on (    address_primary.AdrGid            = naw.NawGidVestiging
                                                                     and address_primary.AdrCode           is null
                                                                     and bank_account_default.NawrekNawGid = naw.nawGid
                                                                     and bank_account_default.nawRekSoort  like '%D%'
                                                                    )
```

The difference: `=`, `is` and `like` in one column.

or compact, the `on` on the next line in the join's column (`open: same, close: own, base: word, operator: start, longClause: next`;
the short join's `on` is then not in a column; ASA's default):

```sql
from
  tabNaw naw
  left outer join tabAdres          address_mailing on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabAdres          address_primary
  on (    address_primary.AdrGid = naw.NawGidVestiging
      and address_primary.AdrCode is null
      and bank_account_default.NawrekNawGid = naw.nawGid
      and bank_account_default.nawRekSoort like '%D%'
     )
```

What the rules give with this label (`align` on by default; only the lines shown, so the `on` column is the
widest alias shown plus four):

```sql
  left outer join tabAdres          address_mailing    on (address_mailing.AdrGid = naw.NawGidCorrespondentie)
  left outer join tabAdres          address_primary
  on (    address_primary.AdrGid            = naw.NawGidVestiging
      and address_primary.AdrCode           is null
      and bank_account_default.NawrekNawGid = naw.nawGid
      and bank_account_default.nawRekSoort  like '%D%'
     )
```

The differences: the short join's `on` in a column, and the comparisons of the long `on` lined up.

What I read from these, as rules:

- **Multi-word keywords** as clause words: `left outer join`, `inner join`, `cross join`, ... (the longest first,
  as the operators). Each join starts a line in the `from` list's column.
- **A join without a join inside**: one line: join word, table, alias, `on (...)`. The joins of the list are
  columns: the table, the alias and the `on` start in one column over the whole list. The table column is the
  widest table plus one space; before `on` there are four spaces after the widest alias (in all three forms;
  see 4.13). An item of another shape (`tabNaw naw`, the join with a join inside) is not in the columns.
- **How a nesting is recognized**: not by joins at all. After a join word comes either a table name or a `(`.
  A `(` there opens a group, whatever is in it: joins (`(tabNawFile nawfile inner join ...)`) or a query
  (`(select ... ) x`). That group follows `open`, `close` and `base` like every other parenthesis, and its
  inside is formatted by the same rules, so joins in it behave exactly as the outer ones (your answer), only
  starting further right, at any depth. A join is "simple" (one line, in the columns) when no such group
  spans lines in it.
- **What follows a group over lines** (`) on (...)`, `) x on (...)`, also `) then` or `) as x` elsewhere): on
  the line of the `)`, or on the next line. Not a join attribute but a general one, `afterClose: same / next`
  (3.7). With `next`, your example puts the `on` right-aligned under the join word (it ends where `join`
  ends, measured on your text); in general: under the word that opened the item (4.16).
- **`base` in joins**: `word` as in all your examples (the inner joins just right of the `(`). With
  `base: line` the inside of the group goes one step right of the join's line, the `)` at that line's start:

  ```sql
  inner join (
    tabNawFile nawfile
    inner join tabRekeningschema nawledger on (nawledger.RksGid = nawfile.nawFilRksGid)
  ) on (nawfile.NawFilNawGid = naw.NawGid and NawFilFonId = 'C')
  ```

  (drawn with `open: next, close: own, base: line, afterClose: same`).
- **Inside `on (...)`**: spaces just inside the parentheses go (`( a = b )` becomes `(a = b)`). In the first
  form the first comparison of every `on` lines up over the list (its `=`); the comparisons after the first
  (after `and`) are not aligned. A switch, `alignClause: first / off`.
- **A long `on`**: its comparisons go under each other in the form `operator` says (`start`: the operand
  after the `(` moved right to line up after `and `), and the `)` on its own line under the `(`. Where it
  starts:
  - aligned form: the `on` stays in its column on the join's line;
  - compact form: the join's line ends after the alias, the `on` starts the next line in the join's column,
    and the short joins are not in columns.
  What "long" is: 4.17.
- **Columns over an item of another shape**: in the first form the last join (`tabNawOpmerkingen`) is still in
  the columns after the join with a join inside (its `on`, though not its first `=`: measured on your text, that
  `=` stands where its own left side ends); in the other two it is not. 4.18.
- **Comparisons as one anchor** where they are aligned: `=`, `<>`, `<`, `>`, `like`, `is`, `in`, `between`,
  `is distinct from` in one column. The pack names them as one group: `align: [[=, <>, <, >, like, is, in,
  between, is distinct from], ...]`.

- **`where`**: its list on the next line, one step right, with `operator: start` the first operand moved right
  to line up after the `and`.

### 3.7 Style attributes (per language)

Asked: variants such as compact, clean, extended, per language. Decided: keep the attributes
separate, not joined into named styles. Each attribute is a setting of its own per language; the pack gives its
defaults.

| Attribute | Values | What it changes | ASA default |
|---|---|---|---|
| `open` | `same` / `next` | After `(`, `[`, `{` (and a block word such as `begin`): the content right after it on the same line, or on the next line | `same` |
| `close` | `same` / `own` | `)`, `]`, `}` of a group that spans lines: at the end of its last line, or on a line of its own. A group on one line keeps its `)` (`on (a = b)`) | `own` |
| `base` | `word` / `line` | The next line's indentation: one step right of the column of the `(` or block word, or one step right of the indentation of the line it is on | `word` |
| `align` | `on` / `off` | 3.5 (anchors, list columns) | `on` |
| `oneLine` | `keep` / `split` | A block written on one line: left on one line, or laid out over lines | 4.1 |
| `operator` | `end` / `start` / `own` | Where `and`, `or`, `and not`, ... go in a condition over lines (3.6) | `start` (your examples) |
| `afterClose` | `same` / `next` | What follows a `)` that closes a group over lines (the `on` of a join with a join inside, an alias, `then`): on the `)`'s line, or on the next line (3.6) | `next` |
| `alignClause` | `first` / `off` | The first comparison of each `on` lined up over the list (3.6) | `off` |
| `longClause` | `column` / `next` | A long `on`: it stays in its column on the join's line, or starts the next line in the join's column (3.6) | `next` |
| `parenSpace` | `off` / `on` | `(a = b)` or `( a = b )` | `off` (your examples) |

Your three examples with `open`, `close` and `base` (each attribute on its own):

`open: same, close: same, base: word`:

```sql
select (if a = b then
          'equal'
        else
          'not equal'
        endif)
```

`open: next, close: own, base: word`:

```sql
select (
        if a = b then
          'equal'
        else
          'not equal'
        endif
       )
```

`open: next, close: own, base: line`:

```sql
select (
  if a = b then
    'equal'
  else
    'not equal'
  endif
)
```

`open: same, close: own, base: word` (ASA's default):

```sql
select (if a = b then
          'equal'
        else
          'not equal'
        endif
       )
```

- **Joins need no attribute of their own for their shape**: it follows from the text (your answer): an `on` that
  is short and a join without a join inside give one line; a long `on` goes over lines; a join with a join
  inside puts its `on` as `afterClose` says. The parentheses of joins follow `open` and `close` like all others
  (`(tabNawFile nawfile` is `open: same`, its `)` on a line of its own is `close: own`; the same for a long `on`).
- **The settings**: in the settings window's Languages tab, a row per attribute for each language that has
  rules (its default shown as the pack's), as the language names and Open in are there now. Format and Enter
  use them.
- **The indent step** is the language's indent size from the settings (Options > Settings, Editor: Indent size; a
  pack's `indentSize` where it sets one), and `useTabs` as there; no `format` key of its own (your remark). The
  prototype ran every language with the setting's default, 2.
- **Enter** follows `base` and `open`, so typing and Format agree.
- With `base: line` the column rules of 3.3 become step rules (the depth times the indent size); `align` still
  works on top.
- C# and JavaScript (3.2) use their mode's rules and get no attributes in this plan.

### 3.7a Checked: each drawing against its attributes

Each labelled drawing of 3.6 and 3.7 was checked against the rules and its label, the columns measured with a
script on your text (2026-10-21); under each of your drawings in 3.6 is what the rules give, drawn by a script
(where both agree, the lines are equal, checked). What holds, and where a label does not give its drawing:

| Drawing | Holds | Does not follow from its label |
|---|---|---|
| The four `if` forms (3.7) | `if` just right of the `(` (word) or a step right of the line (line); contents two right of `if`; `else` / `endif` under `if`; `)` under the `(` or at the line start | -- |
| Joins, aligned (first form) | Table column 18, alias 36, `on` 65 over the whole list; first `=` at 108 for the first four joins; the inner `(` at 13, its `)` at 13, the inner join at 14; the `on` after it ends at 12, where `join` ends | The last join keeps the `on` column (65) but not the `=` column (its `=` at 91): with `alignClause: first` over the list it would be at 108. Needs 4.18. |
| Joins, `on` not aligned inside (second form) | As the first form, without the `=` column | The last join (`comments on (`) is out of the `on` column; with `align: on` over the whole list it would be in it. Needs 4.18. |
| Joins, `on` after the `)` (third form) | `) on (` on the `)`'s line | The same as the second form: the last join out of the column. |
| A long `on`, aligned | `on` at 65; `(` at 68; first operand at 73; `and` at 69 (just right of the `(`); `)` at 68 under the `(` | The comparisons are not lined up (`=`, `is`, `like`), while `align: on` would line them up (3.5). Either your fictive example is just not aligned, or `alignClause` also covers the lines of a long `on` (then its label is `alignClause: off`). 4.22. |
| A long `on`, compact | `on` at 2 (the join's column); `(` at 5; first operand at 10; `and` at 6; `)` at 5 | The short join above it keeps the table column but has its `on` out of the column: no attribute gives that. |
| `base: line` join (drawn by me) | Follows its label | Not from your text; drawn from the rule only. |

The rule texts were corrected where this showed a gap: `close` is about groups over lines only (a one-line
`on (a = b)` keeps its `)`).

### 3.7b Language independent: roles in the engine, words in the pack

Your question: the same rules and attributes for every language, only other values. The way: the engine knows
no SQL word at all. It knows roles; each pack says which of its words and signs play which role. The style
attributes (3.7) act on roles, so they have the same names and meaning in every language; only their defaults
and the words differ.

| Role | What the engine does with it | SQL (ASA) | Pascal | C# | JSON |
|---|---|---|---|---|---|
| `groups` | Pairs that open and close a group: `open`, `close`, `base`, `afterClose` act on them | `( )` | `( )`, `[ ]` | `( )`, `[ ]`, `{ }` | `{ }`, `[ ]` |
| `blocks` | Block words: `open`, `middle`, `close` (3.3) | `begin`/`end`, `if`/`else`/`endif`, `case`/`when`/`end case` | `begin`/`end`, `try`/`except`/`finally`/`end`, `case`/`of`/`end` | -- (braces are groups) | -- |
| `ends` | What ends a statement (3.6) | `;`, a block word, `then` | `;`, a block word | `;` | -- |
| `statements` | A statement's first word and its clause words | `select: [from, where, ...]`, `update: [set, where]` | -- | -- | -- |
| `items` | List items with a shape: start words, a source (a name or a group), an alias, a trailing clause; `alignClause`, `longClause`, the columns act on them | joins: start `left outer join`, `inner join`, ...; clause `on`, `using` | -- | LINQ `join ... in ... on ... equals` | -- |
| `operators` | Joining parts of a condition: `operator` acts on them | `and`, `or`, `and not`, `or not`, `xor` | `and`, `or`, `xor`, `and not` | `&&`, `\|\|` | -- |
| `compare` | Comparisons, lined up as one anchor (3.5) | `=`, `<>`, `like`, `is`, `in`, `between`, `is distinct from` | `=`, `<>`, `<`, `>`, `in` | `==`, `!=`, `<`, `>` | -- |
| `align` | Other anchors (3.5) | `=` (in `set`), `default` | `:=` | `=` | `:` |

In the pack all of it sits under one key:

```yaml
format:
  groups:     [['(', ')']]
  blocks:     { open: [begin, if, case, loop], middle: [else, elseif, when, exception],
                close: [end, endif, 'end if', 'end case', 'end loop'] }
  ends:       [';']
  statements: { select: [into, from, where, 'group by', having, 'order by', union], update: [set, from, where] }
  items:      { join: { start: ['left outer join', 'inner join', 'cross join'], clause: [on, using] } }
  operators:  [and, or, 'and not', 'or not', xor]
  compare:    ['=', '<>', '<', '>', like, is, in, between, 'is distinct from', 'is not distinct from']
  align:      ['=', default]
  style:      { open: same, close: own, base: word, align: on, alignClause: off, afterClose: next,
                operator: start, longClause: next, parenSpace: off }
```

- A role a language does not have is left out; the attributes acting on it then do nothing there (JSON has no
  `operators`, so `operator` is not shown for JSON in the settings).
- `style` is the pack's defaults; your settings per language override them attribute by attribute (3.7).
- The earlier separate keys (`indent`, `align`, `operators`, `statements`) become these parts of `format`.
- Renamed for this: `alignOn` -> `alignClause`, `longOn` -> `longClause` (they act on an item's trailing clause,
  which is `on` in SQL); `nestedOn` was already `afterClose`.
- C# and JavaScript use this too (3.2).

**The full set of keys**, as the prototype needed them for all languages (each language's values: appendix):

| Key | What |
|---|---|
| `case`, `word` | Words in any case or exact; what a word is (a pattern). The indent step is not a key: it is the
language's indent size from the settings (3.7) |
| `comments`, `strings` | As the colouring has them; a line comment starting with a space (`' ;'`, `' #'`) only counts after a space; one ending with a space (`'rem '`) only as a word |
| `keep` | Regions kept exactly as written: heredocs, regex literals (`after`: only after one of these signs), POD |
| `groups` | Pairs (`pair`) with their own `open`, `close`, `base`, `openAt` (where the `{` goes: `same`, `next`, `keep`, or `next` for heads matching a pattern), `afterClose`, `oneLine`, `list` (a line per item when split), `block` (statements inside: braces), `tight` (no space inside) |
| `blocks.open` | Block words: `until` (the word that ends its condition: `then`, `do`, `loop`), `before` / `when` (patterns the text before / after the word must match: `Exit Sub` is no opener, VB's `If` only with `Then` at the line end), `inside` / `notInside`, `kind: single` (one statement: C's `if (...)`, Pascal's `if ... then`), `afterGroup` (decided when its `( )` closes), `endsBefore` / `endsAfter` (sections and case branches that end without a word of their own), `breakAfter`, `closes: false`, `line` (a whole-line pattern: a shell `case` pattern, an AutoHotkey hotkey) |
| `blocks.middle` | `else`, `elseif`, `except`, `private:` ...: `of` (which blocks), `until`, `breakAfter`, `lineStart` |
| `blocks.close` | Closer -> the blocks it closes (`end if` -> `if`; `end` -> any of a list); `strict` (only the innermost: AutoHotkey's `return`) |
| `singleBody` | What replaces a one-statement body on the next line: `{` (C), `begin` (Pascal) |
| `ends` | What ends a statement: `;`, and `\n` where a line ends it (VB, shell, JavaScript) |
| `continue`, `continueAfter` | A line starting with these (`.`, `|`) continues the one above, one step in; a line after one ending so (VB's ` _`, PowerShell's `` ` ``) too |
| `statements`, `items` | SQL: statements with their clause words; join items with their start words and clause (3.6) |
| `operators`, `compare`, `align` | 3.5 and 3.6 |
| `separators`, `space`, `trail`, `joinAfterClose` | List separators; one space after / before a sign (JSON's `:`, CSS's `{`); what may follow a `)` on its line; words joined after a `}` (`} else {`) |
| `keepLines`, `labels`, `keepIndent` | Lines at column 0 (`#if`, batch labels); lines at the column of their braces (C++ `public:`); keep the indentation as written (Python) |
| `freeClosers` | Closers that need no opener (3.7e) |
| `markup`, `void`, `verbatimElements`, `autoClose` | XML / HTML: tags, elements without content, elements kept as written, implied end tags |
| `tables` | Markdown: rows around a delimiter row (`sep`, `delimiter`, `fill`): the separators in columns, each row one line |
| `longLimit`, `clauseGap` | A clause is long with more comparisons than this (4.14); the spaces before a clause in a join's column (4.13) |
| `style` | The attributes of 3.7, the pack's defaults |

### 3.7c JSON and XML with the same attributes

They fit, and they use the same formatter, not a parser of their own. Two things the
parsers gave are kept another way: every value stays exactly as written because the formatter changes only
whitespace and line breaks outside strings and comments, for every language; and a mistake (a `{` without its
`}`) is reported by the check of 3.7e, with its line. JSON's question "keep the comments?" goes: Format always
keeps them; removing comments is a conversion of its own (Convert menu), if wanted. The roles they have:

| Attribute | JSON | XML |
|---|---|---|
| `open` | after `{` / `[`: the first member on the same line or the next | after a start tag: its content on the same line or the next |
| `close` | `}` / `]` on a line of its own, or after the last member | the end tag on a line of its own, or after the content |
| `base` | members a step right of the `{` (word) or of the line (line) | children a step right of the `<` of the start tag (word) or of its line (line) |
| `align` | the `:` of the members of one object in a column | the `=` of attributes over lines in a column |
| `oneLine` | a short object or array written on one line stays (`{"x": 1, "y": 2}`) | an element with only text stays on one line (`<name>Arco</name>`) |
| `parenSpace` | `{ "x": 1 }` or `{"x": 1}` | -- |
| `longClause` | -- | a long list of attributes: one per line under the first (word) or a step right (line) |
| `operator`, `alignClause`, `afterClose` | -- (no such role) | -- |

JSON with `open: next, close: own, base: line, align: on, oneLine: keep` (the layout of today's pretty print plus
`align`):

```json
{
  "id":      1,
  "name":    "Arco",
  "address": {"street": "Main", "city": "Leiden"},
  "tags":    [
    "a",
    "b"
  ]
}
```

The same with `open: same, close: same, base: word`:

```json
{"id":      1,
 "name":    "Arco",
 "address": {"street": "Main", "city": "Leiden"},
 "tags":    ["a",
             "b"]}
```

XML with `open: next, close: own, base: word, align: on, oneLine: keep`, a long attribute list (`longClause`; for a
start tag at the start of a line, `word` and `line` give the children the same place):

```xml
<connection name="main"
            host="db01"
            port="2638">
  <user>dba</user>
  <options>
    <option key="timeout" value="30"/>
  </options>
</connection>
```

- What stays fixed for XML whatever the attributes: text in mixed content and in `xml:space="preserve"` is never
  re-wrapped or re-indented (it would change the document), as today.
- JSON's comments question (keep or drop) stays as it is.
- The defaults are chosen so that today's output does not change unless you change a setting: `align: off` for
  both until you switch it on. The prototype's JSON output for a minified object is the same as today's pretty
  print (examples file).

### 3.7d The prototype: one engine, a parameter set per language

To find out whether one formatter fits every language, a prototype was built (Python, in
`docs/plans/reformat-prototype/`; not part of LexPen): one engine that knows only roles, and per language a
parameter set. It was run on your ASA examples and on a messy sample of every other shipped language
(appendix; the samples before and after in `PLAN-reformat-examples.md`). Each output was formatted a second time
and did not change; the check of 3.7e found nothing in any clean sample.

What the engine does, in order:

1. Splits the text into tokens: words, signs, strings, comments, kept regions (heredocs, regex literals), and for
   XML / HTML tags, attributes and text. Tokens are never changed, only the whitespace between them.
2. Line breaks, from the frames it finds (groups, blocks, conditions, statements, clauses, join items,
   elements): `open`, `close`, `afterClose`, `openAt`, `oneLine`, list separators, block words over lines, a long
   clause. Repeated until nothing changes.
3. Indentation of every line from the frame it starts in (`base: word` or `line`).
4. Operators at the start of a line, and alignment (anchors, list columns, join columns), repeated with 3 until
   stable.

Where the prototype differs from your drawings, or decides something not yet asked:

- **Operators are not moved** between the line's end and the next line's start; they stay where you typed them,
  and `operator: start` lines up the ones at a line start. Your condition example has both kinds in one text
  (`and` at the start, `or` at the end), so moving them would change it. 4.11.
- **Your condition example** comes out as drawn, except that `is distinct from` stands one space after the
  widest left side; yours stands further right (perhaps longer names elsewhere in your code). 4.8.
- **The last join** keeps its `on` in the column (columns over the whole list, 4.15); your second form has it
  right after `comments`.
- **A block written on one line** (`begin declare x ...; end`) stays on one line (`oneLine: keep`). 4.2.
- **Alignment** only applies inside lists, clauses and conditions, never between the statements of a block
  (an `=` in `set x = 1;` is not lined up with the `=` of the next statement).
- **Forced indentation** hardly exists: only where the indentation is the structure (YAML's `- ` lists, Python's
  blocks), and there Format must not change it (it would change the meaning). Those keep their indentation.
- **A `(` alone on its line** (your parameter list) puts its contents one indent step right of it; a `(` after
  text puts them just right of it (your `select (`). Both of your examples need this.

### 3.7e Checking: openers without closers (your addition)

The frames the formatter builds tell where something is missing, so the same pass can check the text:

- An opener without its closer, where the language requires one: a `(`, `{`, `begin`, `if ... then` without
  `end if`, a quote without its end, an XML element without its end tag. Reported at the opener's line.
- A closer without an opener: an `end if` or `)` that closes nothing. Reported at its line.
- Not reported: what the language allows to stay open: a statement that ends at the end of the selection or the
  file (a `select` ends at a `;`, at an `end` of the block it is in, or at the end), HTML's implied end tags
  (`<li>`, `<p>`), Pascal's final `end.`, a shell pattern's `)`. The pack names those (`freeClosers`,
  `autoClose`).
- How it shows: a red mark in the gutter of that line (as you suggested), with the text as a tooltip; and in
  the settings window's problem list? 4.25.
- The prototype does this: for the text

  ```sql
  begin
    if x = 1 then
      set y = (1 + 2;
    end
  end if;
  end
  ```

  it reports line 2 `if` not closed, line 3 `(` not closed, line 5 `end if` closes nothing, line 6 `end` closes
  nothing.

### 3.8 Tests

- In-app (new t64): your three examples give the normalized form; Enter after `(`, after `then`, typing `else`,
  `endif`, `)` at a line start; a `-- end` comment and a `'begin'` string that do not count; a one-line `if`
  stays; a missing `)` does not shift the lines after the `endif`; Pascal `try`/`except`/`end`; C# by its mode;
  the selection form; useTabs; undo is one step; the JSON block in a .sql file pretty printed in its place, a
  fence in markdown by its language; the joins example gives the text of 3.6. Your two SQL examples
  of 3.5, typed without alignment, give exactly the text shown there; a second Format changes nothing; an `=` in
  a string is no anchor; a blank line ends a run, a comment line does not.
- Unit: every shipped pack's `indent` rules load (`LanguagePacksTests`).

### 3.9 Docs

README (Format, Enter), the packs' README (`indent`, `align`, `operators`, `statements`, `format: indent`, the row
for `/Indent Strings` in "From an UltraEdit word file").

## 4. Open questions

1. **A block on one line.** `if a = b then 'equal' else 'not equal' endif` on one line: keep it (as 3.4), or
   always lay it out over lines? Your third example splits `then 'equal' else` because the block already spans
   lines; that I took as the rule.
2. **Test files.** A few of your real ASA and Pascal files would be the test set for the rules: which ones may I
   use?
3. **Continued statements.** Conditions and `set` follow your example 2 (3.6). A `select a, b from t
   where x = 1` over lines: the column list after `select` on the next lines one step right, as `set`?
4. **Steps.** Build it in three steps, each usable on its own: (1) indentation and Enter (3.3, 3.4), (2)
   alignment (3.5), (3) conditions and clauses (3.6)? Recommended: yes; step 3 is the most SQL-specific.
5. **Operators of different length.** `and`, `or` and `and not` in one condition (`start` and `own`):
   left-aligned as drawn in 3.6 (`  and     (` above `  and not (`), or right-aligned (`      and (` above
   `  and not (`)?
6. **Columns in example 1.** The name column is wider than the names shown (I assume a longer name in the part
   left out). If the widest name is all it takes: plus one space, or a minimum gap (your type column has at least
   five spaces after `nchar(80)`)?
7. **Comments at a line end.** Never aligned (as in example 1), or aligned when they are in a run of their own
   (several lines with a trailing comment in a row)?
8. **More switches.** Others you want as a switch, e.g. keyword case (`IF` / `if` / as written), a space inside
   parentheses?
9. **The own-line form.** Is 3.6's `own` drawing what you mean by "between lines": operators one step right of
   the `if`, every operand one step further? And should there be `asTyped` (the operator stays where it is)?
10. **Clauses.** You asked why clauses are there. They are not for the operators: they put `set`, `from` and
    `where` under their statement (`update`) and the `set` list on the next lines. If I read your question
    wrongly and you meant the sentence "Format keeps the operator where you put it": that one is replaced by
    the `operator` switch.
11. **Statements without `;`.** Is 3.6's list complete for ASA? Other words that end a statement there (`go`
    between batches, a label, `declare`), or statements of which a clause word is also a statement word (as
    `set`)?
12. **An inner part partly selected.** A selection that covers half of a JSON block: format the whole block
    (JSON can only be pretty printed whole), or only indent the selected lines of it?
13. **The gap before `on`.** Four spaces after the widest alias in your examples, one after the widest table: a
    fixed rule (one space inside an item, four before a clause word such as `on`), or an attribute?
14. **What a long `on` is.** Your first form keeps two comparisons on one line of over 150 characters and
    splits the fictive one with four. Split by the number of comparisons (more than two?), by the length of the
    text between the parentheses, or by the line's length (a line width setting)?
15. **Columns after a join with a join inside.** Your first form keeps the last join in the columns after it,
    the other two start again. Which one, or a switch?
16. **`afterClose: next`, which column.** Your example ends the `on` where `join` ends. As a general rule: right
    under the end of the word that opened the item (`join`, `then` under ...?), at the item's start (the
    join's column), or one step right of it?
17. **Comparisons in a long `on`.** Lined up over its lines (`=`, `is`, `like` in one column), or not (as your
    fictive example)? If not: `alignClause` covers them too, and the aligned long form's label is `alignClause: off`.
18. **How problems show (3.7e).** A red mark in the gutter of the line with a tooltip, as you suggested; also
    a count in the bottom bar or a list (F8 to the next one)? Checked while typing (after a pause) or on Format?
19. **The prototype in the repository.** `docs/plans/reformat-prototype/` holds it (engine, parameters, samples)
    as the reference for the real one (its outputs can become the tests). Keep it there, or remove it once the
    formatter is built?
20. **Arguments of a call on the next line.** Your file has `call api_..._DoAction(` with every argument on the next
    lines, one step in. With ASA's `open: same` Format pulls the first one up next to the `(` and lines the others
    up under it (column 37 there). Keep it so, make `open: next` the default for the parentheses of a call (a
    group setting), or leave the content where it is when the `(` ends its line?

## 5. Resolved during execution

| Point | What was done |
|---|---|
| The formatter | `web/reformat.js`: a port of the prototype (`docs/plans/reformat-prototype`), one engine for every language; the parameters from each pack's `format:` (generated from the prototype's sets, so what was tested is what ships). Tested by t64: the 21 samples and 10 ASA cases give exactly the prototype's output, and a second Format changes nothing (31 of 31). |
| JSON and XML (3.2, 3.7c) | On the same formatter. Their comments question is gone (comments stay); `<b/>` stays as written (the old pretty print wrote `<b />`); the declaration and the root element on lines of their own. `Formatters.cs`, the host's `format` and `askKeepComments` and `FormattersTests` are no longer used; not removed (your call). |
| Mistakes in the structure | Format leaves the text as it was when the check of 3.7e finds an opener without its closer or a closer without one in the lines to format; the message gives the line and the cursor goes there (as the old pretty print did for JSON / XML). For HTML the end tags that may be left out (`optionalEnd`) do not count. The gutter marks of 3.7e (4.18) are not built. |
| A selection | Its whole lines are formatted; the lines above count as they are, not as Format would make them (`set y` after an unformatted `if` at column 0 goes to column 2). |
| A part of another language | Formatted by its own parameters, its lines from the indentation it had; it moves with the line above it, and so does the end marker in the comment that holds it (`]==*/`). A language without parameters (plain text) keeps its lines and moves along. |
| `base: line` with `open: same` | As the definition says: one step right of the indentation of the line the block word is on (`select (if a = b then` / `  'x'` / `endif`). |
| ASA: `exception` (your example) | `declare @x exception for sqlstate ...` was read as a block's exception part, and its `for` as a loop. Now `exception`, `for`, `while` and `loop` count only where a statement starts (a label may come first), and the exception part is a branch one step inside its `begin`, its `when` lines one step further, as in your example. In the tests (t64, ASA: exception). |
| Your suppliers_HELPER.sql | Formatted as a whole in the prototype (3432 lines; a second Format changes nothing). It showed: a type of two words (`long nvarchar`) was split over two columns, and a comment right after the last word of an item was pushed out. Now only the gaps every row of a list has are columns (mode, name), the rest of a row is one cell lined up by its anchor (`default`), and the gap before a line-end comment is no column. A blank line no longer ends a list's columns (your lists keep one column through blank and comment lines; that is also why your `in` has two spaces: `out` is further down the same list). A `(` that starts a line of a statement (`declare @original ROW`, then `(`) stands at the statement's column. The check reported line 3156, `")" closes nothing`: correct, comments do not nest in SQL Anywhere (the `*/` of `/*Raise when in use*/` ends the outer comment). |
| `call x(` with its arguments on the next lines (your file) | ASA's `open: same` pulls the first argument up next to the `(` and lines the others up under it; your code has them on the next line, one step in. Left as the default says (4.20). |
| Enter and closing words | Enter in a language with parameters (not Python, markdown): the new line where Format would put it (an empty line gets a neutral probe so it gets its frame's column). Typing a closing word followed by a space or sign at a line start (`end if;`, `else `), or a closing sign (`}`, `)`), or `>` of an end tag, moves that line to its column. At most 2000 lines above are read. Tested by t67. |
| Line breaks per round | The prototype applies one fix at a time; LexPen applies all fixes found in a round, from the end of the text to its start, skipping a fix on a line another fix of the round changed. The same output on all 31 cases. |
| Speed | Measured by t68 (debug build, this machine), the ASA procedure repeated: 250 lines: Format 33 ms, Enter 4 ms; 1000 lines: 88 ms, 13 ms; 4000 lines: 278 ms, 33 ms. |
| The settings | Options > Settings, Languages: "Format: <language>", a row per style attribute the language has (`format.<lang>.<attr>`; empty: the language's own). Values built: `open`, `close`, `base`, `align`, `oneLine`, `operator` (`start`, `end`; `own` of 3.6 is not built), `afterClose`, `alignClause` (`first`, `off`), `longClause`, `parenSpace` (`on` adds no spaces yet where the text has none). |
| The indent step (your remark) | No `indent` key: the language's indent size (the setting, or the pack's `indentSize`) and `useTabs`. |
| Every language's Format button | A pack with parameters gets the action Format (bar, Format menu), also ASA, C#, markdown (its tables), Python (its brackets). t56 and t60 expect them. |
| Menus | Format holds the bar items, Convert (Alt+N) the conversions; per embedded language a submenu in each, left out when empty; the conversions at the cursor on Ctrl+Alt+C (commit `8c30fd0`). |
| Docs | README (Format, indentation while typing), the packs' README (a section on the `format:` parameters: every key and attribute), the file tables. |
| Tests | New: t64 (the prototype's outputs), t67 (in the editor: whole file, selection, the JSON block and its markers, undo, the inner Format, Enter, `end if;` typed, settings rows, C#'s button), t68 (speed). Rewritten: t55 (JSON / XML on the formatter). Expectations: t56, t60, t4. Unit tests: 181 pass (the packs load with their parameters). |

## Appendix: Structure per language

Each language: whether it fits, what is specific to it, and its full parameter set as it would go under
`format:` in its `language.yaml` (generated from the prototype's own parameters, so this is what was run).
The samples before and after: `PLAN-reformat-examples.md`.

### ASA / SQL (`asa`)

Verdict: fits.

- Parameters (your defaults): `open: same, close: own, base: word, align: on, alignClause: off, afterClose: next, operator: start, longClause: next`.
- Your examples come out as drawn in 3.6 and 3.7 (the three `if` forms, the parameter list, the condition example, the joins with the join inside, the long `on`), with the differences listed in 3.7d.
- Specific: the join words and `on` (`items`), statements with their clause words, `when` and a `case`'s `else` as branches one step inside the `case` (until the next branch), `exception` as a middle of `begin`, `then` / `loop` / `do` ending a condition, no `;` needed before `end`.
- A whole procedure (declare, select into, if / elseif / else, case, while loop, exception part) is in the examples file.

```yaml
format:
  case: false
  word: '[A-Za-z_@#$][A-Za-z0-9_@#$]*(?:\.[A-Za-z_@#$][A-Za-z0-9_@#$]*)*'
  comments: {line: ['//', '--'], block: [['/*', '*/']]}
  strings:
    - {open: '''', double: true}
    - {open: '"', double: true}
  groups:
    - {pair: ['(', ')'], tight: true}
  blocks:
    open:
      - {w: begin, breakAfter: true}
      - {w: if, until: [then]}
      - {w: case}
      - {w: loop, breakAfter: true, before: '^\s*(\w+:\s*)?$'}
      - {w: while, until: [loop], before: '^\s*(\w+:\s*)?$'}
      - {w: for, until: [do], before: '^\s*(\w+:\s*)?$'}
      - {w: when, inside: [case, exception], until: [then], closes: false, endsBefore: [when, else, end case, end]}
      - {w: exception, inside: [begin], before: '^\s*$', closes: false, endsBefore: [end]}
      - {w: else, inside: [case], closes: false, endsBefore: [when, end case, end]}
    middle:
      - {w: else, of: [if], breakAfter: true}
      - {w: elseif, of: [if], until: [then]}
    close: {end if: if, endif: if, end case: case, end loop: [loop, while], end for: for, end: [begin, case]}
  ends: [';']
  statements:
    select: [into, from, where, group by, having, order by, union, union all]
    update: [set, from, where]
    insert: [values, select]
    delete: [from, where]
    set: []
    call: []
    return: []
    declare: []
    message: []
  items:
    join: {start: [left outer join, right outer join, full outer join, inner join, cross join, left join, right join, join], clause: ['on']}
  operators: [and not, or not, and, or, xor]
  compare: [is not distinct from, is distinct from, is not, not like, like, not in, in, between, '<>', '!=', '<=', '>=', '=', '<', '>', is]
  align: [default]
  separators: [',']
  longLimit: 2
  clauseGap: 4
  style: {open: same, close: own, base: word, align: 'on', alignClause: 'off', afterClose: next, operator: start, longClause: next, oneLine: keep, parenSpace: 'off'}
```

### SQL (`sql`)

Verdict: fits, with one exception.

- ASA's set plus `merge` and `with`. Fits ANSI SQL, PL/SQL and PostgreSQL (`if ... then ... end if`).
- Does not fit T-SQL's `IF` without `END IF` (`IF x BEGIN ... END`): a T-SQL pack would need `if` as a one-statement block, as Pascal's. Not shipped now.

```yaml
format:
  case: false
  word: '[A-Za-z_@#$][A-Za-z0-9_@#$]*(?:\.[A-Za-z_@#$][A-Za-z0-9_@#$]*)*'
  comments: {line: ['//', '--'], block: [['/*', '*/']]}
  strings:
    - {open: '''', double: true}
    - {open: '"', double: true}
  groups:
    - {pair: ['(', ')'], tight: true}
  blocks:
    open:
      - {w: begin, breakAfter: true}
      - {w: if, until: [then]}
      - {w: case}
      - {w: loop, breakAfter: true, before: '^\s*(\w+:\s*)?$'}
      - {w: while, until: [loop], before: '^\s*(\w+:\s*)?$'}
      - {w: for, until: [do], before: '^\s*(\w+:\s*)?$'}
      - {w: when, inside: [case, exception], until: [then], closes: false, endsBefore: [when, else, end case, end]}
      - {w: exception, inside: [begin], before: '^\s*$', closes: false, endsBefore: [end]}
      - {w: else, inside: [case], closes: false, endsBefore: [when, end case, end]}
    middle:
      - {w: else, of: [if], breakAfter: true}
      - {w: elseif, of: [if], until: [then]}
    close: {end if: if, endif: if, end case: case, end loop: [loop, while], end for: for, end: [begin, case]}
  ends: [';']
  statements:
    select: [into, from, where, group by, having, order by, union, union all]
    update: [set, from, where]
    insert: [values, select]
    delete: [from, where]
    set: []
    call: []
    return: []
    declare: []
    message: []
    merge: [using, 'on', when]
    with: [select]
  items:
    join: {start: [left outer join, right outer join, full outer join, inner join, cross join, left join, right join, join], clause: ['on']}
  operators: [and not, or not, and, or, xor]
  compare: [is not distinct from, is distinct from, is not, not like, like, not in, in, between, '<>', '!=', '<=', '>=', '=', '<', '>', is]
  align: [default]
  separators: [',']
  longLimit: 2
  clauseGap: 4
  style: {open: same, close: own, base: word, align: 'on', alignClause: 'off', afterClose: next, operator: start, longClause: next, oneLine: keep, parenSpace: 'off'}
```

### C# (`csharp`)

Verdict: fits.

- Braces on their own line (Allman, as Visual Studio), `}` then `else` on the next line.
- Specific: one statement after `if` / `for` / `foreach` / `while` / `using` / `lock` without braces, also when the condition spans lines; `case` / `default` labels with their statements one step in; method chains (`.Where(...)`) one step in; `#if` / `#endif` at column 0; `@"..."` and `$"..."` strings.

```yaml
format:
  case: true
  word: '[A-Za-z_@$][A-Za-z0-9_$]*'
  comments: {line: ['//'], block: [['/*', '*/']]}
  strings:
    - {open: '@"', close: '"', double: true, lines: true}
    - {open: '$"', close: '"', escape: '\'}
    - {open: '"', escape: '\'}
    - {open: '''', escape: '\'}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: next, afterClose: next, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
    open:
      - {w: if, kind: single, closes: false, afterGroup: true}
      - {w: for, kind: single, closes: false, afterGroup: true}
      - {w: foreach, kind: single, closes: false, afterGroup: true}
      - {w: while, kind: single, closes: false, afterGroup: true}
      - {w: using, kind: single, closes: false, afterGroup: true}
      - {w: lock, kind: single, closes: false, afterGroup: true}
      - {w: fixed, kind: single, closes: false, afterGroup: true}
      - {w: else, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: do, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: case, before: '^\s*$', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
      - {w: default, before: '^\s*$', when: '^\s*:', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
  singleBody: ['{']
  ends: [';']
  operators: ['&&', '||']
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['==', '!=', '<=', '>=', '<', '>']
  align: ['=']
  keepLines: ['^\s*#\s*(if|else|elif|endif|define|undef|pragma|nullable|line|error|warning)\b']
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
```

### Java (`java`)

Verdict: fits.

- Braces at the end of the line (K&R), `} else {`, `} catch (...) {`; annotations; text blocks (`"""`).

```yaml
format:
  case: true
  word: '[A-Za-z_@$][A-Za-z0-9_$]*'
  comments: {line: ['//'], block: [['/*', '*/']]}
  strings:
    - {open: '"""', close: '"""', lines: true}
    - {open: '"', escape: '\'}
    - {open: '''', escape: '\'}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: same, afterClose: same, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
    open:
      - {w: if, kind: single, closes: false, afterGroup: true}
      - {w: for, kind: single, closes: false, afterGroup: true}
      - {w: while, kind: single, closes: false, afterGroup: true}
      - {w: else, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: do, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: case, before: '^\s*$', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
      - {w: default, before: '^\s*$', when: '^\s*:', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
      - {w: synchronized, kind: single, closes: false, afterGroup: true}
  singleBody: ['{']
  ends: [';']
  operators: ['&&', '||']
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['==', '!=', '<=', '>=', '<', '>']
  align: ['=']
  keepLines: []
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
  joinAfterClose: [else, catch, finally, while]
```

### JavaScript (`javascript`)

Verdict: fits.

- K&R braces, indent 2; a line end ends a statement (no `;` needed); regex literals kept as written (only after `(`, `=`, `,` ... so `a / b` stays a division); template strings over lines; chains one step in.

```yaml
format:
  case: true
  word: '[A-Za-z_$][A-Za-z0-9_$]*'
  comments: {line: ['//'], block: [['/*', '*/']]}
  strings:
    - {open: '`', escape: '\', lines: true}
    - {open: '"', escape: '\'}
    - {open: '''', escape: '\'}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: same, afterClose: same, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
    open:
      - {w: if, kind: single, closes: false, afterGroup: true}
      - {w: for, kind: single, closes: false, afterGroup: true}
      - {w: while, kind: single, closes: false, afterGroup: true}
      - {w: else, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: do, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: case, before: '^\s*$', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
      - {w: default, before: '^\s*$', when: '^\s*:', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
  singleBody: ['{']
  ends: [';', "\n"]
  operators: ['&&', '||']
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['===', '!==', '==', '!=', '<=', '>=', '<', '>']
  align: ['=']
  keepLines: []
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
  keep:
    - {re: '/(?![*/])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n])+/[dgimsuy]*', after: '(,=:[!&|?{};'}
  joinAfterClose: [else, catch, finally, while]
```

### C++ (`cpp`)

Verdict: fits.

- Braces kept where they are (`openAt: keep`: projects differ); preprocessor lines at column 0; `public:` / `private:` at the column of the class's braces; raw strings.

```yaml
format:
  case: true
  word: '[A-Za-z_][A-Za-z0-9_]*'
  comments: {line: ['//'], block: [['/*', '*/']]}
  strings:
    - {open: 'R"(', close: ')"', lines: true}
    - {open: '"', escape: '\'}
    - {open: '''', escape: '\'}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: keep, afterClose: next, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
    open:
      - {w: if, kind: single, closes: false, afterGroup: true}
      - {w: for, kind: single, closes: false, afterGroup: true}
      - {w: while, kind: single, closes: false, afterGroup: true}
      - {w: else, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: do, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: case, before: '^\s*$', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
      - {w: default, before: '^\s*$', when: '^\s*:', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
  singleBody: ['{']
  ends: [';']
  operators: ['&&', '||']
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['==', '!=', '<=', '>=', '<', '>']
  align: ['=']
  keepLines: ['^\s*#']
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
  labels: ['^(public|private|protected)\s*:']
```

### PHP (`php`)

Verdict: fits.

- PSR-12: braces of classes and functions on their own line, of control structures at the line end; `} elseif`; heredocs kept. The HTML around `<?php ... ?>` is the embedded HTML language.

```yaml
format:
  case: true
  word: '[A-Za-z_$][A-Za-z0-9_]*'
  comments: {line: ['//', '#'], block: [['/*', '*/']]}
  strings:
    - {open: '"', escape: '\', lines: true}
    - {open: '''', escape: '\', lines: true}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: {default: same, next: '^((abstract|final|public|private|protected|static|readonly)\s+)*(class|interface|trait|enum|function)\b'}, afterClose: same, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
    open:
      - {w: if, kind: single, closes: false, afterGroup: true}
      - {w: for, kind: single, closes: false, afterGroup: true}
      - {w: foreach, kind: single, closes: false, afterGroup: true}
      - {w: while, kind: single, closes: false, afterGroup: true}
      - {w: else, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: do, kind: single, closes: false, when: '^\s*(//.*)?$'}
      - {w: case, before: '^\s*$', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
      - {w: default, before: '^\s*$', when: '^\s*:', inside: ['{'], closes: false, endsBefore: [case, default, '}']}
  singleBody: ['{']
  ends: [';']
  operators: ['&&', '||', and, or, xor]
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['===', '!==', '==', '!=', '<=', '>=', '<', '>']
  align: ['=']
  keepLines: []
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
  keep:
    - '<<<\s*([A-Za-z_]+).*?^\s*\1\b'
  joinAfterClose: [else, elseif, catch, finally, while]
```

### Perl (`perl`)

Verdict: fits, with care.

- K&R braces; regex literals (`/.../`, `s/.../.../`, `m//`, `qr//`), `q( )` forms, POD and heredocs kept as written. Perl's quoting has more forms than these patterns know (`q{}`, `s{}{}`, other delimiters); text in such a form could be misread. Fine for ordinary code.

```yaml
format:
  case: true
  word: '[A-Za-z_$@%][A-Za-z0-9_:]*'
  comments: {line: ['#']}
  strings:
    - {open: '"', escape: '\', lines: true}
    - {open: '''', escape: '\', lines: true}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: same, afterClose: same, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
  singleBody: ['{']
  ends: [';']
  operators: ['&&', '||', and, or, not]
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['==', '!=', eq, ne, lt, gt, le, ge, '=~']
  align: ['=']
  keepLines: []
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
  keep:
    - '^=[a-zA-Z].*?^=cut\b.*?$'
    - '<<"?([A-Z_]+)"?;.*?^\1$'
    - {re: '(?:m|qr|s|tr|y)?/(?:\\.|[^/\\\n])*/(?:(?:\\.|[^/\\\n])*/)?[a-z]*', after: '(,=~!{;'}
    - 'q[qwr]?\((?:\\.|[^)\\])*\)'
  joinAfterClose: [else, catch, finally, while]
```

### PowerShell (`powershell`)

Verdict: fits.

- K&R braces, `} else {`; `@{ }`, `@( )`, `$( )` as groups; a pipeline over lines (a line ending in `|` or a backtick) one step in; here-strings kept.

```yaml
format:
  case: false
  word: '[A-Za-z_$@-][A-Za-z0-9_:$-]*'
  comments: {line: ['#'], block: [['<#', '#>']]}
  strings:
    - {open: '@"', close: '"@', lines: true}
    - {open: '@''', close: '''@', lines: true}
    - {open: '"', escape: '`', lines: true}
    - {open: '''', double: true, lines: true}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: same, afterClose: same, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['@(', ')'], open: same, close: same, base: word}
    - {pair: ['$(', ')'], open: same, close: same, base: word}
    - {pair: ['@{', '}'], open: next, close: own, base: line, block: true}
  blocks:
  singleBody: ['{']
  ends: [';', "\n"]
  operators: ['-and', '-or', '-xor']
  continue: ['|']
  compare: ['-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-like', '-match']
  align: ['=']
  keepLines: []
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
  continueAfter: '(`|\|)\s*$'
  joinAfterClose: [else, elseif, catch, finally, until, while]
```

### AutoHotkey (`ahk`)

Verdict: fits.

- Hotkeys (`^!x::`) and labels (`Start:`) are blocks up to their `return` (only a `return` at their own level: one inside an `if` does not end them); one statement after `if` / `else` / `loop` without a brace; a line comment is ` ;` after a space.

```yaml
format:
  case: false
  word: '[A-Za-z_#@$][A-Za-z0-9_#@$]*'
  comments: {line: [' ;'], block: [['/*', '*/']]}
  strings:
    - {open: '"', double: true, escape: '`'}
    - {open: '''', escape: '`'}
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, openAt: keep, afterClose: next, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, afterClose: same, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, afterClose: same, tight: true}
  blocks:
    open:
      - {w: if, kind: single, closes: false, when: '^(?!.*\{\s*(;.*)?$)'}
      - {w: while, kind: single, closes: false, when: '^(?!.*\{\s*(;.*)?$)'}
      - {w: for, kind: single, closes: false, when: '^(?!.*\{\s*(;.*)?$)'}
      - {w: loop, kind: single, closes: false, when: '^(?!.*\{\s*(;.*)?$)'}
      - {w: else, kind: single, closes: false, when: '^\s*(;.*)?$'}
      - {w: section, line: '^(\S.*::\s*(;.*)?$|[\w#@$]+:\s*(;.*)?$)', closes: true}
    close: {return: {of: section, strict: true}}
  singleBody: ['{']
  ends: ["\n"]
  operators: ['&&', '||', and, or]
  continue: ['.', '?.', '?', ':', '??', '+', '=>']
  compare: ['==', '!=', '<=', '>=', '<', '>']
  align: ['=']
  keepLines: []
  style: {open: same, close: own, base: line, align: 'off', afterClose: next, operator: start, oneLine: keep, parenSpace: 'off'}
  trail: [';', ',', ')', ']', '}', '.']
```

### Pascal / Delphi (`pascal`)

Verdict: fits.

- Specific: the sections `uses`, `type`, `var`, `const` one step in until the next section or `begin`; `= class(...)` opens, a forward `= class;` does not; `private` / `public` at the class's column; `case ... of` with its labels and `else`; `try` / `except` / `finally`, `on E: X do`; `repeat ... until`; one statement after `then` / `do` / `else`, a `begin` on the next line takes its place at the `if`'s column; the final `end.` of a unit.
- A label's `begin` on the next line (`2:` then `begin`) stands at the label's column (Delphi's own formatter may put it one step in; to check).

```yaml
format:
  case: false
  word: '[A-Za-z_][A-Za-z0-9_]*'
  comments: {line: ['//'], block: [['{', '}'], ['(*', '*)']]}
  strings:
    - {open: '''', double: true}
  groups:
    - {pair: ['(', ')'], open: same, close: same, base: word, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: word, tight: true}
  blocks:
    open:
      - {w: begin, breakAfter: true}
      - {w: try, breakAfter: true}
      - {w: asm}
      - {w: repeat, breakAfter: true}
      - {w: case, until: [of]}
      - {w: record, before: '(=|:)\s*(packed\s+)?$'}
      - {w: class, before: '=\s*$', when: '^(?!\s*;)(?!\s+of\b)'}
      - {w: interface, before: '=\s*$', when: '^(?!\s*;)'}
      - {w: object, before: '=\s*$'}
      - {w: var, before: '^\s*$', when: '^\s*$', closes: false, endsBefore: [begin, var, const, type, label, procedure, function, constructor, destructor, implementation, initialization, finalization, class procedure, class function, 'end.']}
      - {w: const, before: '^\s*$', when: '^\s*$', closes: false, endsBefore: [begin, var, const, type, label, procedure, function, constructor, destructor, implementation, initialization, finalization, class procedure, class function, 'end.']}
      - {w: type, before: '^\s*$', when: '^\s*$', closes: false, endsBefore: [begin, var, const, type, label, procedure, function, constructor, destructor, implementation, initialization, finalization, class procedure, class function, 'end.']}
      - {w: uses, before: '^\s*$', closes: false, endsAfter: [';']}
      - {w: if, kind: single, closes: false, until: [then], body: single, endsBefore: [else]}
      - {w: while, kind: single, closes: false, until: [do], body: single}
      - {w: for, kind: single, closes: false, until: [do], body: single}
      - {w: with, kind: single, closes: false, until: [do], body: single}
      - {w: 'on', kind: single, closes: false, until: [do], body: single, inside: [try]}
      - {w: else, kind: single, closes: false, when: '^\s*(//.*)?$'}
    middle:
      - {w: except, of: [try], breakAfter: true}
      - {w: finally, of: [try], breakAfter: true}
      - {w: else, of: [case], breakAfter: true}
      - {w: private, of: [class, object], lineStart: true}
      - {w: protected, of: [class, object], lineStart: true}
      - {w: public, of: [class, object], lineStart: true}
      - {w: published, of: [class, object], lineStart: true}
      - {w: strict private, of: [class, object], lineStart: true}
    close: {end: [begin, try, asm, case, record, class, interface, object], until: repeat}
  singleBody: [begin]
  freeClosers: ['end\.']
  ends: [';']
  operators: [and, or, xor, and not, or not]
  compare: ['<>', '<=', '>=', '=', '<', '>', in, is]
  align: [':=']
  style: {open: same, close: same, base: line, align: 'off', afterClose: same, operator: start, oneLine: keep, parenSpace: 'off'}
```

### Visual Basic (`vb`)

Verdict: fits.

- `If ... Then` opens only when `Then` ends the line (also after a ` _` continuation); `Select Case` with its `Case` branches one step in; `For` / `Next`, `Do` / `Loop`, `While` / `End While`, `Try` / `Catch` / `Finally`, `Sub` / `Function` / `Property` with their modifiers; `Exit Sub` and `MustOverride Sub` open nothing; `Get` / `Set` only inside a `Property`; a line after ` _` one step in.

```yaml
format:
  case: false
  word: '[A-Za-z_][A-Za-z0-9_]*[%&@!#$]?'
  comments: {line: ['''', 'REM ', 'Rem ', 'rem ']}
  strings:
    - {open: '"', double: true}
  groups:
    - {pair: ['(', ')'], open: same, close: same, base: word, tight: true}
    - {pair: ['{', '}'], open: same, close: same, base: word}
  blocks:
    open:
      - {w: If, when: '\bThen\s*(''.*)?$', until: [Then]}
      - {w: Select Case}
      - {w: Case, before: '^\s*$', inside: [select case], closes: false, endsBefore: [Case, End Select]}
      - {w: For, before: '^\s*$'}
      - {w: Do, before: '^\s*$'}
      - {w: While, before: '^\s*$'}
      - {w: With, before: '^\s*$'}
      - {w: Try, before: '^\s*$'}
      - {w: Using, before: '^\s*$'}
      - {w: SyncLock, before: '^\s*$'}
      - {w: Sub, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Function, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Property, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Operator, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Event, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Get, before: '^\s*$', when: '^\s*(\(|$)', inside: [property]}
      - {w: Set, before: '^\s*$', when: '^\s*(\(|$)', inside: [property]}
      - {w: Class, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
      - {w: Module, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
      - {w: Structure, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
      - {w: Namespace, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
      - {w: Interface, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
      - {w: Enum, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
    middle:
      - {w: ElseIf, of: [if], until: [Then]}
      - {w: Else, of: [if]}
      - {w: Catch, of: [try]}
      - {w: Finally, of: [try]}
    close: {End If: If, End Select: Select Case, Next: For, Loop: Do, Wend: While, End While: While, End With: With, End Try: Try, End Using: Using, End SyncLock: SyncLock, End Sub: Sub, End Function: Function, End Property: Property, End Get: Get, End Set: Set, End Operator: Operator, End Event: Event, End Class: Class, End Module: Module, End Structure: Structure, End Namespace: Namespace, End Interface: Interface, End Enum: Enum}
  ends: ["\n", ':']
  continueAfter: '\s_\s*$'
  operators: [AndAlso, OrElse, And Not, Or Not, And, Or, Xor]
  compare: ['<>', '<=', '>=', '=', '<', '>', Is, IsNot, Like]
  align: ['=']
  style: {open: same, close: same, base: line, align: 'off', afterClose: same, operator: start, oneLine: keep, parenSpace: 'off'}
```

### VBScript (`vbscript`)

Verdict: fits.

- VB's set without the .NET blocks (`Try`, `Using`, `Namespace`, ...); `While` / `Wend`; `Set x = ...` is an assignment, not a block.

```yaml
format:
  case: false
  word: '[A-Za-z_][A-Za-z0-9_]*[%&@!#$]?'
  comments: {line: ['''', 'REM ', 'Rem ', 'rem ']}
  strings:
    - {open: '"', double: true}
  groups:
    - {pair: ['(', ')'], open: same, close: same, base: word, tight: true}
    - {pair: ['{', '}'], open: same, close: same, base: word}
  blocks:
    open:
      - {w: If, when: '\bThen\s*(''.*)?$', until: [Then]}
      - {w: Select Case}
      - {w: Case, before: '^\s*$', inside: [select case], closes: false, endsBefore: [Case, End Select]}
      - {w: For, before: '^\s*$'}
      - {w: Do, before: '^\s*$'}
      - {w: While, before: '^\s*$'}
      - {w: With, before: '^\s*$'}
      - {w: Sub, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Function, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Property, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$', notInside: [interface]}
      - {w: Get, before: '^\s*$', when: '^\s*(\(|$)', inside: [property]}
      - {w: Set, before: '^\s*$', when: '^\s*(\(|$)', inside: [property]}
      - {w: Class, before: '^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'}
    middle:
      - {w: ElseIf, of: [if], until: [Then]}
      - {w: Else, of: [if]}
    close: {End If: If, End Select: Select Case, Next: For, Loop: Do, Wend: While, End While: While, End With: With, End Try: Try, End Using: Using, End SyncLock: SyncLock, End Sub: Sub, End Function: Function, End Property: Property, End Get: Get, End Set: Set, End Operator: Operator, End Event: Event, End Class: Class, End Module: Module, End Structure: Structure, End Namespace: Namespace, End Interface: Interface, End Enum: Enum}
  ends: ["\n", ':']
  continueAfter: '\s_\s*$'
  operators: [AndAlso, OrElse, And Not, Or Not, And, Or, Xor]
  compare: ['<>', '<=', '>=', '=', '<', '>', Is, IsNot, Like]
  align: ['=']
  style: {open: same, close: same, base: line, align: 'off', afterClose: same, operator: start, oneLine: keep, parenSpace: 'off'}
```

### Ruby (`ruby`)

Verdict: fits.

- Blocks ending in `end`; `if` / `unless` / `while` as modifiers (`return if x`) open nothing, `x = if ...` does; `do |x|` blocks; `case` / `when`; `begin` / `rescue` / `ensure`; heredocs and `=begin` kept.

```yaml
format:
  case: true
  word: '[A-Za-z_@$][A-Za-z0-9_]*[?!]?'
  comments: {line: ['#']}
  strings:
    - {open: '"', escape: '\', lines: true}
    - {open: '''', escape: '\', lines: true}
  keep:
    - '^=begin\b.*?^=end\b.*?$'
    - '<<[~-]?([A-Z_]+).*?^\s*\1$'
  groups:
    - {pair: ['{', '}'], open: same, close: same, base: line, block: true}
    - {pair: ['(', ')'], open: same, close: same, base: word, tight: true}
    - {pair: ['[', ']'], open: same, close: same, base: line}
  blocks:
    open:
      - {w: if, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: unless, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: while, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: until, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: case, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: for, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: def, before: '^\s*((private|protected|public)\s+)?$'}
      - {w: class, before: '^\s*((private|protected|public)\s+)?$'}
      - {w: module, before: '^\s*((private|protected|public)\s+)?$'}
      - {w: begin, before: '(^\s*|=\s*|\(\s*)$'}
      - {w: do, before: '^(?!\s*(while|until|for)\b)'}
    middle:
      - {w: elsif, of: [if, unless]}
      - {w: else, of: [if, unless, case, begin]}
      - {w: when, of: [case]}
      - {w: in, of: [case], lineStart: true}
      - {w: rescue, of: [begin, def, do]}
      - {w: ensure, of: [begin, def, do]}
    close: {end: null}
  ends: [';', "\n"]
  operators: ['&&', '||', and, or]
  compare: ['==', '!=', '<=', '>=', '<', '>', '=~']
  align: ['=']
  continue: ['.', '&.']
  style: {open: same, close: same, base: line, align: 'off', afterClose: same, operator: start, oneLine: keep, parenSpace: 'off'}
```

### Shell (`shell`)

Verdict: fits.

- `if` / `then` / `elif` / `else` / `fi`, loops with `do` / `done`, `case ... in` with its patterns one step in until `;;`, `esac`; heredocs and `${...}` kept; `#` is a comment only after a space (`${f#./}` is not).

```yaml
format:
  case: true
  word: '[A-Za-z0-9_./$-]+'
  comments: {line: [' #']}
  strings:
    - {open: '"', escape: '\', lines: true}
    - {open: '''', lines: true}
  keep:
    - '<<-?\s*[\''"]?([A-Za-z_]+)[\''"]?.*?^\t*\1$'
    - '\$\{[^}]*\}'
    - '\$\(\(.*?\)\)'
  groups:
    - {pair: ['{', '}'], open: next, close: own, base: line, block: true}
    - {pair: ['$(', ')'], open: same, close: same, base: line}
    - {pair: ['(', ')'], open: same, close: same, base: word}
    - {pair: ['[[', ']]'], open: same, close: same, base: word}
  blocks:
    open:
      - {w: if, until: [then]}
      - {w: while, until: [do]}
      - {w: until, until: [do]}
      - {w: for, until: [do]}
      - {w: select, until: [do]}
      - {w: case, until: [in]}
      - {w: pattern, line: '^[^\s()]+(\s*\|\s*[^\s()]+)*\)', inside: [case], closes: false, endsAfter: [';;'], endsBefore: [esac]}
    middle:
      - {w: elif, of: [if], until: [then]}
      - {w: else, of: [if]}
    close: {fi: if, done: [while, until, for, select], esac: case}
  signs: [';;', '&&', '||']
  freeClosers: ['^\s*[^\s()]+(\s*\|\s*[^\s()]+)*\)']
  ends: [';', "\n"]
  continueAfter: '(\\|\||&&)\s*$'
  style: {open: same, close: same, base: line, align: 'off', afterClose: same, operator: end, oneLine: keep, parenSpace: 'off'}
```

### Batch (`batch`)

Verdict: fits.

- Parenthesized blocks; `) else (` stays on one line (it must); labels at column 0; `rem` and `::` comments (`rem` as a word only).

```yaml
format:
  case: false
  word: '[A-Za-z0-9_%!.:\\-]+'
  comments: {line: ['::', 'rem ', 'REM ', 'Rem ', '@rem ', '@REM ']}
  strings:
    - {open: '"'}
  groups:
    - {pair: ['(', ')'], open: next, close: own, base: line, afterClose: same, block: true}
  keepLines: ['^\s*:[A-Za-z_]']
  ends: ["\n", '&']
  style: {open: next, close: own, base: line, align: 'off', afterClose: same, oneLine: keep}
```

### JSON (`json`)

Verdict: fits.

- The same output as today's pretty print for a minified text (every object and array over lines), comments kept; values never touched.

```yaml
format:
  case: true
  word: '[A-Za-z0-9_.+-]+'
  comments: {line: ['//'], block: [['/*', '*/']]}
  strings:
    - {open: '"', escape: '\'}
  groups:
    - {pair: ['{', '}'], list: true, block: true}
    - {pair: ['[', ']'], list: true, block: true}
  separators: [',']
  align: [':']
  space: [{after: ':'}, {after: ','}]
  style: {open: next, close: own, base: line, align: 'off', oneLine: split, afterClose: same, parenSpace: 'off'}
```

### XML (`xml`)

Verdict: fits.

- Element-only content over lines; an element with only text, or with mixed content (text and elements), stays as written; a start tag with attributes over lines puts them under the first; comments, CDATA, processing instructions.

```yaml
format:
  markup: true
  case: true
  align: ['=']
  style: {open: next, close: own, base: line, align: 'off', oneLine: split}
```

### HTML (`html`)

Verdict: fits.

- XML's rules plus: void elements (`<br>`, `<meta>`, ...), implied end tags (`<li>`, `<p>`, `<td>`, `<tr>`, `<option>`, `<dt>` / `<dd>`), `<pre>` / `<textarea>` as written; `<script>` and `<style>` by their own language (the embedded JavaScript and CSS; the prototype keeps them as written).

```yaml
format:
  markup: true
  case: false
  void: [area, base, br, col, embed, hr, img, input, link, meta, source, track, wbr]
  verbatimElements: [pre, textarea, script, style]
  autoClose:
    li: [li]
    td: [td, th]
    th: [td, th]
    tr: [tr, td, th]
    option: [option]
    dt: [dt, dd]
    dd: [dt, dd]
    p: [p]
    div: [p]
    ul: [p]
    ol: [p]
    table: [p]
    h1: [p]
    h2: [p]
    h3: [p]
    h4: [p]
    h5: [p]
    h6: [p]
    pre: [p]
    form: [p]
    blockquote: [p]
    hr: [p]
    section: [p]
    article: [p]
    header: [p]
    footer: [p]
    nav: [p]
  align: ['=']
  optionalEnd: [html, head, body, p, li, dt, dd, option, tr, td, th, thead, tbody, tfoot, colgroup]
  style: {open: next, close: own, base: line, align: 'off', oneLine: split}
```

### CSS (`css`)

Verdict: fits.

- Every rule over lines, one declaration per line; one space after `:` inside a rule only (`a:hover` stays), before `{` and after `,` inside a rule; `@media ( )` stays on one line.

```yaml
format:
  case: false
  word: '[A-Za-z0-9_#.%-]+'
  comments: {block: [['/*', '*/']]}
  strings:
    - {open: '"', escape: '\'}
    - {open: '''', escape: '\'}
  groups:
    - {pair: ['{', '}'], list: true, block: true, openAt: same}
    - {pair: ['(', ')'], open: same, close: same, base: word, tight: true, oneLine: keep}
  separators: [';']
  ends: [';']
  align: [':']
  space: [{after: ':', inside: '{'}, {after: ',', inside: '{'}, {before: '{'}]
  trail: [';', ',', ')', '}']
  style: {open: next, close: own, base: line, align: 'off', oneLine: split, afterClose: next, parenSpace: 'off'}
```

### Python (`python`)

Verdict: fits partly.

- The indentation is the structure, so it stays exactly as written (`keepIndent`); only lines inside brackets are lined up just right of the bracket, and alignment works. Reindenting a block is not possible: nothing in the text says how deep it belongs.

```yaml
format:
  case: true
  keepIndent: true
  word: '[A-Za-z_][A-Za-z0-9_]*'
  comments: {line: ['#']}
  strings:
    - {open: '"""', lines: true, escape: '\'}
    - {open: '''''''', lines: true, escape: '\'}
    - {open: '"', escape: '\'}
    - {open: '''', escape: '\'}
  groups:
    - {pair: ['(', ')'], open: same, close: same, base: word}
    - {pair: ['[', ']'], open: same, close: same, base: word}
    - {pair: ['{', '}'], open: same, close: same, base: word}
  operators: [and, or, and not, or not]
  compare: ['==', '!=', '<=', '>=', '<', '>', is not, not in, is, in]
  align: ['=']
  style: {open: same, close: same, base: word, align: 'off', afterClose: same, operator: start, oneLine: keep, parenSpace: 'off'}
```

### Markdown (`markdown`)

Verdict: fits for its tables.

- Your question: a table fits. Its rows are the lines around a delimiter row (`|---|:--:|`); the `|` signs go in columns, one space inside each cell, the delimiter row filled with `-` to the column's width, and a cell's text left, centred or right as its column's `:` markers say. Every row stays one line.
- A `|` in a code span (`` `a|b` ``) or escaped (`\|`) is no separator; a table inside a fenced code block stays as written; rows with and without the outer `|` keep their form (no `|` is added or removed, only spaces).
- Everything else in Markdown (the prose, lists, headings) stays as written: its indentation is structure (a list's items). Fenced code is formatted by its own language (3.4).
- Not handled: characters wider than one column (Chinese, emoji) would misalign the columns, as in any plain-text editor.

```yaml
format:
  case: true
  keepIndent: true
  word: '[^\s|`\\]+'
  strings:
    - {open: '`'}
  keep:
    - '\\.'
    - '^(```|~~~).*?^\1\s*$'
  tables: {sep: '|', fill: '-', delimiter: '^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$'}
  style: {align: 'on', oneLine: keep}
```

### Languages that do not fit

- **YAML**: its indentation is the structure (a `- ` list item, a nested key); changing it changes what the
  file means, which Format must never do (your remark). Left out.
- **Plain text**: nothing to format.
