FROM node:22-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Hot-reload via tsx watch
CMD ["npm", "run", "dev"]
