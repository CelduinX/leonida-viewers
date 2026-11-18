FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY migrations ./migrations
COPY .openai/hosting.json ./.openai/hosting.json
RUN npm run typecheck && npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/leonida.sqlite
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/serve.mjs /app/scripts/database.mjs ./scripts/
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/package.json ./package.json
RUN mkdir /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs"]
