module.exports = {
  apps: [
    {
      name: 'metamcp-dev',
      script: 'pnpm',
      args: 'run dev',
      cwd: '/Users/vivekrp/Downloads/projects/mcp/metamcp',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
      out_file: './logs/metamcp-out.log',
      error_file: './logs/metamcp-error.log',
      log_file: './logs/metamcp-combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
