import subprocess

script = """
const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(full));
        } else if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.ts')) {
            results.push(full);
        }
    });
    return results;
}

const files = walk('/app/.build/next/server');
let patchedCount = 0;
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    if (content.includes('0.2.106')) {
        content = content.replaceAll('0.2.106', '1.0.13');
        fs.writeFileSync(f, content, 'utf8');
        console.log(`Patched: ${f}`);
        patchedCount++;
    }
});
console.log(`Total files patched: ${patchedCount}`);
"""

p1 = subprocess.run(['ssh', 'qexec', 'cat > /tmp/patch_all_chunks.js'], input=script, text=True, capture_output=True)
print("Saved /tmp/patch_all_chunks.js:", p1.returncode)

run_cmd = "docker cp /tmp/patch_all_chunks.js 9router:/tmp/patch_all_chunks.js && docker exec 9router node /tmp/patch_all_chunks.js"
p2 = subprocess.run(['ssh', 'qexec', run_cmd], capture_output=True, text=True)
print("OUT:\n" + p2.stdout)
if p2.stderr:
    print("ERR:\n" + p2.stderr)
