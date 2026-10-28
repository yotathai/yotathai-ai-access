#!/bin/zsh
cd "$(dirname "$0")"
pkill -f "bridge_server.py" 2>/dev/null
nohup python3 server/bridge_server.py > bridge.log 2>&1 &
echo "เริ่มระบบเชื่อม ช่างถึก AI แล้วที่พอร์ต 19876"
