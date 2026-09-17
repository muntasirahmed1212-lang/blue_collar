import glob

html_files = glob.glob('*.html')

desktop_search = """        <div class="nav-links">
          <a href="/services.html" class="nav-link">Services</a>"""

desktop_replace = """        <div class="nav-links">
          <a href="/" class="nav-link">Home</a>
          <a href="/services.html" class="nav-link">Services</a>"""

mobile_search = """      <nav class="mobile-nav-links">
        <a href="/services.html" class="nav-link">Services</a>"""

mobile_replace = """      <nav class="mobile-nav-links">
        <a href="/" class="nav-link">Home</a>
        <a href="/services.html" class="nav-link">Services</a>"""

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace(desktop_search, desktop_replace)
    new_content = new_content.replace(mobile_search, mobile_replace)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
