#!/usr/bin/env python3
"""Stage 2 (dashboard): inject model_data_v2.json into dashboard_template.html -> dashboard.html"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
model = json.load(open(os.path.join(HERE, "model_data_v2.json")))
tpl = open(os.path.join(HERE, "dashboard_template.html")).read()
payload = json.dumps(model, separators=(",", ":")).replace("</", "<\\/")
out = tpl.replace("/*__MODEL__*/", payload, 1)
assert "/*__MODEL__*/" not in out and payload[:40] in out
open(os.path.join(HERE, "dashboard.html"), "w").write(out)
print("dashboard.html:", os.path.getsize(os.path.join(HERE, "dashboard.html")) // 1024, "KB")
