import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("C:/Users/muham/.gemini/antigravity/brain/5df2a85b-939b-4b6b-83b1-856d7931482b/.system_generated/logs/transcript.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        obj = json.loads(line)
        idx = obj.get('step_index', 0)
        if idx >= 430:
            print(f"STEP {idx} [{obj.get('type')}]: {str(obj.get('content'))[:200]}")
            if obj.get('tool_calls'):
                for tc in obj.get('tool_calls'):
                    print(f"  TOOL: {tc.get('name')}")
