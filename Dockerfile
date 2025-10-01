FROM node:20-alpine

WORKDIR /app

# Copia só manifests primeiro (cache melhor)
COPY api/package*.json ./api/
COPY web/package*.json ./web/
# Se tiver lockfiles separados, copie também:
# COPY api/package-lock.json ./api/
# COPY web/package-lock.json ./web/

# Copia o resto
COPY . .

# Permissão pro script
RUN chmod +x start.sh

# Railway expõe $PORT; nós escutaremos nele no Next
EXPOSE 3000

# Comando de start
CMD ["./start.sh"]
