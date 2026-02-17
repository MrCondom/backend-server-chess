FROM node:18-slim

# Install Git (so you can commit/push later from terminal)
RUN apt-get update \
    && apt-get install -y git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Copy project files into image
COPY . .

# Install only required dependencies
RUN npm install --omit=dev

# Expose your app port (update if your app uses a different one)
EXPOSE 8080

# Set production mode
ENV NODE_ENV=production

# Start your app
CMD ["npm", "start"]
