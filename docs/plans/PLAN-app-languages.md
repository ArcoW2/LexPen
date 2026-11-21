# Plan: App languages (LexPen's own texts in English, Nederlands, Deutsch, ...)

Status: draft 2026-11-21; not started. Foldex has a plan for the same (`foldex\docs\plans\38-PLAN-languages.md`); this
one follows it where LexPen is alike.

## 1. What this is about

Every text LexPen shows is English and written in its code: the actions' titles and hints (F1, the menus, the
ribbon), the settings window's rows, the menus built in code, the dialogs and questions, the toasts and the status bar,
the tooltips, the startup document. Wanted: every one of them translatable, a language being a file of its own, chosen
in the settings.

This plan is about the **app language** (English, Nederlands, Deutsch), not the **document language** (markdown, ASA
SQL, JSON): see 3.1.

## 2. The solution, in brief

Every text the user sees goes through one function that looks it up in the app language chosen, with English as
it is in the code as the fallback. An app language is a JSON file of keys and texts: shipped ones next to the exe, your own
(or changed ones) in the data folder. The host loads the file the setting `appLanguage` names and gives it to
every page with the settings, and uses it for its own texts (questions, messages). The startup document comes per
app language, each file linking to the others. A command writes an app language file with every key and its English, to
start a translation from.

## 3. Details

### 3.1 Two kinds of language: app language and document language

LexPen has two things called a language. They are kept apart in every word: in the plans, the code, the settings and
the screens.

| | App language | Document language |
|---|---|---|
| What | The language LexPen's own texts are in | The language of a document's content |
| Examples | English, Nederlands, Deutsch | markdown, ASA SQL, JSON, C# |
| Comes from | an app language file (this plan) | a language pack (`languages` folder) |
| Chosen | once, in Settings: `appLanguage` | per file: the status bar's language list, File types |
| In the code | `appLanguage`, `appLanguages\`, `t()` | `doc.language`, `languages\`, `languageOf` |

- **On screen** the app language is always called "App language", never just "Language". "Language" alone stays what
  it is now: the document language (the status bar, the ribbon's Language button, File types' Language column).
- **In the plans and in talk**: "app language" and "document language"; "language" alone only where only one is
  meant beyond doubt, and better not at all.

### 3.2 What is a text

Translated: whatever LexPen itself writes for the user to read.

- Actions (actions.js, and every appAction): title, hint, the titles of their variants; F1, the menus and the ribbon
  use these.
- The settings window: tabs, groups, titles, hints, notes, the options of a choice; its own words (settings.html,
  settings.js).
- The menus (menus.js MENUS) and the menus built in code (a tab's, the gutter's, the outline's, the folder pane's).
- The pages' fixed texts (index.html, settings.html and the others): buttons, labels, placeholders, tooltips.
- Toasts, the status bar, the find bar's counts, the dialogs of the page (the name dialog, Customize, File types).
- The host's: AskForm's questions and buttons, its messages and errors, the Print window, the char picker, the
  highlights window, the projects and theme windows.
- The startup document (3.6).
- The shipped names of things you can rename (the ribbon's tabs and groups, the shipped macros' names): shown
  translated while you did not rename them; once renamed, your name.

Not translated:

- The document languages' names and what their packs define (a document language is called as it is called: C#,
  Delphi).
- What Windows gives: its dialogs (open, save, colour), file types' names, its error texts.
- What you made or named: projects, theme sets, bookmarks' and highlights' notes, macros.
- Key names in shortcuts (Ctrl+Shift+F): as Windows writes them in English menus.
- The files you edit by hand (settings.json, keys.json, ribbon.json): their comments stay English.
- The macro language's words (its commands are code).

### 3.3 Keys

- Where a text belongs to something with an id, the key is made from that id, so the code needs nothing:
  `action.find.title`, `action.find.hint`, `setting.previewerMode.title`, `setting.previewerMode.option.dark`.
- Elsewhere the code names a key and gives its English: `t('toast.noBookmarks', 'This file has no bookmarks.')`.
  Reading the code shows the English; the key keeps a translation when the English is reworded.

The English text itself as the key (gettext's way) needs no keys, but one English word with two meanings cannot be
translated twice, and every reworded text loses its translations (Open questions).

### 3.4 Placeholders and plurals

- Named placeholders: `t('find.count', '{n} of {total}', { n, total })`; a translation may move them.
- Plurals as Intl.PluralRules has them per language: a text with plural forms is an object
  `{ "one": "{count} highlight", "other": "{count} highlights" }`. Today's code writes the plural by hand in places
  (`highlight${n === 1 ? '' : 's'}`); those go through this.

### 3.5 Language files

- One JSON file per app language: its code (`nl`), its name in itself (`Nederlands`), the locale for dates and numbers
  (`nl-NL`), and `texts`: key -> text (or plural forms). Comments allowed, as in settings.json.
- Shipped: `defaultsppLanguages\<code>.json`. Yours: `<data folder>ppLanguages\<code>.json`: a file of your own adds a
  language; one with the code of a shipped one changes or adds its texts (key by key, as your settings.json over the
  defaults).
- English has no file: its texts are in the code. A file `en.json` of your own still changes English texts.
- The host loads the language chosen and sends it with the settings, so every page has it: the main windows, the
  settings window, the floating panels, the print and char picker pages. A key a language lacks: its English.
- A file that cannot be read: English, and a problem in the settings window (as a settings.json that cannot be read).

### 3.6 The setting

- `appLanguage`, shown as "App language" (Settings > App, a group of its own): English and the files found, each by
  its own name.
- Switching: every window's page is loaded again (each keeps its tabs and layout, as after a restart), since most texts
  are drawn once (the ribbon, the menus, the settings rows). Drawing everything again live means every part that drew
  a text redraws it (Open questions).

### 3.7 The startup document

- One file per app language (PLAN-startup.md): `startup.md` in English, `startup.<code>.md` for each other one
  (`startup.nl.md`), next to the language files. Each starts with a line of links to the others
  ("English | Nederlands | ...").
- It names the app language LexPen is in, with a link to the setting App language (`appLanguage`).
- The first start, and Options > Startup, open the file of the app language, else the English one.

### 3.8 Dates and numbers

- Dates LexPen writes itself, wherever it shows one (which places: [not yet checked]): month and day names in the
  language's locale.
- Numbers (sizes, counts): in the language's locale, or Windows' regional settings (Open questions).

### 3.9 Starting a language

- An action "Write an app language file": every key and its English into `<data folder>\appLanguages\new.json`, to
  translate and rename. It needs every key in one place: the derived keys from the definitions (actions, settings
  rows, menus), the named ones from a list the test of 3.10 writes.
- The settings window, at the setting: how many texts the language chosen lacks, and a button that writes them into
  your file of that language, with their English, to fill in.

### 3.10 Tests

- Every key named in the web code (t('key', ...)) and in the host's is unique: one key, one English text.
- A language file's placeholders match the English's (a translation that drops {count} is a problem).
- A shipped language file has no keys that no longer exist.
- The pages show a language's text for a key it has, English for one it lacks, a plural form by count.
- Switching to a test language (a file of a few keys): the ribbon, a menu, the settings window and a toast in it;
  English where it lacks a key; the startup document of that language, and its links to the others.

## 4. Open questions

1. Keys: from the ids where there is one and named in the code elsewhere (3.3, recommended), or the English text as the
   key everywhere? To be looked at together when the plan is taken up.
2. Switching: the windows' pages loaded again (recommended: simple, nothing missed), or everything drawn again live?
3. Numbers with a language: in the language's locale, or Windows' regional settings?
4. Which languages are shipped first, besides English (Dutch?), and who translates them?
