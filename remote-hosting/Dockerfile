# Use the official uv image as base
FROM ghcr.io/astral-sh/uv:debian

# Install Node.js and npm
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN npm i -g corepack@latest

RUN npm i -g @metamcp/mcp-server-metamcp@latest

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate

# Set working directory
WORKDIR /app

# Copy package files from remote-hosting context
COPY package.json pnpm-lock.yaml* ./

# Install dependencies and explicitly install cors
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm build

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/expressjs expressjs && \
    mkdir -p /home/expressjs && chown expressjs:nodejs /home/expressjs

# Set environment variables
ENV NODE_ENV=production
ENV HOME=/home/expressjs

USER expressjs

EXPOSE 12007

CMD ["node", "build/index.js"] 