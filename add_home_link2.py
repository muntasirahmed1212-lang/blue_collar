import glob

html_files = glob.glob('*.html')

desktop_search_1 = """        <div class="nav-links">
          <a href="/services.html" class="nav-link active">Services</a>"""

desktop_replace_1 = """        <div class="nav-links">
          <a href="/" class="nav-link">Home</a>
          <a href="/services.html" class="nav-link active">Services</a>"""

mobile_search_1 = """      <nav class="mobile-nav-links">
        <a href="/services.html" class="nav-link active">Services</a>"""

mobile_replace_1 = """      <nav class="mobile-nav-links">
        <a href="/" class="nav-link">Home</a>
        <a href="/services.html" class="nav-link active">Services</a>"""

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace(desktop_search_1, desktop_replace_1)
    new_content = new_content.replace(mobile_search_1, mobile_replace_1)
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
