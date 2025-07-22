# 🚀 PM2 Guide for MetaMCP

This guide covers PM2 process management for MetaMCP development.

## 📋 Quick Commands

### Start/Stop/Restart
```bash
# Start with ecosystem file
pm2 start ecosystem.config.js

# Start via package.json script (recommended)
pnpm run local-start

# Stop the application
pm2 stop metamcp-dev
# or
pnpm run local-stop

# Restart the application
pm2 restart metamcp-dev
# or
pnpm run local-restart

# Delete the process completely
pm2 delete metamcp-dev
```

### Monitoring & Logs
```bash
# Check process status
pm2 status

# View real-time logs (all output)
pm2 logs metamcp-dev

# View last 50 lines of logs
pm2 logs metamcp-dev --lines 50

# View only stdout logs
pm2 logs metamcp-dev --out

# View only stderr logs  
pm2 logs metamcp-dev --err

# Monitor CPU/Memory usage in real-time
pm2 monit

# View detailed process information
pm2 show metamcp-dev
```

### Log Files Location
- **Combined logs**: `logs/metamcp-combined.log`
- **Output logs**: `logs/metamcp-out.log` 
- **Error logs**: `logs/metamcp-error.log`

### Advanced Commands
```bash
# Reload app (zero downtime)
pm2 reload metamcp-dev

# Flush all logs
pm2 flush

# Save current PM2 process list
pm2 save

# Resurrect saved processes
pm2 resurrect

# List all PM2 processes
pm2 list

# Reset restart counter
pm2 reset metamcp-dev
```

## 🔧 Package.json Scripts

The following scripts are available:

- `pnpm run local-start` - Smart start (checks if running first)
- `pnpm run local-stop` - Stop the PM2 process
- `pnpm run local-restart` - Restart the PM2 process
- `pnpm run local-status` - Check PM2 status
- `pnpm run local-logs` - View real-time logs

## 📊 Process Configuration

The PM2 process is configured in `ecosystem.config.js`:

- **Name**: metamcp-dev
- **Script**: pnpm run dev
- **Auto-restart**: Enabled
- **Memory limit**: 1GB (auto-restart if exceeded)
- **Watch mode**: Disabled (relies on Turborepo hot reload)

## 🔍 Troubleshooting

### Process Not Starting
1. Check if ports are already in use: `lsof -i :12008`
2. Verify pnpm is available: `which pnpm`
3. Check PM2 logs: `pm2 logs metamcp-dev --lines 20`

### High Memory Usage
- Monitor with: `pm2 monit`
- Process will auto-restart if > 1GB memory usage

### Log Files Growing Large
```bash
# Clear all logs
pm2 flush

# Or clear specific log files
> logs/metamcp-out.log
> logs/metamcp-error.log
> logs/metamcp-combined.log
```

## 🚦 Development Workflow

1. **Start development**: `pnpm run local-start`
2. **Monitor logs**: `pm2 logs metamcp-dev`
3. **Check status**: `pnpm run local-status`
4. **Restart if needed**: `pnpm run local-restart`
5. **Stop when done**: `pnpm run local-stop`
