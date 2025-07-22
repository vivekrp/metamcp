# Start Behaviors Matrix

This document defines the six start behaviors available in this project, providing different strategies for building and starting the application based on various scenarios and requirements.

## Overview

The start behaviors are designed to handle different development and production scenarios with varying levels of build automation and optimization.

## Start Behaviors

### start:build
**Command:** `turbo run build && turbo run start`

**Description:** Always performs a full build before starting the application. This is the most comprehensive option that ensures all dependencies and build artifacts are up-to-date.

**Use Cases:**
- First-time setup
- After major dependency changes
- When you want to ensure a completely clean build
- Production deployments where build consistency is critical

---

### start:nobuild
**Command:** `turbo run start`

**Description:** Assumes build artifacts already exist and skips the build step entirely. Directly starts the application using existing build outputs.

**Use Cases:**
- Rapid development iterations when no source changes have occurred
- Testing with existing build artifacts
- Scenarios where build time needs to be minimized

**⚠️ Warning:** This will fail if build artifacts don't exist or are incompatible.

---

### start:smart
**Command:** Run a helper that checks build folders' timestamps; if missing/stale, triggers build, then start.

**Description:** Intelligently determines whether a build is needed by comparing source file timestamps with build artifact timestamps. Only rebuilds when necessary.

**Use Cases:**
- General development workflow
- Automated scripts where efficiency matters
- CI/CD pipelines that want to optimize build times

**Logic:**
1. Check if build artifacts exist
2. Compare timestamps of source files vs. build artifacts
3. If build artifacts are missing or outdated, run build
4. Start the application

---

### start:production
**Command:** Same as `start:smart` but with `NODE_ENV=production TURBO_CACHE=true`

**Description:** Production-optimized version of smart start with caching enabled and production environment variables.

**Environment Variables:**
- `NODE_ENV=production`
- `TURBO_CACHE=true`

**Use Cases:**
- Production deployments
- Performance testing with production optimizations
- Staging environments that mirror production

**Benefits:**
- Optimized bundle sizes
- Production-level caching
- Performance optimizations enabled

---

### start:dev
**Command:** Same as `start:smart` but with `NODE_ENV=development TURBO_CACHE=false`

**Description:** Development-optimized version of smart start with caching disabled and development environment variables.

**Environment Variables:**
- `NODE_ENV=development`
- `TURBO_CACHE=false`

**Use Cases:**
- Active development with frequent changes
- Debugging sessions where fresh builds are needed
- Development environments where caching might interfere

**Benefits:**
- Always fresh builds during development
- Development-specific optimizations
- Better debugging capabilities

---

### start
**Command:** Alias to `start:smart`

**Description:** The default start behavior that provides the best balance of performance and reliability.

**Use Cases:**
- Default choice for most scenarios
- When you're unsure which start behavior to use
- General-purpose starting

## Implementation Notes

### Smart Build Helper
The smart build functionality requires a helper script that:

1. **Checks for build artifacts** in expected output directories
2. **Compares timestamps** between source files and build outputs
3. **Determines staleness** based on modification times
4. **Triggers builds** only when necessary
5. **Handles errors** gracefully if builds fail

### Environment Variables
The production and development variants set specific environment variables that affect:
- Build optimizations
- Cache behavior
- Runtime performance
- Debug information availability

### Error Handling
All start behaviors should include proper error handling for:
- Missing dependencies
- Build failures
- Start failures
- Invalid build artifacts

## Usage Guidelines

1. **For new contributors:** Start with `start:build` to ensure everything works
2. **For daily development:** Use `start` (smart) or `start:dev`
3. **For production:** Always use `start:production`
4. **For quick testing:** Use `start:nobuild` if you're confident builds are current
5. **For CI/CD:** Consider `start:smart` variants based on environment needs

## Future Considerations

- Monitor build times to optimize the smart build logic
- Consider adding more granular cache control options
- Evaluate adding watch modes for development scenarios
- Implement build artifact validation for enhanced reliability
