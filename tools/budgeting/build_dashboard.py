#!/usr/bin/env python3
"""Stage 2 (dashboard): inject model_data_v2.json into dashboard_template.html -> dashboard.html"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
model = json.load(open(os.path.join(HERE, "model_data_v2.json")))
# Ten years of revenue history, kept as its own file because it comes from the Q2 & Q3 Push board
# rather than the Xero exports the model is built from (see its "source" and "basis" fields).
hist_path = os.path.join(HERE, "revenue_history.json")
if os.path.exists(hist_path):
    model["history"] = json.load(open(hist_path))
# The Q2 & Q3 Push board's pacing for the cycle now closing — its baseline pace and the live month
# it is tracking — so the bridge month can follow the board instead of the sales plan.
board_path = os.path.join(HERE, "board_pacing.json")
if os.path.exists(board_path):
    model["board"] = json.load(open(board_path))
tpl = open(os.path.join(HERE, "dashboard_template.html")).read()
payload = json.dumps(model, separators=(",", ":")).replace("</", "<\\/")
out = tpl.replace("/*__MODEL__*/", payload, 1)
assert "/*__MODEL__*/" not in out and payload[:40] in out
open(os.path.join(HERE, "dashboard.html"), "w").write(out)
print("dashboard.html:", os.path.getsize(os.path.join(HERE, "dashboard.html")) // 1024, "KB")
