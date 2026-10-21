from langs import BS, clike, kr, ASA
import copy

# ---------------------------------------------------------------- Pascal / Delphi
_sections = ['begin', 'var', 'const', 'type', 'label', 'procedure', 'function', 'constructor', 'destructor',
             'implementation', 'initialization', 'finalization', 'class procedure', 'class function', 'end.']
PASCAL = {
    'case': False, 
    'word': r'[A-Za-z_][A-Za-z0-9_]*',
    'comments': {'line': ['//'], 'block': [['{', '}'], ['(*', '*)']]},
    'strings': [{'open': "'", 'double': True}],
    'groups': [{'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word', 'tight': True},
               {'pair': ['[', ']'], 'open': 'same', 'close': 'same', 'base': 'word', 'tight': True}],
    'blocks': {
        'open': [{'w': 'begin', 'breakAfter': True}, {'w': 'try', 'breakAfter': True}, {'w': 'asm'},
                 {'w': 'repeat', 'breakAfter': True},
                 {'w': 'case', 'until': ['of']},
                 {'w': 'record', 'before': r'(=|:)\s*(packed\s+)?$'},
                 {'w': 'class', 'before': r'=\s*$', 'when': r'^(?!\s*;)(?!\s+of\b)'},
                 {'w': 'interface', 'before': r'=\s*$', 'when': r'^(?!\s*;)'},
                 {'w': 'object', 'before': r'=\s*$'},
                 # sections: their lines one step in, until the next section or begin
                 {'w': 'var', 'before': r'^\s*$', 'when': r'^\s*$', 'closes': False, 'endsBefore': _sections},
                 {'w': 'const', 'before': r'^\s*$', 'when': r'^\s*$', 'closes': False, 'endsBefore': _sections},
                 {'w': 'type', 'before': r'^\s*$', 'when': r'^\s*$', 'closes': False, 'endsBefore': _sections},
                 {'w': 'uses', 'before': r'^\s*$', 'closes': False, 'endsAfter': [';']},
                 # one statement after then / do / else (a begin on the next line replaces it)
                 {'w': 'if', 'kind': 'single', 'closes': False, 'until': ['then'], 'body': 'single', 'endsBefore': ['else']},
                 {'w': 'while', 'kind': 'single', 'closes': False, 'until': ['do'], 'body': 'single'},
                 {'w': 'for', 'kind': 'single', 'closes': False, 'until': ['do'], 'body': 'single'},
                 {'w': 'with', 'kind': 'single', 'closes': False, 'until': ['do'], 'body': 'single'},
                 {'w': 'on', 'kind': 'single', 'closes': False, 'until': ['do'], 'body': 'single', 'inside': ['try']},
                 {'w': 'else', 'kind': 'single', 'closes': False, 'when': r'^\s*(//.*)?$'}],
        'middle': [{'w': 'except', 'of': ['try'], 'breakAfter': True}, {'w': 'finally', 'of': ['try'], 'breakAfter': True},
                   {'w': 'else', 'of': ['case'], 'breakAfter': True},
                   {'w': 'private', 'of': ['class', 'object'], 'lineStart': True},
                   {'w': 'protected', 'of': ['class', 'object'], 'lineStart': True},
                   {'w': 'public', 'of': ['class', 'object'], 'lineStart': True},
                   {'w': 'published', 'of': ['class', 'object'], 'lineStart': True},
                   {'w': 'strict private', 'of': ['class', 'object'], 'lineStart': True}],
        'close': {'end': ['begin', 'try', 'asm', 'case', 'record', 'class', 'interface', 'object'], 'until': 'repeat'},
    },
    'singleBody': ['begin'],
    'freeClosers': [r'end\.'],                         # the end. of a unit or program has no opener
    'ends': [';'],
    'operators': ['and', 'or', 'xor', 'and not', 'or not'],
    'compare': ['<>', '<=', '>=', '=', '<', '>', 'in', 'is'],
    'align': [':='],
    'style': {'open': 'same', 'close': 'same', 'base': 'line', 'align': 'off', 'afterClose': 'same', 'operator': 'start',
              'oneLine': 'keep', 'parenSpace': 'off'},
}

# ---------------------------------------------------------------- Visual Basic, VBScript
_mods = r'^\s*((Public|Private|Friend|Protected|Shared|Overrides|Overridable|NotOverridable|Overloads|Static|Default|ReadOnly|WriteOnly|Partial|Async|Iterator|Shadows|Widening|Narrowing)\s+)*$'
VB = {
    'case': False, 
    'word': r'[A-Za-z_][A-Za-z0-9_]*[%&@!#$]?',
    'comments': {'line': ["'", 'REM ', 'Rem ', 'rem ']},
    'strings': [{'open': '"', 'double': True}],
    'groups': [{'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word', 'tight': True},
               {'pair': ['{', '}'], 'open': 'same', 'close': 'same', 'base': 'word'}],
    'blocks': {
        'open': [{'w': 'If', 'when': r"\bThen\s*('.*)?$", 'until': ['Then']},
                 {'w': 'Select Case'},
                 {'w': 'Case', 'before': r'^\s*$', 'inside': ['select case'], 'closes': False,
                  'endsBefore': ['Case', 'End Select']},
                 {'w': 'For', 'before': r'^\s*$'}, {'w': 'Do', 'before': r'^\s*$'}, {'w': 'While', 'before': r'^\s*$'},
                 {'w': 'With', 'before': r'^\s*$'}, {'w': 'Try', 'before': r'^\s*$'}, {'w': 'Using', 'before': r'^\s*$'},
                 {'w': 'SyncLock', 'before': r'^\s*$'}] +
                [{'w': w, 'before': _mods, 'notInside': ['interface']} for w in
                 ('Sub', 'Function', 'Property', 'Operator', 'Event')] +
                [{'w': w, 'before': r'^\s*$', 'when': r'^\s*(\(|$)', 'inside': ['property']} for w in ('Get', 'Set')] +
                [{'w': w, 'before': _mods} for w in ('Class', 'Module', 'Structure', 'Namespace', 'Interface', 'Enum')],
        'middle': [{'w': 'ElseIf', 'of': ['if'], 'until': ['Then']}, {'w': 'Else', 'of': ['if']},
                   {'w': 'Catch', 'of': ['try']}, {'w': 'Finally', 'of': ['try']}],
        'close': {'End If': 'If', 'End Select': 'Select Case', 'Next': 'For', 'Loop': 'Do', 'Wend': 'While',
                  'End While': 'While', 'End With': 'With', 'End Try': 'Try', 'End Using': 'Using',
                  'End SyncLock': 'SyncLock', 'End Sub': 'Sub', 'End Function': 'Function', 'End Property': 'Property',
                  'End Get': 'Get', 'End Set': 'Set', 'End Operator': 'Operator', 'End Event': 'Event',
                  'End Class': 'Class', 'End Module': 'Module', 'End Structure': 'Structure',
                  'End Namespace': 'Namespace', 'End Interface': 'Interface', 'End Enum': 'Enum'},
    },
    'ends': ['\n', ':'],
    'continueAfter': r'\s_\s*$',
    'operators': ['AndAlso', 'OrElse', 'And Not', 'Or Not', 'And', 'Or', 'Xor'],
    'compare': ['<>', '<=', '>=', '=', '<', '>', 'Is', 'IsNot', 'Like'],
    'align': ['='],
    'style': {'open': 'same', 'close': 'same', 'base': 'line', 'align': 'off', 'afterClose': 'same', 'operator': 'start',
              'oneLine': 'keep', 'parenSpace': 'off'},
}
VBSCRIPT = copy.deepcopy(VB)
VBSCRIPT['blocks']['open'] = [o for o in VBSCRIPT['blocks']['open']
                              if o['w'] not in ('Try', 'Using', 'SyncLock', 'Operator', 'Event', 'Module', 'Structure',
                                                'Namespace', 'Interface', 'Enum')]
VBSCRIPT['blocks']['middle'] = [m for m in VBSCRIPT['blocks']['middle'] if m['w'] not in ('Catch', 'Finally')]

# ---------------------------------------------------------------- PowerShell
POWERSHELL = kr(case=False, word=r'[A-Za-z_$@-][A-Za-z0-9_:$-]*', keepLines=[],
                comments={'line': ['#'], 'block': [['<#', '#>']]},
                strings=[{'open': '@"', 'close': '"@', 'lines': True}, {'open': "@'", 'close': "'@", 'lines': True},
                         {'open': '"', 'escape': '`', 'lines': True}, {'open': "'", 'double': True, 'lines': True}],
                operators=['-and', '-or', '-xor'], compare=['-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-like', '-match'],
                ends=[';', '\n'], continueAfter=r'(`|\|)\s*$', **{'continue': ['|']})
POWERSHELL['groups'] += [{'pair': ['@(', ')'], 'open': 'same', 'close': 'same', 'base': 'word'},
                         {'pair': ['$(', ')'], 'open': 'same', 'close': 'same', 'base': 'word'},
                         {'pair': ['@{', '}'], 'open': 'next', 'close': 'own', 'base': 'line', 'block': True}]
POWERSHELL['blocks']['open'] = []                  # braces are required: no one-statement bodies
POWERSHELL['joinAfterClose'] = ['else', 'elseif', 'catch', 'finally', 'until', 'while']

# ---------------------------------------------------------------- PHP (PSR-12: braces of classes and functions on their own line)
PHP = kr(word=r'[A-Za-z_$][A-Za-z0-9_]*', keepLines=[], comments={'line': ['//', '#'], 'block': [['/*', '*/']]},
         strings=[{'open': '"', 'escape': BS, 'lines': True}, {'open': "'", 'escape': BS, 'lines': True}],
         keep=[r'<<<\s*([A-Za-z_]+).*?^\s*\1\b'], compare=['===', '!==', '==', '!=', '<=', '>=', '<', '>'],
         operators=['&&', '||', 'and', 'or', 'xor'])
PHP['groups'][0] = dict(PHP['groups'][0], openAt={'default': 'same',
    'next': r'^((abstract|final|public|private|protected|static|readonly)\s+)*(class|interface|trait|enum|function)\b'})
PHP['blocks']['open'] = [o for o in PHP['blocks']['open'] if o['w'] not in ('using', 'lock', 'fixed')]
PHP['joinAfterClose'] = ['else', 'elseif', 'catch', 'finally', 'while']

# ---------------------------------------------------------------- Perl
PERL = kr(word=r'[A-Za-z_$@%][A-Za-z0-9_:]*', keepLines=[], comments={'line': ['#']},
          strings=[{'open': '"', 'escape': BS, 'lines': True}, {'open': "'", 'escape': BS, 'lines': True}],
          keep=[r'^=[a-zA-Z].*?^=cut\b.*?$', r'<<"?([A-Z_]+)"?;.*?^\1$',
                {'re': r'(?:m|qr|s|tr|y)?/(?:\\.|[^/\\\n])*/(?:(?:\\.|[^/\\\n])*/)?[a-z]*', 'after': '(,=~!{;'},
                r'q[qwr]?\((?:\\.|[^)\\])*\)'],
          operators=['&&', '||', 'and', 'or', 'not'], compare=['==', '!=', 'eq', 'ne', 'lt', 'gt', 'le', 'ge', '=~'])
PERL['blocks']['open'] = []

# ---------------------------------------------------------------- Ruby
_rstart = r'(^\s*|=\s*|\(\s*)$'     # a statement start, or a value: x = if ...
RUBY = {
    'case': True, 
    'word': r'[A-Za-z_@$][A-Za-z0-9_]*[?!]?',
    'comments': {'line': ['#']},
    'strings': [{'open': '"', 'escape': BS, 'lines': True}, {'open': "'", 'escape': BS, 'lines': True}],
    'keep': [r'^=begin\b.*?^=end\b.*?$', r'<<[~-]?([A-Z_]+).*?^\s*\1$'],
    'groups': [{'pair': ['{', '}'], 'open': 'same', 'close': 'same', 'base': 'line', 'block': True},
               {'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word', 'tight': True},
               {'pair': ['[', ']'], 'open': 'same', 'close': 'same', 'base': 'line'}],
    'blocks': {
        'open': [{'w': w, 'before': _rstart} for w in ('if', 'unless', 'while', 'until', 'case', 'for')] +
                [{'w': w, 'before': r'^\s*((private|protected|public)\s+)?$'} for w in ('def', 'class', 'module')] +
                [{'w': 'begin', 'before': _rstart},
                 {'w': 'do', 'before': r'^(?!\s*(while|until|for)\b)'}],
        'middle': [{'w': 'elsif', 'of': ['if', 'unless']}, {'w': 'else', 'of': ['if', 'unless', 'case', 'begin']},
                   {'w': 'when', 'of': ['case']}, {'w': 'in', 'of': ['case'], 'lineStart': True},
                   {'w': 'rescue', 'of': ['begin', 'def', 'do']}, {'w': 'ensure', 'of': ['begin', 'def', 'do']}],
        'close': {'end': None},
    },
    'ends': [';', '\n'],
    'operators': ['&&', '||', 'and', 'or'],
    'compare': ['==', '!=', '<=', '>=', '<', '>', '=~'],
    'align': ['='],
    'continue': ['.', '&.'],
    'style': {'open': 'same', 'close': 'same', 'base': 'line', 'align': 'off', 'afterClose': 'same', 'operator': 'start',
              'oneLine': 'keep', 'parenSpace': 'off'},
}

# ---------------------------------------------------------------- shell (bash, sh)
SHELL = {
    'case': True, 
    'word': r'[A-Za-z0-9_./$-]+',
    'comments': {'line': [' #']},
    'strings': [{'open': '"', 'escape': BS, 'lines': True}, {'open': "'", 'lines': True}],
    'keep': [r'<<-?\s*[\'"]?([A-Za-z_]+)[\'"]?.*?^\t*\1$', r'\$\{[^}]*\}', r'\$\(\(.*?\)\)'],
    'groups': [{'pair': ['{', '}'], 'open': 'next', 'close': 'own', 'base': 'line', 'block': True},
               {'pair': ['$(', ')'], 'open': 'same', 'close': 'same', 'base': 'line'},
               {'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word'},
               {'pair': ['[[', ']]'], 'open': 'same', 'close': 'same', 'base': 'word'}],
    'blocks': {
        'open': [{'w': 'if', 'until': ['then']}, {'w': 'while', 'until': ['do']}, {'w': 'until', 'until': ['do']},
                 {'w': 'for', 'until': ['do']}, {'w': 'select', 'until': ['do']}, {'w': 'case', 'until': ['in']},
                 # a pattern of a case: its commands one step in, until ;; or the next pattern
                 {'w': 'pattern', 'line': r'^[^\s()]+(\s*\|\s*[^\s()]+)*\)', 'inside': ['case'], 'closes': False,
                  'endsAfter': [';;'], 'endsBefore': ['esac']}],
        'middle': [{'w': 'elif', 'of': ['if'], 'until': ['then']}, {'w': 'else', 'of': ['if']}],
        'close': {'fi': 'if', 'done': ['while', 'until', 'for', 'select'], 'esac': 'case'},
    },
    'signs': [';;', '&&', '||'],
    'freeClosers': [r'^\s*[^\s()]+(\s*\|\s*[^\s()]+)*\)'],   # the ) of a case pattern has no (
    'ends': [';', '\n'],
    'continueAfter': r'(\\|\||&&)\s*$',
    'style': {'open': 'same', 'close': 'same', 'base': 'line', 'align': 'off', 'afterClose': 'same', 'operator': 'end',
              'oneLine': 'keep', 'parenSpace': 'off'},
}

# ---------------------------------------------------------------- batch
BATCH = {
    'case': False, 
    'word': r'[A-Za-z0-9_%!.:\\-]+',
    'comments': {'line': ['::', 'rem ', 'REM ', 'Rem ', '@rem ', '@REM ']},
    'strings': [{'open': '"'}],
    'groups': [{'pair': ['(', ')'], 'open': 'next', 'close': 'own', 'base': 'line', 'afterClose': 'same', 'block': True}],
    'keepLines': [r'^\s*:[A-Za-z_]'],                     # labels at the start of the line
    'ends': ['\n', '&'],
    'style': {'open': 'next', 'close': 'own', 'base': 'line', 'align': 'off', 'afterClose': 'same', 'oneLine': 'keep'},
}

# ---------------------------------------------------------------- AutoHotkey (v1 and v2)
AHK = clike(case=False, word=r'[A-Za-z_#@$][A-Za-z0-9_#@$]*', keepLines=[],
            comments={'line': [' ;'], 'block': [['/*', '*/']]},
            strings=[{'open': '"', 'double': True, 'escape': '`'}, {'open': "'", 'escape': '`'}],
            ends=['\n'], operators=['&&', '||', 'and', 'or'])
AHK['groups'][0] = dict(AHK['groups'][0], openAt='keep')
AHK['blocks']['open'] = [
    # one statement after if / else / loop / while without a brace
    {'w': w, 'kind': 'single', 'closes': False, 'when': r'^(?!.*\{\s*(;.*)?$)'} for w in ('if', 'while', 'for', 'loop')] + [
    {'w': 'else', 'kind': 'single', 'closes': False, 'when': r'^\s*(;.*)?$'},
    # a hotkey or a label with its commands below, up to its return
    {'w': 'section', 'line': r'^(\S.*::\s*(;.*)?$|[\w#@$]+:\s*(;.*)?$)', 'closes': True}]
AHK['blocks']['close'] = {'return': {'of': 'section', 'strict': True}}

# ---------------------------------------------------------------- generic SQL (ANSI, PL/SQL, PostgreSQL): ASA's set
SQL = copy.deepcopy(ASA)
SQL['statements'].update({'merge': ['using', 'on', 'when'], 'with': ['select']})

# ---------------------------------------------------------------- Python: the indentation is the structure
PYTHON = {
    'case': True, 'keepIndent': True,
    'word': r'[A-Za-z_][A-Za-z0-9_]*',
    'comments': {'line': ['#']},
    'strings': [{'open': '"""', 'lines': True, 'escape': BS}, {'open': "'''", 'lines': True, 'escape': BS},
                {'open': '"', 'escape': BS}, {'open': "'", 'escape': BS}],
    'groups': [{'pair': ['(', ')'], 'open': 'same', 'close': 'same', 'base': 'word'},
               {'pair': ['[', ']'], 'open': 'same', 'close': 'same', 'base': 'word'},
               {'pair': ['{', '}'], 'open': 'same', 'close': 'same', 'base': 'word'}],
    'operators': ['and', 'or', 'and not', 'or not'],
    'compare': ['==', '!=', '<=', '>=', '<', '>', 'is not', 'not in', 'is', 'in'],
    'align': ['='],
    'style': {'open': 'same', 'close': 'same', 'base': 'word', 'align': 'off', 'afterClose': 'same', 'operator': 'start',
              'oneLine': 'keep', 'parenSpace': 'off'},
}

# ---------------------------------------------------------------- Markdown: only its tables; the rest as written
MARKDOWN = {
    'case': True, 'keepIndent': True,
    'word': r'[^\s|`\\]+',
    'strings': [{'open': '`'}],                          # a code span: a | inside it is no separator
    'keep': [r'\\.', r'^(```|~~~).*?^\1\s*$'],          # an escaped \| ; fenced code (by its own language)
    'tables': {'sep': '|', 'fill': '-', 'delimiter': r'^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$'},
    'style': {'align': 'on', 'oneLine': 'keep'},
}
