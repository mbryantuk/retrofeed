FROM node:20-slim

# Install system dependencies for node-sqlite3 and bcrypt if needed
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --omit=dev

# Copy application code
COPY . .

# Ensure start script is executable
RUN chmod +x start.sh

# Expose the app port and the proxy port
EXPOSE 3000
EXPOSE 8080

CMD ["./start.sh"]
