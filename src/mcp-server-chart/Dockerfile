# Builder stage
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine as builder
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy source code (without node_modules thanks to .dockerignore)
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:18-alpine
WORKDIR /app

# Copy built files and package.json
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

# Install only production dependencies
RUN npm install --production --ignore-scripts

# Expose port and set command
EXPOSE 3001
CMD ["node", "build/index.js", "--transport", "streamable", "--endpoint", "/mcp-server-chart", "--port", "3001"]