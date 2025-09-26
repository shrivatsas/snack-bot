FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create keys directory
RUN mkdir -p /app/keys

# Create logs directory
RUN mkdir -p /app/logs

# Expose ports for Standard A2A, Premium A2A, and AP2
EXPOSE 4000 4001 5001

# Start the application
CMD ["npm", "start"]