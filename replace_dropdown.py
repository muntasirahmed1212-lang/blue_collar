import os
import glob

html_files = glob.glob('*.html')

desktop_search = """        <button class="theme-toggle" aria-label="Toggle theme" title="Toggle Theme">
          <i data-lucide="moon"></i>
        </button>"""

desktop_replace = """        <div class="theme-dropdown-container">
          <button class="theme-toggle" aria-label="Toggle theme" aria-haspopup="true" aria-expanded="false" title="Theme Settings">
            <i data-lucide="monitor"></i>
          </button>
          <div class="theme-dropdown-menu">
            <button class="theme-option" data-theme-value="light">
              <i data-lucide="sun"></i> Light
            </button>
            <button class="theme-option" data-theme-value="dark">
              <i data-lucide="moon"></i> Dark
            </button>
            <button class="theme-option" data-theme-value="system">
              <i data-lucide="monitor"></i> System
            </button>
          </div>
        </div>"""

mobile_search = """        <button class="theme-toggle mobile-theme-toggle" aria-label="Toggle theme" style="width: 100%; display: flex; align-items: center; justify-content: center; padding: 12px; background: transparent; border: 1px solid var(--border-default); border-radius: var(--radius-md); color: var(--text-primary); margin-bottom: 12px;">
          <i data-lucide="moon"></i> <span style="margin-left: 8px;">Toggle Theme</span>
        </button>"""

mobile_replace = """        <div class="theme-dropdown-container" style="width: 100%; margin-bottom: 12px;">
          <button class="theme-toggle mobile-theme-toggle" aria-label="Toggle theme" aria-haspopup="true" aria-expanded="false" style="width: 100%; display: flex; align-items: center; justify-content: center; padding: 12px; background: transparent; border: 1px solid var(--border-default); border-radius: var(--radius-md); color: var(--text-primary);">
            <i data-lucide="monitor"></i> <span style="margin-left: 8px;">Theme Settings</span>
          </button>
          <div class="theme-dropdown-menu mobile-dropdown">
            <button class="theme-option" data-theme-value="light">
              <i data-lucide="sun"></i> Light
            </button>
            <button class="theme-option" data-theme-value="dark">
              <i data-lucide="moon"></i> Dark
            </button>
            <button class="theme-option" data-theme-value="system">
              <i data-lucide="monitor"></i> System
            </button>
          </div>
        </div>"""

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace(desktop_search, desktop_replace)
    new_content = new_content.replace(mobile_search, mobile_replace)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
