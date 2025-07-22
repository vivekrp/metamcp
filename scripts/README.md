# Smart Build Script

A Node.js script that intelligently detects when workspaces need rebuilding and only builds what's necessary.

## Features

- ✅ **Flag Support**: Accepts `--prod` or `--dev` flags to set NODE_ENV
- ✅ **Output Directory Detection**: Reads `package.json#scripts.build` to infer output directories
- ✅ **Fallback Mapping**: Uses intelligent fallback mapping for common build tools
- ✅ **Selective Building**: Only rebuilds workspaces when output is missing or source files are newer
- ✅ **Environment Forwarding**: Passes through `NODE_ENV` and `TURBO_CACHE` environment variables
- ✅ **Zero Dependencies**: Pure Node.js with no external dependencies

## Usage

### Direct execution:
```bash
# Default mode
node scripts/smart-build.js

# Development mode (sets NODE_ENV=development)
node scripts/smart-build.js --dev

# Production mode (sets NODE_ENV=production)
node scripts/smart-build.js --prod
```

### Via npm/pnpm scripts:
```bash
# Default mode
pnpm smart-build

# Development mode
pnpm smart-build:dev

# Production mode
pnpm smart-build:prod
```

## How it works

1. **Workspace Discovery**: Reads `pnpm-workspace.yaml` or `package.json` workspaces configuration
2. **Build Script Analysis**: For each workspace with a `build` script, analyzes the command to determine output directory
3. **Output Directory Inference**: 
   - `next build` → `.next/`
   - `tsup` → `dist/`
   - `vite build` → `dist/`
   - `tsc` → `dist/`
   - And more...
4. **Staleness Check**: Compares modification times of source files vs output directory
5. **Selective Building**: Only runs `pnpm turbo run build --filter={workspace}` for stale workspaces
6. **Final Start**: Executes `pnpm turbo run start` after all necessary builds complete

## Output Directory Mapping

The script uses this mapping to infer output directories from build commands:

| Build Command | Output Directory |
|---------------|-----------------|
| `next build` | `.next` |
| `vite build` | `dist` |
| `tsup` | `dist` |
| `tsc` | `dist` |
| `rollup -c` | `dist` |
| `webpack` | `dist` |
| `parcel build` | `dist` |
| `esbuild` | `dist` |

## Source File Detection

The script scans these directories for source files:
- `src/`
- `pages/` (Next.js)
- `app/` (Next.js App Router)
- `components/`
- `lib/`
- `utils/`
- Root-level `.ts`, `.tsx`, `.js`, `.jsx` files

## Environment Variables

These environment variables are automatically forwarded to build and start commands:
- `NODE_ENV` (set by `--prod`/`--dev` flags)
- `TURBO_CACHE`

## Example Output

```
🔍 Smart Build Detection Started
📋 Mode: development
🔄 Environment variables forwarded: [ 'NODE_ENV' ]
📦 Found 4 workspaces: [ 'apps/backend', 'apps/frontend', 'packages/trpc', 'packages/zod-types' ]

🔍 Checking apps/backend:
   Build script: tsup
   Output directory: /project/apps/backend/dist
⏭️  apps/backend is up to date

🔍 Checking apps/frontend:
   Build script: next build
   Output directory: /project/apps/frontend/.next
📝 Source file /project/apps/frontend/src/app/page.tsx is newer than output
✅ apps/frontend needs rebuilding

🔨 Building 1 workspace(s): apps/frontend
🚀 Executing: pnpm turbo run build --filter=frontend

🚀 Starting application...
🚀 Executing: pnpm turbo run start
```

## Benefits

- **Faster Development**: Skip unnecessary rebuilds when nothing has changed
- **CI/CD Optimization**: Only rebuild what's actually needed
- **Zero Configuration**: Works out of the box with common build tools
- **Turbo Integration**: Leverages Turborepo's filtering and caching capabilities
