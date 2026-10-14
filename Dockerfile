# OPS-1: production image. Runtime configuration comes ONLY from environment variables (no .env inside the image):
# DATABASE_URL, JWT_SECRET, PII_ENCRYPTION_SECRET, SEED_ADMIN_PASSWORD, INITIAL_USER_PASSWORD, TRUST_PROXY_HOPS (e.g. 1 on Cloud Run).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health?ready=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.cjs"]
