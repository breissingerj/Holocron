import os
import re
import glob

docs_dir = "/Users/jbreissinger/Projects/personalProjects/Holocron/docs"

directories = ["FLOWS", "PIPELINES", "ACTIONS", "PAISECURITYSYSTEM"]

for filepath in glob.glob(os.path.join(docs_dir, "**/*.md"), recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    for directory in directories:
        content = content.replace(f"$HOLOCRON_MEMORY_DIR/PAI/{directory}", f"$HOLOCRON_DIR/docs/{directory}")
        content = content.replace(f"PAI/{directory}", f"docs/{directory}")

    content = content.replace("PAI/RESPONSEFORMAT.md", "docs/RESPONSEFORMAT.md")
    content = content.replace("$HOLOCRON_MEMORY_DIR/PAI/RESPONSEFORMAT.md", "$HOLOCRON_DIR/docs/RESPONSEFORMAT.md")
    
    # "All documentation files are in `$HOLOCRON_MEMORY_DIR/PAI/` with USER/" -> 
    content = content.replace("`$HOLOCRON_MEMORY_DIR/PAI/`", "`$HOLOCRON_DIR/docs/`")
    
    # This directory (`PAI/`) -> This directory (`docs/`)
    content = content.replace("This directory (`PAI/`)", "This directory (`docs/`)")
    content = content.replace("  PAI/                         # This directory", "  docs/                        # This directory")
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {os.path.basename(filepath)}")
