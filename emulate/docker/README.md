# Containerized verification

> The Debian containers that test the Raspberry Pi and Linux code paths from a Mac (`make test-linux`).

The container is here so the Raspberry Pi code path can be tested from a Mac.

It uses Debian Bookworm (the base Raspberry Pi OS is built from) and deliberately omits `python3-yaml`, so the suite exercises the built-in YAML parser — the configuration exactly as a fresh Pi image would see it.

```sh
make test-linux                  # native architecture
docker build --platform linux/arm64 -f docker/Dockerfile -t retropi-test .
docker run --rm retropi-test     # 64-bit ARM, as on a Pi 4/5
```

What this catches that a Mac run does not:

- bash-4 idioms that macOS bash 3.2 tolerates differently
- `.so` vs `.dylib` core resolution
- the `linux/aarch64` libretro buildbot path
- divergence between the built-in YAML parser and PyYAML
