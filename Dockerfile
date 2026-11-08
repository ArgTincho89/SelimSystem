FROM node:22-alpine

WORKDIR /app

# Copy deps first for layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy source — any change here invalidates cache
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
