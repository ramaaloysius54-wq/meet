FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS signaling-builder
WORKDIR /signaling
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:20-alpine AS web-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_LIVEKIT_URL
ARG NEXT_PUBLIC_SIGNALING_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_SIGNALING_URL=$NEXT_PUBLIC_SIGNALING_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=web-builder /app/public ./public
COPY --from=web-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=web-builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Socket.IO signaling output (dijalankan oleh deployment signaling via override command)
COPY --from=signaling-builder --chown=nextjs:nodejs /signaling/package.json ./signaling/package.json
COPY --from=signaling-builder --chown=nextjs:nodejs /signaling/node_modules ./signaling/node_modules
COPY --from=signaling-builder --chown=nextjs:nodejs /signaling/dist ./signaling/dist

USER nextjs
EXPOSE 3000 4000
ENV PORT=3000
CMD ["node", "server.js"]
