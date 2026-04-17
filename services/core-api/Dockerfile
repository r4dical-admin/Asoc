FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY services/core-api ./services/core-api
COPY apps/web ./apps/web
COPY demo-data ./demo-data
COPY SPECS.md README.md ./

ENV ASOC_PORT=8080
EXPOSE 8080

CMD ["node", "services/core-api/src/server.js"]
