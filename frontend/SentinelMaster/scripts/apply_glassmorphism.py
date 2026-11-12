import os

glassmorphism_css = """
/* Glassmorphism Overrides */
.sentinel-surface, .feature-card, .card, .panel, .bg-charcoal, [class*="card"], [class*="panel"] {
    background: rgba(14, 20, 34, 0.55) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}

.nav-bar, .navbar, .topbar, nav, [class*="nav"] {
    background: rgba(5, 7, 13, 0.75) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
}

.sidebar, aside {
    background: rgba(10, 14, 24, 0.7) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
}

.modal, .popup, dialog {
    background: rgba(14, 20, 34, 0.85) !important;
    backdrop-filter: blur(24px) !important;
    -webkit-backdrop-filter: blur(24px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.btn-primary, button.primary, [class*="btn-primary"], [class*="bg-blue-"], [class*="bg-brand"] {
    background: rgba(79, 140, 255, 0.2) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border: 1px solid rgba(79, 140, 255, 0.3) !important;
}

.btn-primary:hover, button.primary:hover, .feature-card:hover, .card:hover, [class*="btn-primary"]:hover {
    border-color: rgba(79, 140, 255, 0.4) !important;
    box-shadow: 0 0 20px rgba(79, 140, 255, 0.15) !important;
}

input, textarea, select, .input-field, [class*="input"] {
    background: rgba(5, 7, 13, 0.6) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
}
"""

def append_css(file_path):
    if not os.path.exists(file_path):
        print(f"CSS file not found: {file_path}")
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'Glassmorphism Overrides' in content:
        print(f"Already applied to {file_path}")
        return
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(glassmorphism_css)
    print(f"Applied glassmorphism to {file_path}")

def fix_favicon(html_path):
    if not os.path.exists(html_path):
        print(f"HTML file not found: {html_path}")
        return
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We will replace any link rel="icon" with the brand favicon link.
    import re
    # Simple regex to replace existing favicon or insert one
    new_favicon = '<link rel="icon" type="image/svg+xml" href="/Sentinel-Brand/favicon.svg">'
    
    if '<link rel="icon"' in content or '<link rel="shortcut icon"' in content:
        content = re.sub(r'<link[^>]*rel="(?:shortcut )?icon"[^>]*>', new_favicon, content)
    else:
        # insert before </head>
        content = content.replace('</head>', f'    {new_favicon}\n</head>')
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed favicon in {html_path}")

# 1. SentinelMedia
append_css(r"f:\INI KALI LA\SentinelMedia\sentinel.css")
for html in ['index.html', 'video-analyzer.html', 'audio-analyzer.html', 'file-analyzer.html', 'live-detection.html']:
    fix_favicon(os.path.join(r"f:\INI KALI LA\SentinelMedia", html))

# 2. SentinelThreat
append_css(r"f:\INI KALI LA\SentinelThreat\sentinel.css")
append_css(r"f:\INI KALI LA\SentinelThreat\resources\custom.css")
fix_favicon(r"f:\INI KALI LA\SentinelThreat\index.html")

# 3. SentinelFashion
append_css(r"f:\INI KALI LA\SentinelFashion\src\index.css")
fix_favicon(r"f:\INI KALI LA\SentinelFashion\index.html")

# 4. SentinelQuran
append_css(r"f:\INI KALI LA\SentinelQuran\sentinel.css")
fix_favicon(r"f:\INI KALI LA\SentinelQuran\index.html")

# 5. SentinelFame
import glob
for css_file in glob.glob(r"f:\INI KALI LA\SentinelFame\public\css\*.css"):
    append_css(css_file)
fix_favicon(r"f:\INI KALI LA\SentinelFame\public\index.html")

# 6. SentinelRFQ
for root, dirs, files in os.walk(r"f:\INI KALI LA\SentinelRFQ"):
    if "TIJARAH MABRUR LATEST" in root or "WEBSITE SAIF" in root:
        for file in files:
            if file.endswith('.css'):
                append_css(os.path.join(root, file))
            if file.endswith('.html'):
                fix_favicon(os.path.join(root, file))

print("Done")
