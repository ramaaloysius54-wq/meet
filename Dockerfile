FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

FROM node:22-alpine AS signaling-builder
WORKDIR /signaling
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi
COPY server/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS web-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

# Nilai default public env (aman di Dockerfile karena memang diekspos ke browser)
ARG NEXT_PUBLIC_SUPABASE_URL=https://wqqdtmkviwwespovlkrk.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_c_G3Op4Uscj1sgamc3vNPg_MvVqDsfM
ARG NEXT_PUBLIC_LIVEKIT_URL=wss://meet.portofoliorama.my.id
ARG NEXT_PUBLIC_SIGNALING_URL=https://meet.portofoliorama.my.id

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_SIGNALING_URL=$NEXT_PUBLIC_SIGNALING_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=web-builder --chown=nextjs:nodejs /app/public ./public
COPY --from=web-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=web-builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Socket.IO signaling output (dijalankan oleh deployment signaling via override command)
COPY --from=signaling-builder --chown=nextjs:nodejs /signaling/package.json ./signaling/package.json
COPY --from=signaling-builder --chown=nextjs:nodejs /signaling/node_modules ./signaling/node_modules
COPY --from=signaling-builder --chown=nextjs:nodejs /signaling/dist ./signaling/dist

USER nextjs
EXPOSE 3000 4000
CMD ["node", "server.js"]