FROM node:22-slim

WORKDIR /app

COPY package*.json ./
COPY local_packages ./local_packages
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start"]
