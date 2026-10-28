#!/bin/zsh
cd "$(dirname "$0")"
echo "========================================================"
echo "  🤖 กำลังติดตั้งและเปิดใช้งาน Yotathai AI (สำหรับ macOS)..."
echo "========================================================"
TARGET_DIR="$HOME/Yotathai_AI_Bridge/server"
mkdir -p "$TARGET_DIR"
cp -f "server/bridge_server.py" "$TARGET_DIR/bridge_server.py"
chmod +x "$TARGET_DIR/bridge_server.py"
PLIST_PATH="$HOME/Library/LaunchAgents/com.yotathai.aibridge.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat <<PLIST > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.yotathai.aibridge</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/python3</string><string>$TARGET_DIR/bridge_server.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLIST
pkill -f "bridge_server.py" 2>/dev/null || true
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH" 2>/dev/null || true
nohup python3 "$TARGET_DIR/bridge_server.py" >/dev/null 2>&1 &
echo "✅ ติดตั้งและเปิดใช้งาน Yotathai AI สำเร็จเรียบร้อยแล้ว!"
sleep 2
