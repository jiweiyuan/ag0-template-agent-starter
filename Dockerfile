FROM denoland/deno:2.6.5
WORKDIR /app
RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"
RUN curl -fsSL -o /usr/local/lib/libsqlite3.so \
    https://github.com/denodrivers/sqlite3/releases/download/0.13.0/libsqlite3.so
ENV DENO_SQLITE_PATH="/usr/local/lib/libsqlite3.so"
COPY . .
RUN mkdir -p logs alerts
RUN cd frontend && bun install && bun run build
RUN deno cache main.ts
EXPOSE 8080
CMD ["deno", "run", "-A", "main.ts"]
