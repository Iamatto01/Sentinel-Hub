#!/usr/bin/env python3
"""
Sentinel 9Router -> VS Code Auto Sync Engine
Fetches all active models from 9Router and updates VS Code chatLanguageModels.json automatically.
Organizes models by tier and styles them with clean badges and emojis.
"""

import os
import sys
import json
import urllib.request
import re

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROUTER_URL = os.environ.get("HUB_ROUTER_PUBLIC_URL", "https://router.sentinelai.studio").rstrip("/") + "/v1"
API_KEY = os.environ.get("HUB_ROUTER_KEY", "").strip()
if not API_KEY:
    env_local = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
    if os.path.exists(env_local):
        with open(env_local, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("HUB_ROUTER_KEY="):
                    API_KEY = line.split("=", 1)[1].strip().strip('"\'')
                    break
if not API_KEY:
    sys.exit(
        "HUB_ROUTER_KEY is not set. Source it from Sentinel Master/.env.local, e.g.\n"
        '  $env:HUB_ROUTER_KEY = (Select-String -Path ".env.local" -Pattern "^HUB_ROUTER_KEY=").Line.Split("=",2)[1]'
    )
VSCODE_JSON = os.path.expandvars(r"%APPDATA%\Code\User\chatLanguageModels.json")

# Custom styling map for premium models
STYLE_MAP = {
    "auto": {
        "name": "👑 [AUTO-PILOT] Sentinel Supreme (Gemini 3.8 + Gemini 3.1 Pro)",
        "priority": 1,
        "vision": True,
        "maxIn": 1048576,
        "maxOut": 65536
    },
    "ag/gemini-3.8-flash-high": {
        "name": "⚡ [SPEED DEMON] Gemini 3.8 Flash High (1M Context)",
        "priority": 2,
        "vision": True,
        "maxIn": 1048576,
        "maxOut": 65536
    },
    "ag/gemini-pro-agent": {
        "name": "🚀 [ELITE AGENT] Gemini 3.1 Pro Agent (High Reasoning)",
        "priority": 3,
        "vision": True,
        "maxIn": 1048576,
        "maxOut": 65536
    },
    "ag/gemini-3.1-pro-low": {
        "name": "🔬 [ARCHITECT] Gemini 3.1 Pro (Heavy Logic)",
        "priority": 4,
        "vision": False,
        "maxIn": 1048576,
        "maxOut": 65536
    },
    "grok-cli/grok-4.6": {
        "name": "🛸 [GROK-2026] xAI Grok 4.6 (Active)",
        "priority": 5,
        "vision": True,
        "maxIn": 131072,
        "maxOut": 32768
    },
    "ag/gemini-3.7-flash-high": {
        "name": "💎 [PRECISION] Gemini 3.7 Flash High (Thinking)",
        "priority": 6,
        "vision": True,
        "maxIn": 1048576,
        "maxOut": 65536
    },
    "ag/claude-sonnet-4-6": {
        "name": "⚠️ [NOTICE] Claude Sonnet 4.6 (Upstream Deprecation Notice)",
        "priority": 90,
        "vision": True,
        "maxIn": 200000,
        "maxOut": 65536
    },
    "ag/claude-opus-4-6-thinking": {
        "name": "⚠️ [NOTICE] Claude Opus 4.6 (Upstream Deprecation Notice)",
        "priority": 91,
        "vision": True,
        "maxIn": 200000,
        "maxOut": 65536
    },
    "ag/gpt-oss-120b-medium": {
        "name": "🌐 [OPEN-SOURCE] GPT OSS 120B Medium",
        "priority": 7,
        "vision": False,
        "maxIn": 128000,
        "maxOut": 16000
    }
}

def sync():
    print("==================================================")
    print("   Sentinel 9Router -> VS Code Auto-Sync Engine   ")
    print("==================================================")
    print(f"[1/3] Fetching active models from {ROUTER_URL}/models...")
    
    req = urllib.request.Request(
        f"{ROUTER_URL}/models",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "User-Agent": "Mozilla/5.0 SentinelSync/2.0"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_models = data.get("data", [])
    except Exception as e:
        print(f"[Error] Failed to fetch models from 9Router: {e}")
        return

    print(f"      Found {len(raw_models)} active models in 9Router.")

    vscode_models = []
    
    # 1. Add Universal Smart Auto Model first
    vscode_models.append({
        "id": "auto",
        "name": STYLE_MAP["auto"]["name"],
        "url": f"{ROUTER_URL}/chat/completions",
        "toolCalling": True,
        "vision": True,
        "maxInputTokens": STYLE_MAP["auto"]["maxIn"],
        "maxOutputTokens": STYLE_MAP["auto"]["maxOut"],
        "_priority": STYLE_MAP["auto"]["priority"]
    })

    for m in raw_models:
        mid = m.get("id")
        mname = m.get("name") or mid
        
        if mid in STYLE_MAP:
            s = STYLE_MAP[mid]
            display_name = s["name"]
            is_vision = s["vision"]
            max_in = s["maxIn"]
            max_out = s["maxOut"]
            priority = s["priority"]
        else:
            clean_title = mname.replace("ag/", "").replace("-", " ").title()
            display_name = f"📦 {clean_title} ({mid})"
            is_vision = "vision" in mid.lower() or "flash" in mid.lower() or "sonnet" in mid.lower() or "opus" in mid.lower()
            max_in = 1048576 if "gemini" in mid.lower() else 200000 if "claude" in mid.lower() else 128000
            max_out = 65536 if ("gemini" in mid.lower() or "claude" in mid.lower()) else 16000
            priority = 50

        vscode_models.append({
            "id": mid,
            "name": display_name,
            "url": f"{ROUTER_URL}/chat/completions",
            "toolCalling": True,
            "vision": is_vision,
            "maxInputTokens": max_in,
            "maxOutputTokens": max_out,
            "_priority": priority
        })

    # Sort models by priority then by name
    vscode_models.sort(key=lambda x: (x["_priority"], x["name"]))
    for m in vscode_models:
        del m["_priority"]

    print(f"[2/3] Reading {VSCODE_JSON}...")
    if not os.path.exists(VSCODE_JSON):
        print(f"[Error] File not found: {VSCODE_JSON}")
        return

    # Fix potential trailing commas or typos before parsing
    with open(VSCODE_JSON, "r", encoding="utf-8") as f:
        content = f.read()

    # Clean stray ",hi" if present
    content = re.sub(r'",\s*hi\s*\n', '",\n', content)

    try:
        config = json.loads(content)
    except Exception as e:
        print(f"[Warning] Failed to parse JSON ({e}). Attempting regex recovery...")
        # fallback fix
        content = re.sub(r',\s*([\]}])', r'\1', content)
        config = json.loads(content)

    updated = False
    for provider in config:
        if provider.get("name") in ["Sentinel", "Sentinel (9Router)", "9Router"]:
            provider["name"] = "Sentinel (9Router)"
            provider["models"] = vscode_models
            updated = True
            break

    if not updated:
        config.append({
            "name": "Sentinel (9Router)",
            "vendor": "customendpoint",
            "apiKey": "${input:chat.lm.secret.-17b1f2b1}",
            "apiType": "chat-completions",
            "models": vscode_models
        })

    print(f"[3/3] Saving {len(vscode_models)} models into VS Code configuration...")
    with open(VSCODE_JSON, "w", encoding="utf-8") as f:
        json.dump(config, f, indent="\t", ensure_ascii=False)

    print("==================================================")
    print("SUCCESS! All models synced & styled in VS Code!")
    print("==================================================")
    for idx, m in enumerate(vscode_models[:8]):
        print(f" {idx+1}. {m['name']} -> {m['id']}")
    print(" ...")

if __name__ == "__main__":
    sync()
