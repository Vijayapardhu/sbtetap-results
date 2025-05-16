FROM mcr.microsoft.com/playwright/playwright:latest

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "newserver.js"]
