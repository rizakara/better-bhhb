#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -x ./gradlew ]]; then
  chmod +x ./gradlew
fi

./gradlew jar --no-daemon

VERSION="$(grep -E "^version = " build.gradle | sed -E "s/^version = ['\"]([^'\"]+)['\"].*/\1/")"
if [[ -z "$VERSION" ]]; then
  echo "Could not read project version from build.gradle" >&2
  exit 1
fi

JAR="build/libs/better-bhhb-${VERSION}.jar"
if [[ ! -f "$JAR" ]]; then
  echo "Expected JAR not found: $JAR" >&2
  exit 1
fi

CHECKSUM="${JAR}.sha256"
sha256sum "$JAR" | awk '{ print $1 }' > "$CHECKSUM"

echo "version=$VERSION"
echo "jar=$ROOT/$JAR"
echo "checksum=$ROOT/$CHECKSUM"