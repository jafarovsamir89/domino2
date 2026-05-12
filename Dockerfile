FROM node:22.14.0-slim

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server ./server
COPY www ./www

WORKDIR /app/server
ENV NODE_ENV=production

CMD ["npm", "start"]
