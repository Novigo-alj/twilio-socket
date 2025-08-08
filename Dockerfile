FROM node:22-alpine

WORKDIR /usr/src/app

# COPY package files first
COPY package*.json ./

# Install production deps
RUN npm install --production

# Now COPY rest of backend code
COPY . .

ENV PORT 3002
EXPOSE 3002

CMD ["node", "index.js"]