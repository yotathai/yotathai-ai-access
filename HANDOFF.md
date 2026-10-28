# HANDOFF — ช่างถึก AI (Yotathai Chrome Agent) v2.5.0
> ส่งต่อให้ AI ทุกค่าย (Claude / Gemini / Codex / Cursor) และผู้พัฒนาคนถัดไป · อัปเดตไฟล์นี้ทุกครั้งที่ทำงานเสร็จ

## 1. เป้าหมาย
ผู้ช่วยในแถบข้าง Chrome สั่งงานภาษาไทย ควบคุมเบราว์เซอร์ได้จริง ใช้ 0 โทเค็นขณะเฝ้ารอข้อความใหม่ มีโหมดตอบแชทอัตโนมัติ (Facebook Messenger, LINE OA Manager)

## 2. สถาปัตยกรรม
Chrome Side Panel (`extension/sidepanel.js`) ⇄ HTTP `127.0.0.1:19876` ⇄ `server/bridge_server.py` ⇄ AI (Antigravity / Claude CLI / API)
- Endpoint หลัก: `POST /api/agent` (สั่งงานเบราว์เซอร์), `POST /api/autoreply` (ตอบแชท), `GET/POST /api/trusted_contacts`, `GET /api/status`
- `_call_ai_universal()` เลือกทางเรียก AI: API key (ถ้ามีตัวแปรสภาพแวดล้อม + prompt caching) → Antigravity language server → `claude -p` CLI
- `find_antigravity_server()` รองรับ macOS และ Windows · OCR ใช้ tesseract (พาธ `/opt/homebrew/bin/tesseract` บน Mac — Windows/Linux ต้องแก้พาธหรือติดตั้งให้ตรง)

## 3. ความสามารถ (เวอร์ชันที่สะสมมา)
- v2.1 แยกหน้าต่าง + แยก AI อิสระต่อหน้าต่าง · v2.2 ประหยัดโทเค็น/prompt caching, เปิด Auto-Reply ด้วยคำสั่ง, ตรวจแชทยังไม่อ่าน, โพสต์ Facebook, พิมพ์ใน Messenger/LINE (contenteditable: `beforeinput` + `execCommand('insertText')` + `InputEvent`)
- v2.3 อ่านสลิปบนจอด้วย OCR, ล็อกเป้าหมายหลายขั้น (goal-locking) กันกดซ้ำ, เลื่อนกล่องซ้าย/ขวาอัจฉริยะ, สมุดจด `scratchpad_add` + ส่งออกตาราง .csv (UTF-8 BOM)
- v2.4–2.5 แก้พิมพ์ซ้ำใน Messenger Lexical, กรองเวลาในแชท, ทะลุ Shadow DOM/iframe, รองรับตัวแก้ข้อความหลาย textarea ของ LINE OA Manager

## 4. วิธีรัน
1. `chrome://extensions` → Developer mode → Load unpacked → เลือก `extension/`
2. เปิดตัวเชื่อม: Mac `start_bridge_mac.command` · Windows `start_bridge_windows.bat` (หรือ `python3 server/bridge_server.py`)
3. ตรวจ: `curl -s http://127.0.0.1:19876/api/status`
4. ตัวเลือกเรียก AI (เลือกอย่างน้อยหนึ่ง): ตั้ง `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` ในตัวแปรสภาพแวดล้อมก่อนรัน, หรือติดตั้ง Claude Code CLI (`claude`) และล็อกอินไว้, หรือเปิด Antigravity ทิ้งไว้

## 5. สถานะ / ค้าง
- ชุดนี้เป็นสำเนาสะอาดสำหรับแจกต่อ: ความจำ รายชื่อเพื่อน และประวัติแชท **ว่างเปล่า** ผู้ใช้ใหม่สร้างของตัวเอง
- ข้อความ prompt ในโค้ดบางส่วนยังเรียกผู้ใช้ว่า "คุณช่างถึก" (ผู้พัฒนาต้นฉบับ) — ควรเปลี่ยนเป็นชื่อผู้ใช้จาก `memory.json` ถ้าจะใช้จริง (ค้นคำว่า `คุณช่างถึก` ใน `sidepanel.js` และ `bridge_server.py`)
- ยังไม่ได้ทดสอบบน Windows ในชุดนี้ · ยังไม่มีชุดทดสอบอัตโนมัติ

## 6. ขั้นต่อไปที่แนะนำ
1. เปลี่ยนชื่อผู้ใช้ใน prompt ให้เป็นค่าตั้งได้ (ไม่ฝังชื่อ)
2. ทำหน้าตั้งค่าเลือก AI/ใส่คีย์ในแถบข้าง (เก็บใน `chrome.storage.local` ห้ามส่งขึ้น git)
3. เพิ่มทดสอบอัตโนมัติสำหรับตัวแยก JSON คำสั่งและตัวตรวจแชทใหม่
4. ย้าย `sidepanel.js` (ใหญ่ ~124 KB) แยกเป็นโมดูล
