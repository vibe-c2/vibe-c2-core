# Icon name lists

Every icon name the wiki client can render, one per line, sorted.

- `lucide.txt` — lucide icon names in the PascalCase form the database stores.
- `simple-icons.txt` — simple-icons brand slugs, as stored after the `si:` prefix.

Both are generated from the frontend's own dependencies, which is where the
client gets its lists too: it globs `node_modules` at build time and resolves
any name in them, lazily loading whatever is not in the curated catalog. The
server validates agent-supplied names against these files so that an agent may
choose from exactly what its operator's icon picker offers.

Regenerate after a `lucide-react` or `simple-icons` bump, from `core/`:

```sh
ls ../frontend/node_modules/lucide-react/dist/esm/icons | grep '\.mjs$' |
  sed 's/\.mjs$//' |
  python3 -c "import sys
for line in sys.stdin:
    print(''.join(p[:1].upper()+p[1:] for p in line.strip().split('-')))" |
  sort > pkg/mcp/iconassets/lucide.txt

ls ../frontend/node_modules/simple-icons/icons | grep '\.svg$' |
  sed 's/\.svg$//' | sort > pkg/mcp/iconassets/simple-icons.txt
```

`TestIconListsMatchTheInstalledPackages` does the same walk and fails when
these files have drifted, skipping when `node_modules` is not installed.
