import glob

html_files = glob.glob('*.html')

desktop_search = """      <div class="header-actions">
        
        <div class="theme-dropdown-container">"""

desktop_replace = """      <div class="header-actions">
        
        <button class="btn btn-ghost global-location-btn" title="Set Location" style="padding: var(--spacing-2) var(--spacing-3);">
          <i data-lucide="map-pin"></i>
          <span class="location-text" style="font-weight: 500;">Set Location</span>
        </button>

        <div class="theme-dropdown-container">"""

mobile_search = """      <div class="mobile-actions">
        
        <div class="theme-dropdown-container" style="width: 100%; margin-bottom: 12px;">"""

mobile_replace = """      <div class="mobile-actions">
        
        <button class="btn btn-outline global-location-btn" style="width: 100%; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <i data-lucide="map-pin"></i> <span class="location-text">Set Location</span>
        </button>

        <div class="theme-dropdown-container" style="width: 100%; margin-bottom: 12px;">"""

modal_html = """
  <!-- Location Modal -->
  <div id="location-modal" class="modal-overlay hidden">
    <div class="modal-container">
      <div class="modal-header">
        <h3>Set Your Location</h3>
        <button class="modal-close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <button id="btn-use-current-location" class="btn btn-primary" style="width: 100%; margin-bottom: var(--spacing-4);">
          <i data-lucide="crosshair"></i> Use My Current Location
        </button>
        <div style="text-align: center; margin-bottom: var(--spacing-4); color: var(--text-muted); font-size: var(--text-sm);">
          — OR ENTER MANUALLY —
        </div>
        <div class="search-input-group" style="border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--spacing-2); display: flex; align-items: center; gap: var(--spacing-2);">
          <i data-lucide="map-pin" class="text-muted"></i>
          <input type="text" id="manual-location-input" placeholder="Enter city, neighborhood, or zip..." style="border: none; background: transparent; outline: none; flex: 1; color: var(--text-primary); width: 100%;">
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: var(--spacing-2); margin-top: var(--spacing-6);">
        <button class="btn btn-ghost modal-close-btn">Cancel</button>
        <button id="btn-save-location" class="btn btn-primary">Save</button>
      </div>
    </div>
  </div>
"""

body_search = """</body>"""
body_replace = modal_html + """</body>"""

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace(desktop_search, desktop_replace)
    new_content = new_content.replace(mobile_search, mobile_replace)
    
    # Add modal if not already added
    if "id=\"location-modal\"" not in new_content:
        new_content = new_content.replace(body_search, body_replace)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
