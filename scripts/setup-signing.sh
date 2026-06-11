#!/bin/bash
set -e
KEYSTORE_PATH="android/smartdev-release.keystore"
KEY_ALIAS="smartdev"

echo ""
echo "================================================="
echo "  SmartDev Android Keystore Setup"
echo "================================================="

if [ -f "$KEYSTORE_PATH" ]; then
  echo "✅ Keystore already exists at $KEYSTORE_PATH"
else
  echo "🔑 Generating release keystore..."
  echo "   IMPORTANT: Save the passwords — you cannot recover them!"
  echo ""
  keytool -genkey -v \
    -keystore $KEYSTORE_PATH \
    -alias $KEY_ALIAS \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000
  echo ""
  echo "✅ Keystore created at $KEYSTORE_PATH"
fi

echo ""
echo "================================================="
echo "  Add these 4 secrets to GitHub"
echo "  Repo → Settings → Secrets → Actions"
echo "================================================="
echo ""
echo "  ANDROID_KEY_ALIAS     → smartdev"
echo "  ANDROID_STORE_PASSWORD → (what you typed above)"
echo "  ANDROID_KEY_PASSWORD   → (what you typed above)"
echo ""
echo "  ANDROID_KEYSTORE_BASE64 → copy the output below:"
echo ""
base64 -w 0 $KEYSTORE_PATH
echo ""
echo ""
echo "================================================="
echo "  To publish a release:"
echo "================================================="
echo ""
echo "  git tag v1.0.0"
echo "  git push origin v1.0.0"
echo ""
