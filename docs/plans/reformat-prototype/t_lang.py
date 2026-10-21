import sys, os
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
from engine import format_text, problems
import langs
name = sys.argv[1]
cfg = getattr(langs, name.upper())
text = open(os.path.join(here, 'samples', name + '.txt'), encoding='utf-8').read().rstrip()
out, _ = format_text(text, cfg)
print(out)
if '-p' in sys.argv: print(problems(text, cfg))
# a second Format changes nothing
again, _ = format_text(out, cfg)
if again != out: print('!! NOT STABLE: a second Format changes it')
