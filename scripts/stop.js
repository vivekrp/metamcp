#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Stop MetaMCP Application
 * 
 * This script gracefully stops the MetaMCP application by:
 * 1. Finding running processes (smart-build.js, backend, frontend)
 * 2. Sending SIGTERM for graceful shutdown
 * 3. Force killing if processes don't respond within timeout
 */

const PROCESS_PATTERNS = [
  'smart-build.js',
  'next start',
  'node dist/index.js',
  'pnpm.*turbo.*start',
  'turbo run start'
];

/**
 * Find running processes matching our patterns
 */
async function findRunningProcesses() {
  try {
    // Use ps to find processes with specific patterns
    const { stdout } = await execAsync('ps aux');
    const lines = stdout.split('\n');
    const matchingProcesses = [];
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      
      const pid = parseInt(parts[1]);
      const command = parts.slice(10).join(' ');
      
      // Skip this script itself
      if (command.includes('stop.js')) continue;
      
      // Check if command matches any of our patterns
      for (const pattern of PROCESS_PATTERNS) {
        if (command.includes(pattern) || new RegExp(pattern).test(command)) {
          matchingProcesses.push({
            pid,
            command: command.length > 60 ? command.substring(0, 60) + '...' : command
          });
          break;
        }
      }
    }
    
    return matchingProcesses;
  } catch (error) {
    console.error('❌ Error finding processes:', error.message);
    return [];
  }
}

/**
 * Kill a process by PID
 */
async function killProcess(pid, signal = 'SIGTERM') {
  return new Promise((resolve) => {
    try {
      process.kill(pid, signal);
      console.log(`📤 Sent ${signal} to PID ${pid}`);
      resolve(true);
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.log(`⚠️  Process ${pid} no longer exists`);
      } else {
        console.log(`⚠️  Failed to kill process ${pid}: ${error.message}`);
      }
      resolve(false);
    }
  });
}

/**
 * Wait for process to exit
 */
async function waitForProcessExit(pid, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const checkInterval = 100;
    let elapsed = 0;
    
    const check = () => {
      try {
        // Sending signal 0 checks if process exists without actually sending a signal
        process.kill(pid, 0);
        
        elapsed += checkInterval;
        if (elapsed >= timeoutMs) {
          resolve(false); // Process still exists after timeout
        } else {
          setTimeout(check, checkInterval);
        }
      } catch (error) {
        if (error.code === 'ESRCH') {
          resolve(true); // Process no longer exists
        } else {
          resolve(false); // Unknown error
        }
      }
    };
    
    check();
  });
}

/**
 * Main shutdown function
 */
async function main() {
  console.log('🛑 MetaMCP Stop Script Started');
  console.log('🔍 Finding running MetaMCP processes...');
  
  const processes = await findRunningProcesses();
  
  if (processes.length === 0) {
    console.log('✅ No running MetaMCP processes found');
    process.exit(0);
  }
  
  console.log(`📋 Found ${processes.length} running process(es):`);
  processes.forEach(proc => {
    console.log(`   PID ${proc.pid}: ${proc.command}`);
  });
  
  console.log('\n🔄 Sending SIGTERM for graceful shutdown...');
  
  // Send SIGTERM to all processes
  for (const proc of processes) {
    await killProcess(proc.pid, 'SIGTERM');
  }
  
  // Wait for processes to exit gracefully
  console.log('⏳ Waiting for processes to exit gracefully (5 seconds)...');
  const exitPromises = processes.map(proc => 
    waitForProcessExit(proc.pid, 5000)
  );
  
  const exitResults = await Promise.all(exitPromises);
  
  // Check which processes are still running
  const stillRunning = processes.filter((proc, index) => !exitResults[index]);
  
  if (stillRunning.length > 0) {
    console.log(`⚠️  ${stillRunning.length} process(es) still running, force killing...`);
    
    for (const proc of stillRunning) {
      console.log(`🔨 Force killing PID ${proc.pid}: ${proc.command}`);
      await killProcess(proc.pid, 'SIGKILL');
    }
    
    // Wait a moment for force kills to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('✅ MetaMCP application stopped successfully');
  process.exit(0);
}

// Handle errors
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
  console.error('❌ Stop script failed:', error.message);
  process.exit(1);
});
