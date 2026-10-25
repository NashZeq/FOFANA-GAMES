FROM node:22-alpine

ENV NODE_ENV=production PORT=3000
WORKDIR /app

# Install the two server dependencies inside the image. They are intentionally
# not bundled into the website ZIP as local node_modules.
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY . .
RUN addgroup -S fofana && adduser -S fofana -G fofana && chown -R fofana:fofana /app
USER fofana

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/index.js"]
