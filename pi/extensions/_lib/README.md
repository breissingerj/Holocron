# extensions/_lib/

Shared helpers consumed by multiple pi extensions. This is **not** a standalone extension — `install.sh` skips it when symlinking into `~/.pi/agent/extensions/`.

## Planned modules

| File | Purpose |
|---|---|
| `paths.ts` | `HOLOCRON_MEMORY_DIR` resolution, `holocronPath()` helper |
| `prd-utils.ts` | PRD frontmatter parser, `syncToWorkJson()`, `readRegistry()` |
| `tool-names.ts` | Claude tool name (`Bash`, `Edit`) ↔ pi tool name (`bash`, `edit`) translation table |
| `block.ts` | Blocking adapter — wraps pi `{ block: true, reason }` return in a typed helper |
| `notifications.ts` | Session start time recording, `shouldNotify()` volume gate |

These will be extracted from `$HOLOCRON_MEMORY_DIR/hooks/lib/` (private repo) once porting begins. The shared lib stays here (public) while identity-coupled logic stays private.
