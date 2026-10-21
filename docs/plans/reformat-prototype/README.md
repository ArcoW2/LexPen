# Reformat prototype

The prototype behind PLAN-reformat.md (3.7d): one engine that knows roles only (`engine.py`) and a parameter set
per language (`langs.py`, `langs_more.py`). Not part of LexPen; Python 3.

- `python t_asa.py`: your ASA examples; the output must equal `asa_golden.txt`.
- `python t_lang.py csharp`: one language's sample (`samples/csharp.txt`), formatted, then checked that a second
  Format changes nothing.
- `python gen_doc.py yaml` / `python gen_doc.py ex`: the parameter sets as YAML and the samples before and after,
  as used in the plan's appendix and PLAN-reformat-examples.md.
