FROM node:20-alpine AS builder

RUN apk update && \
    apk add git ffmpeg wget curl bash openssl

LABEL version="2.2.3" description="Api to control whatsapp features through http requests." 
LABEL maintainer="Davidson Gomes" git="https://github.com/DavidsonGomes"
LABEL contact="contato@atendai.com"

WORKDIR /evolution

COPY ./package.json ./tsconfig.json ./

# Crear el archivo runWithProvider.js con el contenido JavaScript correcto
RUN echo 'const dotenv = require("dotenv");
const { execSync } = require("child_process");
const { existsSync } = require("fs");

dotenv.config();

const { DATABASE_PROVIDER } = process.env;
const databaseProviderDefault = DATABASE_PROVIDER ?? "postgresql";

if (!DATABASE_PROVIDER) {
  console.warn(`DATABASE_PROVIDER is not set in the .env file, using default: ${databaseProviderDefault}`);
}

let command = process.argv
  .slice(2)
  .join(" ")
  .replace(/DATABASE_PROVIDER/g, databaseProviderDefault);

if (command.includes("rmdir") && existsSync("prisma\\\\migrations")) {
  try {
    execSync("rmdir /S /Q prisma\\\\migrations", { stdio: "inherit" });
  } catch (error) {
    console.error(`Error removing directory: prisma\\\\migrations`);
    process.exit(1);
  }
} else if (command.includes("rmdir")) {
  console.warn(`Directory "prisma\\\\migrations" does not exist, skipping removal.`);
}

try {
  execSync(command, { stdio: "inherit" });
} catch (error) {
  console.error(`Error executing command: ${command}`);
  process.exit(1);
}' > /evolution/runWithProvider.js

# Verificar el contenido del archivo
RUN cat /evolution/runWithProvider.js

# Modificar el package.json para arreglar las comillas en los scripts
RUN sed -i 's/"db:generate": "node runWithProvider.js \\"/"db:generate": "node runWithProvider.js "/g' package.json && \
    sed -i 's/"db:deploy": "node runWithProvider.js \\"/"db:deploy": "node runWithProvider.js "/g' package.json

# Verificar los cambios en package.json
RUN cat package.json | grep db:

COPY ./src ./src
COPY ./public ./public
COPY ./prisma ./prisma
COPY ./manager ./manager
COPY ./.env.example ./.env
COPY ./tsup.config.ts ./
COPY ./Docker ./Docker

RUN npm install

RUN chmod +x ./Docker/scripts/* && dos2unix ./Docker/scripts/*
RUN ./Docker/scripts/generate_database.sh
RUN npm run build

FROM node:20-alpine AS final

RUN apk update && \
    apk add tzdata ffmpeg bash openssl

ENV TZ=America/Sao_Paulo

WORKDIR /evolution

COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json
COPY --from=builder /evolution/node_modules ./node_modules
COPY --from=builder /evolution/dist ./dist
COPY --from=builder /evolution/prisma ./prisma
COPY --from=builder /evolution/manager ./manager
COPY --from=builder /evolution/public ./public
COPY --from=builder /evolution/.env ./.env
COPY --from=builder /evolution/Docker ./Docker
COPY --from=builder /evolution/runWithProvider.js ./runWithProvider.js
COPY --from=builder /evolution/tsup.config.ts ./tsup.config.ts

ENV DOCKER_ENV=true

EXPOSE 8080

ENTRYPOINT ["/bin/bash", "-c", ". ./Docker/scripts/deploy_database.sh && npm run start:prod" ]
