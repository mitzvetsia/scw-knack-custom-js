import json, sys
keys = json.load(open('/tmp/claude-0/-home-user-scw-knack-custom-js/bd55fbba-82cd-533c-a1c8-a1747e141bd9/scratchpad/work/keys.json'))
kind = sys.argv[1]; n = int(sys.argv[2])
vals = keys[kind]
vals = list(dict.fromkeys(vals))
chunk = vals[(n-1)*100:n*100]
print(",".join("'" + v.replace("'", "''") + "'" for v in chunk))
