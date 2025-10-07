FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 9393

# Set default port and hostname (can be overridden by environment)
ENV PORT=9393
ENV HOSTNAME=0.0.0.0

# Start Next.js in production mode
CMD ["npm", "start"]
