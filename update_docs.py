import os
import re
import glob

docs_dir = "/Users/jbreissinger/Projects/personalProjects/Holocron/docs"

for filepath in glob.glob(os.path.join(docs_dir, "**/*.md"), recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Track if we make changes
    original = content
    
    # ISC-5: Update PAI/Tools/ paths
    # The prompt explicitly mentions ~/.config/opencode/PAI/Tools/ -> $HOLOCRON_DIR/tools/
    content = content.replace("~/.config/opencode/PAI/Tools/", "$HOLOCRON_DIR/tools/")
    # Also replace $HOLOCRON_MEMORY_DIR/PAI/Tools/ as it's the actual string in the docs
    content = content.replace("$HOLOCRON_MEMORY_DIR/PAI/Tools/", "$HOLOCRON_DIR/tools/")
    content = content.replace("PAI/Tools/", "tools/")
    
    # ISC-4: Update PAI/ with docs/ where referencing framework documentation
    # We want to catch things like PAI/PIPELINES.md, PAI/ACTIONS.md, etc.
    # But NOT PAI/USER, PAI/Algorithm (if it stays in context), PAI/SKILL.md (actually SKILL.md is in docs now!)
    
    # Let's replace $HOLOCRON_MEMORY_DIR/PAI/ with $HOLOCRON_DIR/docs/ for known doc files
    docs_files = [
        "ACTIONS.md", "AISTEERINGRULES.md", "CLI.md", "CLIFIRSTARCHITECTURE.md",
        "CONTEXT_ROUTING.md", "DOCUMENTATIONINDEX.md", "FLOWS.md", "MEMORYSYSTEM.md",
        "PAIAGENTSYSTEM.md", "PAISYSTEMARCHITECTURE.md", "PIPELINES.md", "PRDFORMAT.md",
        "README.md", "SKILL.md", "SKILLSYSTEM.md", "SYSTEM_USER_EXTENDABILITY.md",
        "THEDELEGATIONSYSTEM.md", "THEFABRICSYSTEM.md", "THEHOOKSYSTEM.md",
        "THENOTIFICATIONSYSTEM.md", "TOOLS.md", "TERMINALTABS.md"
    ]
    
    for doc in docs_files:
        content = content.replace(f"$HOLOCRON_MEMORY_DIR/PAI/{doc}", f"$HOLOCRON_DIR/docs/{doc}")
        content = content.replace(f"PAI/{doc}", f"docs/{doc}")
    
    # Handle other general PAI/ references that aren't USER/ or Algorithm/
    # This might be tricky. The PRD says "replace PAI/ with docs/ where referencing framework documentation".
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {os.path.basename(filepath)}")
