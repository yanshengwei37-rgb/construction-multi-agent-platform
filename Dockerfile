FROM node:20-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
RUN npm install --only=production --legacy-peer-deps

# Copy application code
COPY . .

# Expose port
EXPOSE 5180

# Start server
CMD ["node", "api/server.js"]
