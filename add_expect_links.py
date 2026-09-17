import glob

html_files = glob.glob('*.html')

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add <link rel="expect">
    # Find </head> and insert before it
    if '<link rel="expect"' not in content:
        content = content.replace('</head>', '  <link rel="expect" href="#main-content" blocking="render">\n</head>')
    
    # 2. Add id="main-content" to <main>
    if '<main id="main-content">' not in content:
        content = content.replace('<main>', '<main id="main-content">')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Updated {filepath}")
