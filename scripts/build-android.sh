#!/bin/bash
set -e

export JAVA_HOME=/usr/local/sdkman/candidates/java/21.0.11-ms
export PATH=$JAVA_HOME/bin:$PATH
export ANDROID_HOME=/workspaces/meltonschsystm/android-sdk
export ANDROID_SDK_ROOT=/workspaces/meltonschsystm/android-sdk

ROOT=/workspaces/meltonschsystm

echo ""
echo "================================"
echo "  SmartDev Android Build"
echo "================================"
echo ""

echo "[1/4] Building web app..."
cd $ROOT && pnpm build

echo ""
echo "[2/4] Copying web assets to Android..."
cd $ROOT && npx cap copy android

echo ""
echo "[3/4] Building APK + AAB..."
cd $ROOT/android && ./gradlew assembleRelease bundleRelease

echo ""
echo "[4/4] Done!"
echo "  APK: android/app/build/outputs/apk/release/app-release.apk"
echo "  AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo ""
