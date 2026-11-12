# Plan: Git colours in the Folder pane for repositories below the root

Status: draft 2026-11-11; not started.

## 1. What this is about

The Folder pane colours a file or folder by its git status (M, A, U, D, R, !) only when the root is inside a
repository. It asks git once, at the root (`GitStatus`, MainForm.cs; `loadGit`, app.js). A root that holds
repositories without being in one itself (`D:\Projects\Bank_Connect`, with `Main`, `Bankkoppeling`, the `wt-*`
worktrees each a repository of their own) gets no colours at all, not even in the folders that are repositories.

A root anywhere inside a repository works today (git finds the top level upward, the status is limited to the root
with `-- .`). Only repositories below the root are missed.

## 2. The solution, in brief

The folder listing marks each folder that is a repository (it holds `.git`, a folder or a worktree's file). Every such
folder the pane lists gets its own git status, merged with the root's own (when the root is in a repository) into the
one status map the pane colours from. A folder above a repository then shows the most important status inside it, as
folders already do. Refresh and the watcher ask every known repository again, not only the root's.

## 3. Details

### 3.1 Finding the repositories

- `List` (MainForm.cs) adds `repo: true` to a folder entry that holds `.git` (`Directory.Exists` or `File.Exists`:
  a worktree or submodule has a `.git` file). One check per listed folder; independent of the hidden filter (`.git`
  itself stays unlisted as now).
- A repository is found when its folder is listed: the root's own folders always, deeper ones once their parent is
  opened in the pane. `listItems` (app.js) collects them in a set of known repositories for the current root, reset by
  `openFolder` with the status map.
- Trade-off: a repository two or more levels down under a folder never opened does not colour that closed folder.
  The alternative, a walk of the whole tree for `.git` at the root, finds them all but costs a scan of every folder
  (`[not yet checked]` on a large tree). See open question 1.

### 3.2 Asking git

- A newly known repository: `gitStatus` for its folder (the host call as it is), in the background as `loadGitLater`
  does today, its entries merged into `git` (app.js), then `refreshTree(false)` so the rows get their colours.
- `loadGit(root)` becomes: the root's own status plus each known repository's, merged. Each is its own git process;
  they can run side by side on the host (`Task.Run` per call already). Time on many repositories: `[not yet checked]`.
- Root inside a repository that also holds a nested repository (a worktree folder inside the main one, a submodule):
  the outer status lists the nested folder as one untracked entry (`?? Main/`). That entry is dropped in favour of the
  nested repository's own entries, so a clean nested repository does not show as untracked.
- `gitStatusOf` and `deletedIn` need no change: they work on paths in the merged map, and the folder rollup (the
  most important status inside, `GIT_PRIORITY`) already works by path prefix.

### 3.3 Keeping it current

- `OnTreeEvent` (MainForm.cs) reports a git change only for `<root>\.git\index`; a nested `Main\.git\index` is skipped
  by the rule that ignores dot-folders. It becomes: any path ending in `.git\index` reports a git change.
- A worktree's index lives in its main repository's `.git\worktrees\<name>\index`, which may be outside the root's
  watcher. Its edited files still trigger a git refresh (`content` events, as today); a stage or commit there without
  an edit below the root is not seen until Refresh. Same as a root inside a repository today.
- `refreshTree(true)` and the git refresh on a change ask every known repository again.

### 3.4 Not changed

- The gutter and scroll bar git marks (per file, `GitHead`) and Compare with a version (per file or folder) already
  work from the file's own folder; untouched.
- The definitions refresh on a git change (definitions.js) follows as it does.

### 3.5 Tests

- GitStatus moves where a test can reach it, or the merge rule (3.2: drop the outer untracked entry of a nested
  repository) is a small function of its own with a test: outer `?? Main/` plus nested entries gives the nested
  entries only; a nested repository with no changes gives nothing for it.
- `List`: a folder with a `.git` folder and one with a `.git` file are `repo: true`; a plain folder is not.
- By hand, root `D:\Projects\Bank_Connect`: `Main` and the worktrees show their colours, a changed file in `Main`
  colours `Main`; stage it in a console, the colour follows without Refresh; open a folder that is a repository as
  root, colours as before; a root inside a repository with a worktree folder in it, the worktree shows its own status,
  not U.
- features.md: the Folder pane's git colours also for repositories below the root (opened folders).

## 4. Open questions

1. Is finding a repository when its folder is listed enough (3.1), or should a closed folder already show the status
   of repositories deeper inside it, which means a walk of the tree at the root (and a limit to how deep it goes)?
