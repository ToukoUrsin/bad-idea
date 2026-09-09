FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Precompress on the builder so the 512 MiB runtime never spends CPU on it.
RUN node -e "const z=require('node:zlib'),fs=require('node:fs'),p=require('node:path');"\
"const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]);"\
"for(const f of walk('dist')){if(!/[.](js|css|html|svg|json)$/.test(f))continue;const b=fs.readFileSync(f);"\
"fs.writeFileSync(f+'.gz',z.gzipSync(b,{level:9}));"\
"fs.writeFileSync(f+'.br',z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_QUALITY]:11,[z.constants.BROTLI_PARAM_SIZE_HINT]:b.length}}));}"

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SAVE_GENERATION_ARTIFACTS=false
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/*.mjs ./
RUN mkdir -p runtime && chown node:node runtime
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "server.mjs"]
