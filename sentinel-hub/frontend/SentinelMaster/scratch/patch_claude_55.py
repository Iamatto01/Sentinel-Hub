import subprocess

node_script = """
const fs = require('fs');

// 1. Patch /app/.build/next/server/chunks/_18upejl._.js
const chunkPath = '/app/.build/next/server/chunks/_18upejl._.js';
if (fs.existsSync(chunkPath)) {
    let content = fs.readFileSync(chunkPath, 'utf8');
    
    // Check if claude-sonnet-5.5 already present
    if (!content.includes('"claude-sonnet-5.5"')) {
        console.log("Patching _18upejl._.js with Claude 5.5 models & aliases...");
        
        // Add to public models array
        const targetModel = '{id:"claude-sonnet-4-6",name:"Claude Sonnet 4.6 (Thinking)",contextLength:1048576,maxOutputTokens:65536,supportsReasoning:!0,supportsVision:!0,toolCalling:!0}';
        const newModels = '{id:"claude-sonnet-5.5",name:"Claude Sonnet 5.5",contextLength:1048576,maxOutputTokens:65536,supportsReasoning:!0,supportsVision:!0,toolCalling:!0},{id:"claude-opus-5.5",name:"Claude Opus 5.5",contextLength:1048576,maxOutputTokens:65536,supportsReasoning:!0,supportsVision:!0,toolCalling:!0},' + targetModel;
        
        content = content.replaceAll(targetModel, newModels);
        
        // Add to alias map
        const targetAlias = '"gemini-claude-opus-4-5-thinking":"claude-opus-4-6-thinking"';
        const newAliases = '"gemini-claude-opus-4-5-thinking":"claude-opus-4-6-thinking","claude-sonnet-5-5":"claude-sonnet-5.5","claude-opus-5-5":"claude-opus-5.5","claude-3-7-sonnet":"claude-sonnet-5.5","claude-sonnet-4-6":"claude-sonnet-5.5","claude-opus-4-6-thinking":"claude-opus-5.5"';
        
        content = content.replaceAll(targetAlias, newAliases);
        
        fs.writeFileSync(chunkPath, content, 'utf8');
        console.log("Successfully patched _18upejl._.js!");
    } else {
        console.log("Claude 5.5 already present in _18upejl._.js");
    }
} else {
    console.log("Chunk _18upejl._.js not found!");
}

// 2. Patch /app/open-sse/config/antigravityModelAliases.ts
const tsAliases = '/app/open-sse/config/antigravityModelAliases.ts';
if (fs.existsSync(tsAliases)) {
    let content = fs.readFileSync(tsAliases, 'utf8');
    if (!content.includes('"claude-sonnet-5.5"')) {
        console.log("Patching antigravityModelAliases.ts...");
        const targetModel = '  {\\n    id: "claude-sonnet-4-6",';
        const newModels = `  {
    id: "claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true,
  },
  {
    id: "claude-opus-5.5",
    name: "Claude Opus 5.5",
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsVision: true,
    toolCalling: true,
  },
  {
    id: "claude-sonnet-4-6",`;
        content = content.replace(targetModel, newModels);
        
        const targetAlias = '  "gemini-claude-opus-4-5-thinking": "claude-opus-4-6-thinking",';
        const newAliases = `  "gemini-claude-opus-4-5-thinking": "claude-opus-4-6-thinking",
  "claude-sonnet-5-5": "claude-sonnet-5.5",
  "claude-opus-5-5": "claude-opus-5.5",
  "claude-3-7-sonnet": "claude-sonnet-5.5",
  "claude-sonnet-4-6": "claude-sonnet-5.5",
  "claude-opus-4-6-thinking": "claude-opus-5.5",`;
        content = content.replace(targetAlias, newAliases);
        fs.writeFileSync(tsAliases, content, 'utf8');
        console.log("Successfully patched antigravityModelAliases.ts!");
    }
}
"""

p1 = subprocess.run(['ssh', 'qexec', 'cat > /tmp/patch_claude_55.js'], input=node_script, text=True, capture_output=True)
print("Create /tmp/patch_claude_55.js:", p1.returncode)

run_cmd = "docker cp /tmp/patch_claude_55.js 9router:/tmp/patch_claude_55.js && docker exec 9router node /tmp/patch_claude_55.js"
p2 = subprocess.run(['ssh', 'qexec', run_cmd], capture_output=True, text=True)
print("OUT:\n" + p2.stdout)
if p2.stderr:
    print("ERR:\n" + p2.stderr)
