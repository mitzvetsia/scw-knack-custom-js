#!/usr/bin/env python3
"""Build a data-preloaded copy of the COGS workbench.

Usage:
  python3 tools/make-preloaded.py OUTPUT.html INPUT1.csv INPUT2.csv [... .xlsx ...] [--note "toast text"]

Embeds each input file into a <script id="scw-preload"> block inside
tools/cogs-monthly.html. The resulting single HTML file opens with all data
already loaded — same parsers, same UI, nothing to drop. Text files are
embedded as text; .xlsx (or any binary) as base64.
"""
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, 'cogs-monthly.html')


def main():
    args = sys.argv[1:]
    note = ''
    if '--note' in args:
        i = args.index('--note')
        note = args[i + 1]
        del args[i:i + 2]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    out, inputs = args[0], args[1:]

    files = []
    for path in inputs:
        name = os.path.basename(path)
        with open(path, 'rb') as f:
            data = f.read()
        if data[:2] == b'PK' or name.lower().endswith('.xlsx'):
            files.append({'name': name, 'b64': base64.b64encode(data).decode('ascii')})
        else:
            files.append({'name': name, 'text': data.decode('utf-8-sig')})
        print(f'  embedded {name} ({len(data):,} bytes)')

    payload = json.dumps({'files': files, 'note': note or 'Data preloaded — ' +
                          ', '.join(f['name'] for f in files)[:120]})
    payload = payload.replace('</', '<\\/')

    html = open(TOOL, encoding='utf-8').read()
    block = '<script type="application/json" id="scw-preload">' + payload + '</script>\n</body>'
    # anchor on the LAST </body> — the string also appears inside the audit
    # builder's JS template, and injecting there corrupts the script
    pos = html.rfind('</body>')
    if pos < 0:
        sys.exit('tool HTML has no </body>')
    html = html[:pos] + block + html[pos + len('</body>'):]
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'wrote {out} ({os.path.getsize(out):,} bytes)')


if __name__ == '__main__':
    main()
