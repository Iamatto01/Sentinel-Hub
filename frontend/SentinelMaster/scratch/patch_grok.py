import subprocess

node_script = """const fs = require('fs');

const targetFiles = [
    '/app/open-sse/config/grokBuild.ts',
    '/app/.build/next/server/chunks/open-sse_1doxqww._.js'
];

targetFiles.forEach(p => {
    if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        if (content.includes('0.2.106')) {
            console.log(`Found 0.2.106 in ${p}, patching to 1.0.13...`);
            content = content.replaceAll('0.2.106', '1.0.13');
            fs.writeFileSync(p, content, 'utf8');
            console.log(`Successfully patched ${p}!`);
        } else {
            console.log(`0.2.106 not found in ${p}`);
        }
    } else {
        console.log(`File ${p} does not exist`);
    }
});
"""

p1 = subprocess.run(['ssh', 'qexec', 'cat > /tmp/patch_grok.js'], input=node_script, text=True, capture_output=True)
print("Create /tmp/patch_grok.js:", p1.returncode)

run_cmd = "docker cp /tmp/patch_grok.js 9router:/tmp/patch_grok.js && docker exec 9router node /tmp/patch_grok.js"
p2 = subprocess.run(['ssh', 'qexec', run_cmd], capture_output=True, text=True)
print("OUT:\n" + p2.stdout)
if p2.stderr:
    print("ERR:\n" + p2.stderr)
