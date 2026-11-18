ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
FROM ${BUILD_FROM}

ARG BUILD_VERSION
# App-Code der passenden Version von GitHub holen (Fallback: main)
RUN apk add --no-cache nodejs curl tar \
 && mkdir -p /app \
 && ( curl -fsSL "https://github.com/Corezone/wuerfelpoker/archive/refs/tags/${BUILD_VERSION}.tar.gz" -o /tmp/src.tgz \
      || curl -fsSL "https://github.com/Corezone/wuerfelpoker/archive/refs/heads/main.tar.gz" -o /tmp/src.tgz ) \
 && tar xzf /tmp/src.tgz -C /app --strip-components=1 \
 && rm -rf /tmp/src.tgz /app/ha-app /app/.github /app/docs

COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
