FROM node:20

WORKDIR /app

COPY backend/package*.json ./

RUN npm install --omit=dev

COPY backend .

ENV NODE_ENV=production

CMD ["npm", "start"]