"""
Synchronize official Sentinel brand logo and favicon across all projects in F:\\INI KALI LA
"""
import os
import shutil
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = r"F:\INI KALI LA"
BRAND_DIR = os.path.join(ROOT_DIR, "Sentinel-Brand")
FYP_DIR = r"F:\FYP2PROJECT"

# Core assets to distribute
FAVICON_SVG = os.path.join(BRAND_DIR, "favicon.svg")
FAVICON_ICO = os.path.join(BRAND_DIR, "favicon.ico")
LOGO_SVG = os.path.join(BRAND_DIR, "logo-base.svg")
LOGO_CYBER = os.path.join(BRAND_DIR, "logo-cyber.svg")
LOGO_PNG = os.path.join(BRAND_DIR, "logo-base-512.png")

def sync_brand():
    print("[*] Starting Sentinel Ecosystem Brand Synchronization...")
    print(f"    Source Brand Directory: {BRAND_DIR}")
    
    updated_count = 0
    all_dirs = [os.path.join(ROOT_DIR, d) for d in os.listdir(ROOT_DIR) if os.path.isdir(os.path.join(ROOT_DIR, d))]
    if os.path.exists(FYP_DIR) and FYP_DIR not in all_dirs:
        all_dirs.append(FYP_DIR)

    for project_path in all_dirs:
        proj_name = os.path.basename(project_path)
        if proj_name in [".git", "Sentinel-Brand", "_build"]:
            continue
            
        # Target search locations for favicons
        target_locations = [
            project_path,
            os.path.join(project_path, "public"),
            os.path.join(project_path, "static"),
            os.path.join(project_path, "frontend", "public"),
            os.path.join(project_path, "web", "public"),
            os.path.join(project_path, "client", "public"),
            os.path.join(project_path, "dist"),
            os.path.join(project_path, "catalogue"),
            os.path.join(project_path, "admin"),
            os.path.join(project_path, "apps")
        ]

        synced_in_proj = False
        for loc in target_locations:
            if not os.path.exists(loc):
                continue
                
            # If location already has a favicon, update it
            fav_svg_path = os.path.join(loc, "favicon.svg")
            fav_ico_path = os.path.join(loc, "favicon.ico")
            index_path = os.path.join(loc, "index.html")
            has_index = os.path.exists(index_path)
            
            if os.path.exists(fav_svg_path) or os.path.basename(loc) in ["public", "catalogue", "admin", "apps"] or (loc == project_path and has_index):
                shutil.copy2(FAVICON_SVG, fav_svg_path)
                shutil.copy2(FAVICON_ICO, fav_ico_path)
                shutil.copy2(LOGO_SVG, os.path.join(loc, "logo.svg"))
                shutil.copy2(LOGO_PNG, os.path.join(loc, "logo.png"))
                shutil.copy2(LOGO_CYBER, os.path.join(loc, "logo-cyber.svg"))
                
                if has_index:
                    import re
                    try:
                        with open(index_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        # Fix up existing icon tags
                        content = re.sub(r'<link[^>]*rel=["\']icon["\'][^>]*>', 
                                         '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />', content)
                        content = re.sub(r'<link[^>]*rel=["\']shortcut icon["\'][^>]*>', 
                                         '<link rel="shortcut icon" href="/favicon.ico" />', content)
                                         
                        with open(index_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                    except Exception as e:
                        print(f"    [-] Failed to update {index_path}: {e}")
                
                synced_in_proj = True
                print(f"    [✓] Synced brand assets to {os.path.relpath(loc, ROOT_DIR)}")

        if synced_in_proj:
            updated_count += 1

    print("\n" + "=" * 60)
    print(f"  [✓] Successfully synchronized brand assets across {updated_count} projects!")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    sync_brand()
