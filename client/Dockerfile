FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
# Resilient installs over flaky / mobile links: retry stalled tarball fetches
# with a long timeout instead of failing the whole build on one ETIMEDOUT.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 180000 \
 && npm config set fetch-timeout 600000
RUN npm install
COPY . .
EXPOSE 5183
CMD ["npm", "run", "dev"]
