Create or replace procedure Trial()
begin
  declare @fk_constraint  exception for sqlstate '23W05';  // foreign key constraint violation
  declare @errormessage   nchar(255) ;
  declare @errorcode      integer ;

  //--- Limit scope of potential exceptions situations, otherwise no execution of succeeding statements
  begin
    call NawDelete( @current.id,
                    1               /* 1 = delete ledger account */
                    );
    exception
      // --- Exceptions
      when @fk_constraint then call api_raise(25105, '', 'suppliers', @current.id); //Entity %1! with id ''%2!'' is currently in use and cannot be changed or removed.
      when others         then resignal;
  end;
end;
/*==[
# Plan 37: Copy file, one submenu

## 1. trial

The folder pane's right-click menu has three loose items: Copy file name, Copy path, Copy relative path. They
are to make way for one item, **Copy name to Windows clipboard**, with a submenu of six ways to copy a file's name. The same submenu
also goes on the File menu, where it acts on the active document, and the tab menu of a document.


### 1.1 The six items
The menu of a folder changes the 'file' into 'folder'; 'Filename' becomes 'Foldername', the 'Path' copies the path without the ending folder name , etc.

| Item                           | Copies for files                               | Copies for folders | Example (root `D:\Work`, file `D:\Work\docs\a.md`) |
| ------------------------------ | ---------------------------------------------- | --- | -------------------------------------------------- |
| Filename                       | the name without its extension                 | The name without its extension | `a`                                                |
| Filename.ext                   | the name with its extension                    | The name with its extension    | `a.md`                                             |
| `---`                          |                                                |     |                                                    |
| Path                           | the folder, without the file                   | the folder, without the ending folder name | `D:\Work\docs`                                     |
| Path and filename.ext          | the full name                                  | the full name    | `D:\Work\docs\a.md`                                |
| `---`                          |                                                |     |                                                    |
| Relative path                  | the folder, relative to the folder pane's root | the folder without the ending folder name, relative to the folder pane's root    | `docs`                                             |
| Relative path and filename.ext | the full name, relative to the root            | the full name, relative to the root    | `docs\a.md`                                        |

### 2 also a test

- `file.copy` in actions.js, with parameter `part`: `name`, `nameExt`, `dir`, `full`, `relDir`, `relFull`.
- The parameters are what the menus pass. A key in keys.json can be put on each part, and a macro records them like
  any other action.
- No path given: the active document's path. A draft that has never been saved has no path: the Name menu
  item is greyed out, and a key does nothing.
- A file on the root adds a '\' for the path: 'D:\a.md' copies path 'D:\'.
- A file on a network drive gives the network url: '\\server.local\a.md' copies '\\server.local\'; '\\server.local\path\a.md' copies '\\server.local\path'.
- A relative path in the root gives no path: 'D:\root\a.md' with root 'D:\root' gives '' as path, and 'a.md' as file.

]==*/

Create or replace procedure Trial2()
begin
  declare @fk_constraint exception for sqlstate '23W05';  // foreign key constraint violation
  declare @errormessage   nchar(255) ;
  declare @errorcode      integer ;

  //--- Limit scope of potential exceptions situations, otherwise no execution of succeeding statements
  begin
    if (0 = 0) then
      call NawDelete(@current.id,
                      1               /* 1 = delete ledger account */
                    );
    end if;
  exception
    when @fk_constraint then call api_raise(25105, '', 'suppliers', @current.id); //Entity %1! with id ''%2!'' is currently in use and cannot be changed or removed.
    when others         then resignal;
  end;
end;
