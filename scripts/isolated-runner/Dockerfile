# Build only on the dedicated Linux runner, from an already provisioned immutable image.
# Supply BASE_IMAGE as a locally available Node 24 image pinned by digest. Never auto-pull.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
LABEL amu.runner.schema="1"
COPY --chmod=0555 entry.mjs /opt/amu/entry.mjs
USER 1000:1000
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/node", "/opt/amu/entry.mjs"]
