# Exercises the Raspberry Pi code path from any machine.
#
# Deliberately minimal: Debian Bookworm (what Raspberry Pi OS is built on)
# with python3 but WITHOUT python3-yaml, so the suite runs against the
# built-in YAML parser exactly as it would on a fresh Pi image.
#
#   docker build -f docker/Dockerfile -t retropi-test .
#   docker run --rm retropi-test
#
# Build for the real Pi architecture with:
#   docker build --platform linux/arm64 -f docker/Dockerfile -t retropi-test .
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash python3 curl unzip rsync git ca-certificates file \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /retropi
COPY . /retropi

# Content directories are volatile; make sure a clean checkout still works.
RUN rm -rf .retropi build dist config/local.yaml

ENV NO_COLOR=1
CMD ["bash", "-c", "\
  echo '== environment =='; \
  uname -m; bash --version | head -1; python3 --version; \
  python3 -c 'import yaml' 2>/dev/null && echo 'PyYAML: present' || echo 'PyYAML: absent (built-in parser in use)'; \
  echo; echo '== test suite =='; ./tests/run.sh; \
  echo; echo '== cli smoke =='; ./bin/retropi --version; \
  ./bin/retropi build --systems nes,snes,psx --no-install >/dev/null && echo 'build: ok'; \
  ./bin/retropi systems list | tail -3; \
  ./bin/retropi doctor --no-bios >/dev/null 2>&1 || true; \
  echo 'doctor: ran'"]
