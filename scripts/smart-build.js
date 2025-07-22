#!/usr/bin/env node

import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { spawn } from 'child_process';

/**
 * Smart Build Script
 * 
 * Features:
 * - Accepts --prod or --dev flags
 * - For each workspace with a build task, reads package.json#scripts.build to infer output directory
 * - Uses fallback mapping if output directory can't be inferred
 * - Checks if output folder is missing or older than source files
 * - Executes `pnpm turbo run build --filter={workspace}` only when needed
 * - Finally runs `pnpm turbo run start`
 * - Forwards NODE_ENV and TURBO_CACHE environment variables
 */

const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const isDev = args.includes('--dev');

if (isProd && isDev) {
  console.error('❌ Cannot specify both --prod and --dev flags');
  process.exit(1);
}

// Set NODE_ENV based on flags
if (isProd) {
  process.env.NODE_ENV = 'production';
} else if (isDev) {
  process.env.NODE_ENV = 'development';
}

// Forward environment variables
const envToForward = ['NODE_ENV'];
const forwardedEnv = {};
envToForward.forEach(key => {
  if (process.env[key]) {
    forwardedEnv[key] = process.env[key];
  }
});

// Cache configuration based on mode
const cacheArgs = [];
if (isProd) {
  // Production mode: enable full caching
  cacheArgs.push('--cache=local:rw,remote:rw');
} else if (isDev) {
  // Development mode: disable caching
  cacheArgs.push('--cache=local:r,remote:r');
}

/**
 * Output directory mapping based on common build tools
 */
const OUTPUT_DIRECTORY_MAPPING = {
  'next build': '.next',
  'vite build': 'dist',
  'rollup -c': 'dist', 
  'webpack': 'dist',
  'tsup': 'dist',
  'tsc': 'dist',
  'tsc -b': 'dist',
  'parcel build': 'dist',
  'esbuild': 'dist'
};

/**
 * Source directory patterns to check for changes
 */
const SOURCE_PATTERNS = ['src/**/*', 'pages/**/*', 'app/**/*', 'components/**/*', 'lib/**/*', 'utils/**/*', '*.ts', '*.tsx', '*.js', '*.jsx'];

/**
 * Simple pattern matching for workspace discovery
 */
function matchPattern(pattern) {
  const workspaces = [];
  
  // Handle simple patterns like "apps/*" or "packages/*"
  if (pattern.endsWith('/*')) {
    const baseDir = pattern.slice(0, -2);
    if (existsSync(baseDir)) {
      const entries = readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspacePath = join(baseDir, entry.name);
          if (existsSync(join(workspacePath, 'package.json'))) {
            workspaces.push(workspacePath);
          }
        }
      }
    }
  } else if (existsSync(pattern) && existsSync(join(pattern, 'package.json'))) {
    // Direct directory reference
    workspaces.push(pattern);
  }
  
  return workspaces;
}

/**
 * Parse workspace configuration
 */
function getWorkspaces() {
  try {
    const rootPkg = JSON.parse(readFileSync('package.json', 'utf8'));
    
    // Check for pnpm workspace
    if (existsSync('pnpm-workspace.yaml')) {
      const yamlContent = readFileSync('pnpm-workspace.yaml', 'utf8');
      const packagePatterns = yamlContent
        .split('\n')
        .filter(line => line.trim().startsWith('- '))
        .map(line => line.trim().substring(2).trim());
      
      const workspaces = [];
      for (const pattern of packagePatterns) {
        const matches = matchPattern(pattern);
        workspaces.push(...matches);
      }
      return workspaces;
    }
    
    // Fallback to package.json workspaces
    if (rootPkg.workspaces) {
      const patterns = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces.packages;
      const workspaces = [];
      for (const pattern of patterns) {
        const matches = matchPattern(pattern);
        workspaces.push(...matches);
      }
      return workspaces;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error reading workspace configuration:', error.message);
    return [];
  }
}

/**
 * Get the output directory for a workspace build script
 */
function getOutputDirectory(workspace, buildScript) {
  // Try to infer from build script
  for (const [scriptPattern, outputDir] of Object.entries(OUTPUT_DIRECTORY_MAPPING)) {
    if (buildScript.includes(scriptPattern.split(' ')[0])) {
      return resolve(workspace, outputDir);
    }
  }
  
  // Fallback: check common output directories
  const commonOutputDirs = ['.next', 'dist', 'build', 'out'];
  for (const dir of commonOutputDirs) {
    const fullPath = resolve(workspace, dir);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }
  
  // Default fallback
  return resolve(workspace, 'dist');
}

/**
 * Recursively find files in a directory
 */
function findFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  const files = [];
  
  if (!existsSync(dir)) {
    return files;
  }
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and common build/cache directories
        if (!['node_modules', '.next', 'dist', 'build', 'out', '.git'].includes(entry.name)) {
          files.push(...findFiles(fullPath, extensions));
        }
      } else if (entry.isFile()) {
        // Check if file has one of the target extensions
        const hasTargetExtension = extensions.some(ext => entry.name.endsWith(ext));
        if (hasTargetExtension) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Ignore read errors for individual directories
  }
  
  return files;
}

/**
 * Check if source files are newer than output directory
 */
function isOutputStale(workspace, outputDir) {
  if (!existsSync(outputDir)) {
    console.log(`📁 Output directory ${outputDir} doesn't exist`);
    return true;
  }
  
  const outputStat = statSync(outputDir);
  const outputTime = outputStat.mtime;
  
  // Find all source files in common source directories
  const sourceFiles = [];
  const sourceDirs = ['src', 'pages', 'app', 'components', 'lib', 'utils'];
  
  // Check source directories
  for (const srcDir of sourceDirs) {
    const fullSrcPath = join(workspace, srcDir);
    if (existsSync(fullSrcPath)) {
      sourceFiles.push(...findFiles(fullSrcPath));
    }
  }
  
  // Also check root level source files
  try {
    const rootFiles = readdirSync(workspace, { withFileTypes: true });
    for (const file of rootFiles) {
      if (file.isFile() && /\.(ts|tsx|js|jsx)$/.test(file.name)) {
        sourceFiles.push(join(workspace, file.name));
      }
    }
  } catch (error) {
    // Ignore error reading root directory
  }
  
  if (sourceFiles.length === 0) {
    console.log(`⚠️  No source files found in ${workspace}`);
    return false;
  }
  
  // Check if any source file is newer than output
  for (const sourceFile of sourceFiles) {
    try {
      const sourceStat = statSync(sourceFile);
      if (sourceStat.mtime > outputTime) {
        console.log(`📝 Source file ${sourceFile} is newer than output`);
        return true;
      }
    } catch (error) {
      // Ignore stat errors for individual files
    }
  }
  
  return false;
}

/**
 * Execute a command with proper environment forwarding
 */
function executeCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Executing: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...forwardedEnv },
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Main execution function
 */
async function main() {
  console.log('🔍 Smart Build Detection Started');
  console.log(`📋 Mode: ${isProd ? 'production' : isDev ? 'development' : 'default'}`);
  
  if (Object.keys(forwardedEnv).length > 0) {
    console.log('🔄 Environment variables forwarded:', Object.keys(forwardedEnv));
  }
  
  const workspaces = getWorkspaces();
  
  if (workspaces.length === 0) {
    console.log('⚠️  No workspaces found, running build on root');
    await executeCommand('pnpm', ['turbo', 'run', 'build']);
    await executeCommand('pnpm', ['turbo', 'run', 'start']);
    return;
  }
  
  console.log(`📦 Found ${workspaces.length} workspaces:`, workspaces);
  
  const workspacesToBuild = [];
  
  for (const workspace of workspaces) {
    const packageJsonPath = resolve(workspace, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      console.log(`⚠️  No package.json found in ${workspace}, skipping`);
      continue;
    }
    
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      
      if (!pkg.scripts || !pkg.scripts.build) {
        console.log(`⏭️  No build script in ${workspace}, skipping`);
        continue;
      }
      
      const buildScript = pkg.scripts.build;
      const outputDir = getOutputDirectory(workspace, buildScript);
      
      console.log(`🔍 Checking ${workspace}:`);
      console.log(`   Build script: ${buildScript}`);
      console.log(`   Output directory: ${outputDir}`);
      
      if (isOutputStale(workspace, outputDir)) {
        console.log(`✅ ${workspace} needs rebuilding`);
        workspacesToBuild.push(workspace);
      } else {
        console.log(`⏭️  ${workspace} is up to date`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${workspace}:`, error.message);
    }
  }
  
  // Build only workspaces that need it
  if (workspacesToBuild.length > 0) {
    console.log(`\n🔨 Building ${workspacesToBuild.length} workspace(s): ${workspacesToBuild.join(', ')}`);
    
    for (const workspace of workspacesToBuild) {
      const workspaceName = workspace.split('/').pop();
      const buildArgs = ['turbo', 'run', 'build', `--filter=${workspaceName}`, ...cacheArgs];
      await executeCommand('pnpm', buildArgs);
    }
  } else {
    console.log('\n✨ All workspaces are up to date, skipping build');
  }
  
  // Finally run start
  console.log('\n🚀 Starting application...');
  const startArgs = ['turbo', 'run', 'start', ...cacheArgs];
  await executeCommand('pnpm', startArgs);
}

// Handle errors and cleanup
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('❌ Smart build failed:', error.message);
  process.exit(1);
});
