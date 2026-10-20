# Making a language pack

1. Copy this folder to `%LOCALAPPDATA%\LexPen\languages\` and give it the language's short name, for example
   `tcc`. A folder with the name of a shipped language (`csharp`, `sql`, `pascal`, ...) replaces that one.
2. Edit `language.yaml`: every part is explained in its comments. Start with `name` and `extensions`, then the
   colouring (`comments`, `quotes`, `words`, `rules`), then the outline and the actions.
3. Edit `bar.yaml` for the buttons above the editor. Icons: SVG files in an `icons` folder of the pack, or the
   shared ones of the plain text pack (`comment`, `blockcomment`, `indent`, `outdent`, `snippet`, `case`,
   `format`). The bar is also the Format menu, in the same order; Convert comes at its end by itself.
4. Save: LexPen picks the change up at once. A mistake shows in the settings window (Options > Settings) and
   the language falls back to plain text until it is fixed.

A key for an action goes in your `keys.json`, by the action's name: `"Ctrl+Alt+I": "snippetIff"`. The same
key can do something else in another language, with an action of the same name there.

The shipped packs (`wwwroot\languages`) are examples: SQL, Sybase ASA SQL, AutoHotkey and Delphi / Pascal are
coloured by their own word lists; C#, JavaScript, JSON, YAML, PowerShell and XML use a built-in editor mode
(`mode:`). The full guide (where packs live, the colouring, the bar, maintaining packs, converting an UltraEdit
word file): `README.md` in the languages folder.
