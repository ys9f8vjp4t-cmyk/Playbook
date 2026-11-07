# Сервер онлайн-комнат Po'Nopoly + раздача клиента.
# docker build -f server/Dockerfile -t ponopoly . && docker run -p 8080:8080 ponopoly
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.js"]
