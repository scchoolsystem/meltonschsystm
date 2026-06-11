#!/bin/bash
# Run this ONCE in your Codespace to set up Android signing
# Then follow the instructions to add secrets to GitHub

set -e

KEYSTORE_PATH="android/smartdev-release.keystore"
KEY_ALIAS="smartdev"

echo ""
echo "================================================="
echo "  SmartDev Android Keystore Setup"
echo "================================================="
echo ""

# Check if keystore already exists
if [ -f "$KEYSTORE_PATH" ]; then
  echo "✅ Keystore already exists at $KEYSTORE_PATH"
  echo "   Skipping generation. Delete it first if you want to regenerate."
else
  echo "🔑 Generating release keystore..."
  echo "   You will be prompted to enter keystore details."
  echo "   IMPORTANT: Save the passwords you enter — you cannot recover them!"
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
echo "  GitHub Secrets You Must Set"
echo "================================================="
echo ""
echo "Go to: GitHub → Your Repo → Settings → Secrets → Actions"
echo ""
echo "Add these secrets:"
echo ""
echo "  ANDROID_KEYSTORE_BASE64   →  Run the command below and paste the output"
echo "  ANDROID_STORE_PASSWORD    →  The storePassword you entered above"
echo "  ANDROID_KEY_ALIAS         →  smartdev"
echo "  ANDROID_KEY_PASSWORD      →  The keyPassword you entered above"
echo ""
echo "--- Run this to get ANDROID_KEYSTORE_BASE64 ---"
echo ""
base64 -w 0 $KEYSTORE_PATH
echo ""
echo "------------------------------------------------"
echo ""
echo "Also make sure you have these existing secrets set:"
echo "  VITE_SUPABASE_URL"
echo "  VITE_SUPABASE_PUBLISHABLE_KEY"
echo "  VITE_SUPABASE_PROJECT_ID"
echo "  CLOUDFLARE_API_TOKEN"
echo ""
echo "================================================="
echo "  How to trigger a release"
echo "================================================="
echo ""
echo "  git tag v1.0.0"
echo "  git push origin v1.0.0"
echo ""
echo "This will automatically:"
echo "  ✅ Deploy website to Cloudflare Workers"
echo "  ✅ Build + upload Android APK + AAB"
echo "  ✅ Build + upload Desktop app (Windows, macOS, Linux)"
echo "  ✅ Create a GitHub Release with all files attached"
echo ""
