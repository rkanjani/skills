#!/bin/sh
# Build the home screen APK from ../home with the Android SDK's own tools. No Gradle, no downloads.
# Needs: Android SDK build-tools and a platform (android-30 or later), and JDK 17 or later.
# Usage: build_home.sh [OUT_DIR]     (default OUT_DIR: ~/.config/fix-my-tv/build)
# Prints the path of the signed APK on the last line.
set -eu

here=$(cd "$(dirname "$0")/.." && pwd -P)
src="$here/home"
state="${FIX_MY_TV_HOME:-$HOME/.config/fix-my-tv}"
out="${1:-$state/build}"

sdk=""
for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" /opt/android-sdk; do
  if [ -n "$d" ] && [ -d "$d/build-tools" ]; then sdk=$d; break; fi
done
[ -n "$sdk" ] || { echo "No Android SDK with build-tools found. See references/home.md." >&2; exit 2; }

bt=$(ls -1 "$sdk/build-tools" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
tools="$sdk/build-tools/$bt"
platform=$(ls -1 "$sdk/platforms" | sed -n 's/^android-\([0-9][0-9]*\).*/\1 &/p' | sort -n | tail -1 | cut -d' ' -f2)
[ -n "$platform" ] || { echo "No SDK platform found in $sdk/platforms." >&2; exit 2; }
jar="$sdk/platforms/$platform/android.jar"

if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/javac" ]; then
  JAVA_HOME=""
  for j in "$(/usr/libexec/java_home 2>/dev/null || true)" /opt/homebrew/opt/openjdk@21 /opt/homebrew/opt/openjdk@17 \
           /opt/homebrew/opt/openjdk /usr/local/opt/openjdk@17 /usr/local/opt/openjdk \
           "/Applications/Android Studio.app/Contents/jbr/Contents/Home" /usr/lib/jvm/default-java; do
    if [ -n "$j" ] && [ -x "$j/bin/javac" ]; then JAVA_HOME=$j; break; fi
  done
fi
[ -n "$JAVA_HOME" ] || { echo "No JDK found. Install JDK 17 or later (see references/home.md)." >&2; exit 2; }
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"

echo "SDK $sdk, build-tools $bt, $platform, JDK $JAVA_HOME" >&2
work=$(mktemp -d "${TMPDIR:-/tmp}/fix-my-tv-home.XXXXXX")
trap 'rm -rf "${work:?}"' EXIT
mkdir -p "$work/gen" "$work/classes" "$work/dex" "$out"

"$tools/aapt2" compile --dir "$src/res" -o "$work/res.zip"
"$tools/aapt2" link -I "$jar" --manifest "$src/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$(date +%s | cut -c1-9)" --version-name "1.0" \
  --java "$work/gen" -o "$work/base.apk" "$work/res.zip"

find "$src/src" "$work/gen" -name '*.java' > "$work/sources.txt"
javac -nowarn --release 11 -classpath "$jar" -encoding UTF-8 -d "$work/classes" @"$work/sources.txt"
find "$work/classes" -name '*.class' > "$work/classes.txt"
"$tools/d8" --release --min-api 24 --lib "$jar" --output "$work/dex" @"$work/classes.txt"

cp "$work/base.apk" "$work/unsigned.apk"
(cd "$work/dex" && zip -q -j "$work/unsigned.apk" classes.dex)
"$tools/zipalign" -p -f 4 "$work/unsigned.apk" "$work/aligned.apk"

# One local signing key per machine, so later builds install over earlier ones.
key="$state/home-signing.jks"
pass="$state/home-signing.pass"
if [ ! -f "$key" ]; then
  mkdir -p "$state"
  (umask 077; LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32 > "$pass")
  keytool -genkeypair -keystore "$key" -storepass:file "$pass" -keypass:file "$pass" -alias home \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Home" >/dev/null 2>&1
fi
"$tools/apksigner" sign --ks "$key" --ks-pass "file:$pass" --v4-signing-enabled false \
  --out "$out/home.apk" "$work/aligned.apk"
echo "$out/home.apk"
