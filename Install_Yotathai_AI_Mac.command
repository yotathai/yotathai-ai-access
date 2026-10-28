#!/bin/bash
clear
echo "========================================================"
echo "  🚀 กำลังติดตั้ง Yotathai AI ลงในเครื่อง Mac ของคุณอัตโนมัติ..."
echo "  (ไม่ต้องแตกไฟล์เอง ระบบกำลังจัดการให้ทั้งหมดครับ)"
echo "========================================================"
echo ""

INSTALL_DIR="$HOME/Yotathai_AI"
ZIP_PATH="/tmp/yotathai_ai_latest.zip"
EXTRACT_DIR="/tmp/yt_extract_mac"

mkdir -p "$INSTALL_DIR" "$HOME/.Trash"
if [ -d "$EXTRACT_DIR" ]; then mv "$EXTRACT_DIR" "$HOME/.Trash/yt_extract_mac_$(date +%s)"; fi

echo "[1/4] กำลังดาวน์โหลดระบบ Yotathai AI เวอร์ชันล่าสุด..."
curl -sL "https://github.com/yotathai/yotathai-ai-access/archive/refs/heads/main.zip" -o "$ZIP_PATH"

echo "[2/4] กำลังติดตั้งไฟล์ลงที่ $INSTALL_DIR ..."
unzip -q -o "$ZIP_PATH" -d "$EXTRACT_DIR"
cp -R "$EXTRACT_DIR/yotathai-ai-access-main/"* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/server/bridge_server.py"

echo "[3/4] กำลังเปิดระบบเชื่อม AI และตั้งค่าให้ทำงานอัตโนมัติทุกครั้งที่เปิดเครื่อง..."
PLIST_PATH="$HOME/Library/LaunchAgents/com.yotathai.chrome.agent.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.yotathai.chrome.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>$INSTALL_DIR/server/bridge_server.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH" 2>/dev/null
nohup python3 "$INSTALL_DIR/server/bridge_server.py" >/dev/null 2>&1 &

# คัดลอกที่อยู่โฟลเดอร์ใส่ Clipboard ให้กด Cmd+Shift+G แล้ววางได้เลย
printf "%s" "$INSTALL_DIR/extension" | pbcopy

echo "[4/4] กำลังเปิดหน้า Google Chrome..."
open -a "Google Chrome" "chrome://extensions"

echo ""
echo "========================================================"
echo "  ✅ ติดตั้งระบบหลังบ้านเสร็จสมบูรณ์ 100% แล้วครับ!"
echo "========================================================"
echo ""
echo "  📌 ขั้นตอนสุดท้ายในหน้า Google Chrome ที่เพิ่งเด้งขึ้นมา:"
echo "     1. เปิดสวิตช์ 'โหมดนักพัฒนาซอฟต์แวร์ (Developer mode)' มุมขวาบน"
echo "     2. กดปุ่ม 'โหลดส่วนขยายที่ยังไม่ได้แพ็ก (Load unpacked)' มุมซ้ายบน"
echo "     3. เลือกโฟลเดอร์ 'Yotathai_AI' -> 'extension' แล้วกดเลือกได้เลยครับ!"
echo "========================================================"
read -p "กดปุ่ม Enter เพื่อปิดหน้าต่างนี้..."
