# Plan: Remote files (FTP / SFTP)

Status: draft 2026-10-21, not started. From the list "what UltraEdit or Visual Studio has and LexPen does not".
The number in the file name is the priority; rename to reorder.

## 1. What this is about

Files on a server cannot be opened and saved in LexPen. UltraEdit has FTP / SFTP accounts and a remote folder
browser.

## 2. The solution, in brief

Accounts (host, user, key or password in Windows' credential store) and a remote folder in the folder pane; a file
opens from there into a tab and is saved back on Ctrl+S.

## 3. Details

- SFTP (SSH.NET) and FTPS; plain FTP only if asked.
- Passwords never in LexPen's files: Windows Credential Manager.
- Locking and changes on the server: checked before a save (the remote time), as "changed on disk".
- Large, and a security surface; mapping a drive (SSHFS-Win, WinSCP) gives most of it without LexPen code (4.1).

### 3.1 Tests

Unit with a local SFTP server: list, read, write, a changed file detected.

## 4. Open questions

1. Needed at all, given a mapped drive does it?
