FROM oven/bun:1.3.14
WORKDIR /app
COPY package.json bun.lock ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY data ./data
RUN bun install --frozen-lockfile
ENV PORT=3000
ENV MIZAN_PROVIDER=scripted
EXPOSE 3000
CMD ["bun", "run", "demo-server"]
