import os

with open('Frontend/Functions/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

if 'GLOBAL_PAGE_SIZE' not in app_js:
    app_js = app_js.replace('// Application startup and cross-feature dashboard refresh.', '// Application startup and cross-feature dashboard refresh.\n\nwindow.GLOBAL_PAGE_SIZE = 10;')
    with open('Frontend/Functions/app.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(app_js)

print("Patch applied for app")
