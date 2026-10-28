#!/usr/bin/env python3
"""
Yotathai Chrome Agent — Local Bridge Server (สำหรับคุณช่างถึก)
เชื่อมส่วนเสริม Chrome Side Panel เข้ากับโควตา Google AI Ultra (Antigravity Local Language Server)
โดยไม่เสียค่า API Token เพิ่มแม้แต่บาทเดียว พร้อมจำกฎเครือโยธาไทย (~/.gemini/GEMINI.md) อัตโนมัติ
"""

import base64
import hashlib
import hmac
import http.server
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zlib
from pathlib import Path

HOST = "127.0.0.1"
PORT = 19876
BASE_DIR = Path(__file__).resolve().parent.parent
MEMORY_FILE = BASE_DIR / "memory.json"
TRUSTED_CONTACTS_FILE = BASE_DIR / "trusted_contacts.json"
AUTHORIZED_EMAILS_FILE = BASE_DIR / "authorized_emails.json"
KNOWLEDGE_PACKS_FILE = BASE_DIR / "knowledge_packs.json"
LOCAL_ACCESS_CONTROL_FILE = BASE_DIR / "access_control.json"
GEMINI_MD_PATH = Path.home() / ".gemini" / "GEMINI.md"

REMOTE_ACCESS_URL = "https://raw.githubusercontent.com/yotathai/yotathai-ai-access/main/access_control.json"

_REMOTE_CACHE = {
    "access_ts": 0,
    "access_data": None,
    "last_email": "",
    "last_auth": None
}


def _decrypt_user_vault(vault_b64, email_clean, salt_hex):
    """ถอดรหัสตู้เซฟความรู้เฉพาะในหน่วยความจำ (RAM) ด้วยกุญแจผูกกับอีเมลจริงของผู้มีสิทธิ์ (PBKDF2-HMAC-SHA256)"""
    try:
        raw = base64.b64decode(vault_b64)
        if len(raw) <= 32:
            return None
        tag = raw[:32]
        ciphertext = raw[32:]
        salt_bytes = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", email_clean.encode("utf-8"), salt_bytes, 100000, dklen=64)
        enc_key = dk[:32]
        mac_key = dk[32:]
        expected_tag = hmac.new(mac_key, ciphertext, hashlib.sha256).digest()
        if not hmac.compare_digest(tag, expected_tag):
            return None
        out = bytearray(len(ciphertext))
        for blk_idx in range(0, len(ciphertext), 32):
            counter = (blk_idx // 32).to_bytes(4, "big")
            ks = hmac.new(enc_key, salt_bytes + counter, hashlib.sha256).digest()
            chunk = ciphertext[blk_idx:blk_idx + 32]
            for j, b in enumerate(chunk):
                out[blk_idx + j] = b ^ ks[j]
        plain_bytes = zlib.decompress(bytes(out))
        return json.loads(plain_bytes.decode("utf-8"))
    except Exception:
        return None


def _fetch_remote_json(url, cache_key_ts, cache_key_data, ttl=180):
    now = time.time()
    if _REMOTE_CACHE.get(cache_key_data) and (now - _REMOTE_CACHE.get(cache_key_ts, 0) < ttl):
        return _REMOTE_CACHE[cache_key_data]
    try:
        req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            _REMOTE_CACHE[cache_key_ts] = now
            _REMOTE_CACHE[cache_key_data] = data
            return data
    except Exception:
        if LOCAL_ACCESS_CONTROL_FILE.exists():
            try:
                return json.loads(LOCAL_ACCESS_CONTROL_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        return _REMOTE_CACHE.get(cache_key_data)


def _load_local_master_knowledge(pack_ids):
    """เฉพาะเครื่องแม่ของคุณช่างถึก: อ่านจากไฟล์ในเครื่องแม่โดยตรง"""
    if not pack_ids or not KNOWLEDGE_PACKS_FILE.exists():
        return ""
    try:
        local_kp = json.loads(KNOWLEDGE_PACKS_FILE.read_text(encoding="utf-8"))
        packs_dict = local_kp.get("packs", {})
        sections = []
        for pid in pack_ids:
            p = packs_dict.get(pid)
            if isinstance(p, dict) and p.get("content"):
                sections.append(f"### 📚 {p.get('title', pid)}\n{p['content']}")
        return "\n\n".join(sections)
    except Exception:
        return ""


def check_email_authorization(email):
    """ตรวจสอบสิทธิ์อีเมลและถอดรหัสฐานความรู้ในหน่วยความจำ (RAM) เท่านั้น ไม่ทิ้งไฟล์ความรู้ไว้ในเครื่องผู้เรียน"""
    email_clean = (email or "").strip().lower()
    if not email_clean:
        if is_master_owner():
            packs = ["rakaklang_2569", "takeoff_boq", "law_procurement"]
            return {
                "authorized": True,
                "email": "aphisit8118@gmail.com",
                "name": "คุณช่างถึก",
                "tier": "master",
                "packs": packs,
                "knowledge_docs": _load_local_master_knowledge(packs)
            }
        return {"authorized": False, "email": "", "name": "", "tier": "unauthorized", "packs": [], "knowledge_docs": ""}

    email_hash = hashlib.sha256(email_clean.encode("utf-8")).hexdigest()

    # 1. ตรวจสอบจากตู้เซฟเข้ารหัสออนไลน์ (GitHub Encrypted Access Vault - 0 บาท และปลอดภัย 100%)
    remote_data = _fetch_remote_json(REMOTE_ACCESS_URL, "access_ts", "access_data", ttl=180)
    if isinstance(remote_data, dict):
        for u in remote_data.get("users", []):
            u_hash = (u.get("email_sha256") or u.get("id") or "").strip().lower()
            if u_hash == email_hash and u.get("vault") and u.get("salt"):
                decrypted = _decrypt_user_vault(u["vault"], email_clean, u["salt"])
                if isinstance(decrypted, dict):
                    res = {
                        "authorized": True,
                        "email": email_clean,
                        "name": decrypted.get("name") or email_clean,
                        "tier": decrypted.get("tier") or "pro_construction",
                        "packs": decrypted.get("packs") or [],
                        "knowledge_docs": decrypted.get("knowledge_docs") or ""
                    }
                    _REMOTE_CACHE["last_email"] = email_clean
                    _REMOTE_CACHE["last_auth"] = res
                    return res

    # 2. เฉพาะเครื่องแม่ของคุณช่างถึก (มีไฟล์ authorized_emails.json ในเครื่องแม่)
    if AUTHORIZED_EMAILS_FILE.exists():
        try:
            local_data = json.loads(AUTHORIZED_EMAILS_FILE.read_text(encoding="utf-8"))
            for u in local_data.get("users", []):
                u_email = (u.get("email") or "").strip().lower()
                if u_email == email_clean:
                    packs = u.get("packs") or ["rakaklang_2569", "takeoff_boq", "law_procurement"]
                    res = {
                        "authorized": True,
                        "email": email_clean,
                        "name": u.get("name") or email_clean,
                        "tier": u.get("tier") or "pro_construction",
                        "packs": packs,
                        "knowledge_docs": _load_local_master_knowledge(packs)
                    }
                    _REMOTE_CACHE["last_email"] = email_clean
                    _REMOTE_CACHE["last_auth"] = res
                    return res
        except Exception:
            pass

    res = {"authorized": False, "email": email_clean, "name": "", "tier": "unauthorized", "packs": [], "knowledge_docs": ""}
    _REMOTE_CACHE["last_email"] = email_clean
    _REMOTE_CACHE["last_auth"] = res
    return res


def get_authorized_knowledge_docs(auth_info_or_packs):
    """ดึงชุดฐานความรู้ที่ถอดรหัสอยู่ในหน่วยความจำ (RAM) เท่านั้น"""
    if isinstance(auth_info_or_packs, dict):
        return auth_info_or_packs.get("knowledge_docs") or ""
    if is_master_owner() and isinstance(auth_info_or_packs, list):
        return _load_local_master_knowledge(auth_info_or_packs)
    cached_auth = _REMOTE_CACHE.get("last_auth")
    if isinstance(cached_auth, dict) and cached_auth.get("authorized"):
        return cached_auth.get("knowledge_docs") or ""
    return ""

DEFAULT_TRUSTED_CONTACTS = [
    "พี่นาย น่าน"
]


def load_trusted_contacts():
    if not TRUSTED_CONTACTS_FILE.exists():
        TRUSTED_CONTACTS_FILE.write_text(json.dumps(DEFAULT_TRUSTED_CONTACTS, ensure_ascii=False, indent=2), encoding="utf-8")
        return list(DEFAULT_TRUSTED_CONTACTS)
    try:
        data = json.loads(TRUSTED_CONTACTS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
        return list(DEFAULT_TRUSTED_CONTACTS)
    except Exception:
        return list(DEFAULT_TRUSTED_CONTACTS)


def save_trusted_contacts(contacts):
    cleaned = []
    for c in contacts:
        s = str(c).strip()
        if s and s not in cleaned:
            cleaned.append(s)
    TRUSTED_CONTACTS_FILE.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), encoding="utf-8")
    return cleaned


def extract_attachment_content(attachment):
    """ถอดข้อความหรือ OCR จากรูปภาพและไฟล์ที่แนบมา (PDF, รูปภาพ, TXT, CSV, JSON)"""
    if not attachment or not attachment.get("data"):
        return ""
    name = attachment.get("name", "ไฟล์แนบ")
    raw_data = attachment.get("data", "")
    mime = attachment.get("type", "")

    # Decode base64 data URI
    try:
        if "," in raw_data:
            base64_str = raw_data.split(",", 1)[1]
        else:
            base64_str = raw_data
        file_bytes = base64.b64decode(base64_str)
    except Exception as e:
        return f"[ไฟล์แนบ: {name} (ไม่สามารถอ่านข้อมูล base64 ได้: {e})]"

    # If it is a text-based file
    if any(name.lower().endswith(ext) for ext in [".txt", ".csv", ".json", ".md", ".html", ".js", ".py", ".sh", ".log"]):
        try:
            text = file_bytes.decode("utf-8", errors="replace")[:6000]
            return f"\n[เนื้อหาจากไฟล์แนบ: {name}]\n{text}\n"
        except Exception:
            pass

    # If it is a PDF
    if name.lower().endswith(".pdf") or "pdf" in mime.lower():
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pages_text = []
            for i, page in enumerate(reader.pages[:10]):
                p_text = page.extract_text() or ""
                if p_text.strip():
                    pages_text.append(f"--- หน้า {i+1} ---\n{p_text.strip()}")
            if pages_text:
                joined = "\n".join(pages_text)[:6000]
                return f"\n[เนื้อหาจากเอกสาร PDF: {name}]\n{joined}\n"
        except Exception as e:
            pass

    # If it is an image, perform OCR with Tesseract
    if attachment.get("isImage") or any(name.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"]):
        ocr_result = ""
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
            tf.write(file_bytes)
            tf_path = tf.name
        try:
            # Run tesseract with Thai and English
            cmd = ["/opt/homebrew/bin/tesseract", tf_path, "stdout", "-l", "tha+eng", "--psm", "3"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=12)
            ocr_text = res.stdout.strip()
            if ocr_text:
                ocr_result = f"\n[ข้อความที่ตรวจพบในรูปภาพ ({name}) ด้วย OCR]:\n{ocr_text[:4000]}\n"
            else:
                ocr_result = f"\n[รูปภาพแนบ: {name} (ตรวจไม่พบตัวอักษรชัดเจนในภาพ)]\n"
        except Exception:
            ocr_result = f"\n[รูปภาพแนบ: {name} ขนาด {len(file_bytes)//1024} KB]\n"
        finally:
            try:
                os.remove(tf_path)
            except Exception:
                pass
        return ocr_result

    return f"\n[ไฟล์แนบ: {name} ขนาด {len(file_bytes)//1024} KB]\n"

DEFAULT_MEMORIES = [
    "ผู้ใช้งานคือ คุณช่างถึก (อภิสิทธิ์ มากสุวรรณ) ต้องเรียกขานว่า 'คุณช่างถึก' เสมอ",
    "ของแจกฟรีต้องอยู่บน Cloudflare R2 (data.yotathai.org) ของขาย/เช่า/สมาชิกอยู่บน Firebase (yotathai-board)",
    "ห้ามมั่วตัวเลข ห้ามแต่งข้อมูลจำลองเด็ดขาด ข้อมูลราคากลางและวิศวกรรมต้องเป็นความจริง 100%",
    "เวลาจองตั๋วหรือทำรายการจ่ายเงิน ให้กรอกและเลือกตัวเลือกไปจนถึงหน้าสรุปราคาแล้วหยุดรอให้คุณช่างถึกกดยืนยันจ่ายเงินเองเสมอ"
]


def is_master_owner():
    """ตรวจสอบว่าเป็นเครื่องของคุณช่างถึกหรือไม่"""
    try:
        if "yotathai" in str(Path.home()).lower():
            return True
        mems = load_memories()
        if any("ช่างถึก" in str(m) for m in mems[:3]):
            return True
    except Exception:
        pass
    return False

def load_memories():
    if not MEMORY_FILE.exists():
        default_list = list(DEFAULT_MEMORIES) if "yotathai" in str(Path.home()).lower() else [
            "เวลาจองตั๋วหรือทำรายการจ่ายเงิน ให้กรอกและเลือกตัวเลือกไปจนถึงหน้าสรุปราคาแล้วหยุดรอให้ผู้ใช้กดยืนยันจ่ายเงินเองเสมอ",
            "ส่วนขยายรองรับการพิมพ์และโพสต์ใน Facebook และพิมพ์แชท Facebook Messenger / LINE / LINE OA Manager ได้สมบูรณ์ 100%"
        ]
        MEMORY_FILE.write_text(json.dumps(default_list, ensure_ascii=False, indent=2), encoding="utf-8")
        return default_list
    try:
        return json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return list(DEFAULT_MEMORIES)


def save_memories(memories):
    MEMORY_FILE.write_text(json.dumps(memories, ensure_ascii=False, indent=2), encoding="utf-8")


def find_antigravity_server():
    """ค้นหาพอร์ตและ CSRF Token ของ Antigravity language_server ที่รันอยู่ในเครื่อง (รองรับทั้ง macOS และ Windows)"""
    try:
        if os.name == "nt":
            # สำหรับเครื่อง Windows: ดึง CommandLine และ ProcessId ของ language_server จาก PowerShell/WMIC
            ps_cmd = [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*language_server*' -and $_.CommandLine -like '*--csrf_token*' } | Select-Object -First 1 -Property ProcessId,CommandLine | ConvertTo-Json -Compress"
            ]
            proc_out = subprocess.check_output(ps_cmd, text=True, stderr=subprocess.DEVNULL).strip()
            if not proc_out:
                return None, []
            proc_info = json.loads(proc_out)
            pid = str(proc_info.get("ProcessId", "")).strip()
            cmd_line = str(proc_info.get("CommandLine", ""))
            m = re.search(r"--csrf_token\s+([a-f0-9-]+)", cmd_line, re.I)
            if not pid or not m:
                return None, []
            csrf = m.group(1)

            net_out = subprocess.check_output(["netstat", "-ano", "-p", "TCP"], text=True, stderr=subprocess.DEVNULL)
            ports = []
            for nline in net_out.splitlines():
                if "LISTENING" in nline and nline.strip().endswith(f" {pid}"):
                    pm = re.search(r"127\.0\.0\.1:(\d+)", nline)
                    if pm:
                        ports.append(pm.group(1))
            return csrf, ports

        # สำหรับเครื่อง macOS
        ps_out = subprocess.check_output(["ps", "aux"], text=True)
        target_lines = [
            line for line in ps_out.splitlines()
            if "language_server" in line and "--csrf_token" in line
        ]
        if not target_lines:
            return None, []
        line = target_lines[0]
        pid = line.split()[1]
        m = re.search(r"--csrf_token\s+([a-f0-9-]+)", line)
        if not m:
            return None, []
        csrf = m.group(1)
        lsof_out = subprocess.check_output(
            ["lsof", "-a", "-p", pid, "-i", "TCP", "-P", "-n"],
            text=True
        )
        ports = re.findall(r"127\.0\.0\.1:(\d+)\s+\(LISTEN\)", lsof_out)
        return csrf, ports
    except Exception:
        return None, []


def call_language_server(method, payload=None, timeout=45):
    if payload is None:
        payload = {}
    csrf, ports = find_antigravity_server()
    if not csrf or not ports:
        raise RuntimeError("ไม่พบกระบวนการ Antigravity ที่เปิดอยู่ กรุณาเปิดแอป Antigravity ทิ้งไว้ในเครื่อง")

    body = json.dumps(payload).encode("utf-8")
    last_err = None
    for port in ports:
        url = f"http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/{method}"
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-codeium-csrf-token": csrf
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code != 400:
                last_err = f"HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:200]}"
        except Exception as e:
            last_err = str(e)
    raise RuntimeError(last_err or "ไม่สามารถเชื่อมต่อพอร์ต Antigravity ได้")


def estimate_tokens(text):
    """ประเมินจำนวน Token โดยประมาณ (รองรับทั้งภาษาไทยและอังกฤษ)"""
    if not text:
        return 0
    return max(1, int(len(text) / 2.8))


def build_static_prefix(memories, trusted_contacts=None, reference_docs=""):
    """
    1) Static Prefix (ส่วนคงที่ 100% อยู่บนสุดเสมอ):
       - System Prompt
       - กฎเหล็กเครือโยธาไทยและความจำถาวร (memory.json + trusted_contacts.json)
       - คู่มือคำสั่ง JSON (JSON Action Schema Manual)
       *ห้ามมี Timestamp, URL ปัจจุบัน, หรือข้อมูลที่เปลี่ยนตามเวลาแทรกในก้อนนี้เด็ดขาด เพื่อให้ Cache Hit 100%*
    """
    mem_text = "\n".join(f"- {m}" for m in memories)
    trusted_list = trusted_contacts if trusted_contacts is not None else load_trusted_contacts()
    trusted_text = ", ".join(trusted_list) if trusted_list else "(ยังไม่มี)"

    ref_section = f"\n[เอกสารอ้างอิงคงที่]\n{reference_docs.strip()}\n" if reference_docs else ""

    owner_title = "คุณช่างถึก (อภิสิทธิ์ มากสุวรรณ)" if is_master_owner() else "ผู้ใช้งาน"
    owner_call = "คุณช่างถึก" if is_master_owner() else "คุณผู้ใช้งาน"

    return f"""คุณคือ "Yotathai AI" (v2.6) ผู้ช่วยอัจฉริยะที่ฝังอยู่ในแถบด้านข้าง Google Chrome ของ{owner_title}
คุณมีความสามารถสั่งควบคุม Google Chrome ได้โดยตรง (เปิดเว็บ, คลิกปุ่ม, พิมพ์ข้อความลงแชท Facebook Messenger / LINE / LINE OA Manager (`manager.line.biz`) / ช่องค้นหา / ฟอร์ม ทะลุ Shadow DOM & iframe 100%, เลื่อนหน้าจอแยกฝั่งซ้าย/ขวา, แคปหน้าจออ่านภาพสลิปด้วย OCR)

[ความจำถาวรและกติกาของผู้ใช้งาน]
{mem_text}

[รายชื่อคนสนิทที่ไว้ใจให้แชทเหมือนเจ้าของเครื่องคุยเอง (โหมดคุยเหมือนผม)]
{trusted_text}
*(หมายเหตุ: คนอื่นๆ นอกรายชื่อนี้ เมื่อทักแชทเข้ามา ระบบจะใช้โหมดที่ 1 คือบอกตรงๆ ว่าเป็น Yotathai AI ผู้ช่วย)*{ref_section}

[คู่มือคำสั่ง JSON และรูปแบบการตอบกลับ — บังคับตอบเป็น JSON ก้อนเดียวเท่านั้น ห้ามมีข้อความอื่นนอก JSON]
ตอบกลับเป็น JSON ตามโครงสร้างนี้เท่านั้น:
{{
  "reply": "ข้อความตอบกลับอย่างสุภาพ กระชับ ตรงประเด็น (เรียกแทนผู้ใช้ว่า {owner_call} เสมอ)",
  "memory_to_save": "หากคุณช่างถึกสั่งให้จำข้อมูลใหม่หรือบอกความชอบส่วนตัว ให้สรุปสั้นๆ ใส่ตรงนี้ ถ้าไม่มีให้ใส่ null",
  "scratchpad_add": "หากกำลังทำงานหลายขั้นตอนเพื่อรวบรวมข้อมูลข้ามห้องแชท/ข้ามหน้า (เช่น จดชื่อผู้โอน ยอดสลิป วันที่ เวลา รุ่นหาดใหญ่/กระบี่) ให้จดบันทึกข้อมูลที่พบในขั้นตอนนี้ใส่ตรงนี้เพื่อสะสมไว้สรุปตารางตอนจบ ถ้าไม่มีใส่ null",
  "add_trusted_contact": "หากคุณช่างถึกสั่งว่าคนนี้เป็นคนสนิท/คนที่ไว้ใจ หรือสั่งให้ 'คุยเหมือนผมคุยเอง' กับใคร ให้ใส่ชื่อคู่สนทนาคนนั้นตรงนี้ (ถ้าไม่ได้ระบุชื่อในคำสั่ง ให้ดูชื่อคู่สนทนาจากหน้าจอแชทปัจจุบัน) ถ้าไม่มีใส่ null",
  "remove_trusted_contact": "หากคุณช่างถึกสั่งให้เลิกคุยเหมือนตัวเองกับใคร หรือสั่งให้สลับไปบอกเขาตรงๆ ว่าเป็น AI ให้ใส่ชื่อคนนั้นตรงนี้ ถ้าไม่มีใส่ null",
  "enable_auto_reply": null, // ตั้งเป็น true ทันทีหากคุณช่างถึกสั่งให้ "ตอบแชทอัตโนมัติ", "คุยอัตโนมัติ", "เมื่อเขาตอบมาให้โต้ตอบทันทีไม่ต้องรอสั่งซ้ำ" หรือตั้งเป็น false หากสั่งให้หยุดตอบแชทอัตโนมัติ (ถ้าไม่ได้พูดถึงให้ใส่ null)
  "actions": [
    // ถ้าต้องสั่งงานเบราว์เซอร์ ให้ใส่รายการคำสั่งด้านล่าง (ถ้าแค่ตอบคำถามทั่วไป ให้ใส่ [])
    // 1. เปิดเว็บไซต์: {{"type": "navigate", "url": "https://..."}}
    //    *เทคนิคค้นหาตั๋วเครื่องบินให้เร็วและไม่ค้างที่ปฏิทิน*:
    //    - หากหาตั๋ว AirAsia ให้ใช้ navigate ไปที่ URL ค้นหาโดยตรง เช่น "https://www.airasia.com/flights/search/?origin=CEI&destination=DMK&departDate=16/10/2026&tripType=O&adult=1&locale=th-th" (เปลี่ยนรหัสสนามบินและวันที่ DD/MM/YYYY ตามคำสั่ง)
    //    - หากหาตั๋ว Google Flights ให้ใช้ "https://www.google.com/travel/flights?q=Flights+from+CEI+to+BKK+on+2026-10-16+one+way&hl=th&curr=THB"
    // 2. คลิกปุ่ม/ลิงก์/ห้องแชท/วันที่ในปฏิทิน: {{"type": "click", "id": 12, "label": "ชื่อปุ่มหรือชื่อห้องแชท"}}
    //    *เทคนิคกดปฏิทินหรือตัวเลือก Dropdown*: หากต้องกดวันที่ (เช่น วันที่ 16) แต่ไม่เห็น id ในรายการ ให้ส่ง {{"type": "click", "id": 0, "label": "16"}} ได้เลย ระบบจะค้นหาตัวเลข "16" บนปฏิทินแล้วคลิกให้โดยตรง
    // 3. พิมพ์ข้อความลงช่องโพสต์ Facebook / ช่องแชท Messenger / LINE / LINE OA Manager (`manager.line.biz`) / ช่องค้นหา:
    //    {{"type": "type", "id": 1, "boxIndex": 1, "value": "ข้อความที่จะพิมพ์", "pressEnter": true}}
    //    *สำคัญมาก (v2.5 รองรับทะลุ Shadow DOM, iframe, <textarea> และ Rich Text Editor ของ LINE OA Manager / Vue.js / React 100%)*:
    //    - ในหน้าที่มีหลายกล่องข้อความ (เช่น LINE OA Manager ข้อความทักทายเพื่อนใหม่ ที่มี กล่องที่ 1 และ กล่องที่ 2):
    //      สามารถระบุ "id" ตามรายการ `[id] <textarea[box=1]>` / `<textarea[box=2]>` หรือระบุ `"boxIndex": 1` (สำหรับกล่องที่ 1) และ `"boxIndex": 2` (สำหรับกล่องที่ 2) แยกกันได้เลย!
    //      ตัวอย่างพิมพ์ 2 กล่องแล้วกดบันทึก:
    //      [
    //        {{"type": "type", "id": 1, "boxIndex": 1, "value": "ข้อความกล่องที่ 1", "pressEnter": false}},
    //        {{"type": "type", "id": 2, "boxIndex": 2, "value": "ข้อความกล่องที่ 2", "pressEnter": true}}
    //      ]
    //    - เมื่อคุณช่างถึกสั่งให้ "โพสต์ Facebook" หรือ "พิมพ์แชท Messenger/LINE" หรือ "แก้ไขข้อความ LINE OA" ต้องใส่คำสั่ง {{"type": "type", ...}} ใน actions เสมอ!
    // 4. เลื่อนหน้าจออัจฉริยะ (รองรับ LINE OA / Messenger แยกฝั่งซ้าย-ขวา):
    //    {{"type": "scroll", "direction": "down", "target": "main", "amount": 450}}
    //    - ตั้ง "target": "left" เมื่อต้องการเลื่อนรายชื่อห้องแชทฝั่งซ้าย (เช่น ใน LINE OA chat.line.biz หรือ Messenger)
    //    - ตั้ง "target": "right" เมื่อต้องการเลื่อนดูข้อความ/รูปสลิปในห้องแชทฝั่งขวา (direction: "up" เพื่อเลื่อนย้อนดูข้อความเก่า หรือ "down" เพื่อลงล่างสุด)
    //    - ตั้ง "target": "main" สำหรับหน้าเว็บทั่วไป
    // 5. แคปหน้าจออ่านภาพสลิปโอนเงิน / รูปภาพบนหน้าจอด้วย OCR: {{"type": "read_screen_ocr"}}
    //    - ใช้คำสั่งนี้ทันทีเมื่อเปิดห้องแชท LINE OA หรือ Messenger แล้วเห็นว่ามีรูปภาพสลิปโอนเงิน หรือคุณช่างถึกสั่งให้อ่านสลิป/อ่านภาพบนหน้าจอ แล้วตั้ง continue_after_actions: true เพื่ออ่านข้อความที่สกัดได้จากภาพในขั้นตอนถัดไป!
    // 6. รอโหลด: {{"type": "wait", "ms": 1500}}
    // 7. เปิดแท็บใหม่: {{"type": "new_tab", "url": "https://..."}}
  ],
  "continue_after_actions": false // ตั้งเป็น true หากสั่งเปิดเว็บ คลิกห้องแชท เลื่อนหน้าจอ หรือสั่ง read_screen_ocr แล้วต้องรออ่านผลลัพธ์ในขั้นตอนถัดไป
}}"""


def build_dynamic_context(user_prompt, history, snapshot, attachment=None):
    """
    2) Dynamic Context (ส่วนที่เปลี่ยนไปเรื่อยๆ อยู่ท้ายสุดเสมอ):
       - URL และชื่อหน้าเว็บปัจจุบัน
       - Compact Interactive DOM Elements (เฉพาะ id, tag, text, placeholder)
       - เนื้อหาหน้าเว็บย่อ และไฟล์แนบ
       - ประวัติแชทล่าสุด และคำสั่งล่าสุดของคุณช่างถึก
    """
    hist_lines = []
    for h in (history or [])[-8:]:
        role = "คุณช่างถึก" if h.get("role") == "user" else "ช่างถึก AI"
        hist_lines.append(f"{role}: {h.get('content', '')}")
    hist_text = "\n".join(hist_lines) if hist_lines else "(เริ่มบทสนทนาใหม่)"

    attached_text = extract_attachment_content(attachment) if attachment else ""

    url = snapshot.get("url", "")
    title = snapshot.get("title", "")
    elements = snapshot.get("elements", [])
    page_text = (snapshot.get("pageText", "") or "")[:2000]
    audit = snapshot.get("audit")

    el_lines = []
    for el in elements[:100]:
        line = f"[{el.get('id')}] <{el.get('tag')}>"
        if el.get("text"):
            line += f" text=\"{el.get('text')}\""
        if el.get("placeholder"):
            line += f" placeholder=\"{el.get('placeholder')}\""
        el_lines.append(line)
    el_block = "\n".join(el_lines) if el_lines else "(ไม่มีปุ่มที่เข้าถึงได้ในหน้านี้ หรือเป็นหน้าแท็บใหม่ ให้ใช้คำสั่ง navigate เพื่อเปิด URL ได้เลย)"

    audit_block = ""
    if audit:
        audit_block = (
            f"\n[ผลตรวจหน้าเว็บตามกฎโยธาไทย]\n"
            f"- จำนวนรูปทั้งหมด: {audit.get('totalImages', 0)}\n"
            f"- รูปเสีย (Broken Images): {json.dumps(audit.get('brokenImages', []), ensure_ascii=False)}\n"
            f"- ลิงก์ Google Storage/Drive ที่หลุด: {json.dumps(audit.get('googleLeakUrls', []), ensure_ascii=False)}\n"
        )

    return f"""[สถานะแท็บ Chrome ปัจจุบัน]
- URL: {url}
- Title: {title}
{audit_block}
[รายการ Interactive Elements บนหน้าเว็บปัจจุบัน (เฉพาะ id, tag, text, placeholder)]
{el_block}

[เนื้อหาข้อความบนหน้าเว็บปัจจุบัน]
{page_text}
{attached_text}
[ประวัติการสนทนาล่าสุด]
{hist_text}

[คำสั่งล่าสุดจากคุณช่างถึก]
{user_prompt}"""


def build_agent_prompt(user_prompt, history, snapshot, memories, trusted_contacts=None, attachment=None):
    """ประกอบ Prompt แบบแยก Static Prefix (บนสุด) + Dynamic Context (ล่างสุด) เพื่อทำ Prompt Caching 100%"""
    static_prefix = build_static_prefix(memories, trusted_contacts=trusted_contacts)
    dynamic_context = build_dynamic_context(user_prompt, history, snapshot, attachment=attachment)
    return f"{static_prefix}\n\n{dynamic_context}"


class PromptCacheManager:
    """
    ตัวจัดการ Prompt Caching อัจฉริยะ รองรับ 3 ค่ายหลัก + Local Bridge:
    1. Gemini API: หาก Static Prefix >= 32,768 Tokens จะสร้าง CachedContent (cachedContents API) อัตโนมัติและส่ง cachedContent ID แทนการส่งซ้ำ
    2. Claude API: แนบ "cache_control": {"type": "ephemeral"} ที่ท้ายก้อน System Prompt (เมื่อ >= 1,024 Tokens)
    3. OpenAI API: จัดเรียง Static Prefix ไว้ใน message แรกสุด (role="system") เพื่อให้เข้าเงื่อนไข Automatic Prefix Caching
    """
    GEMINI_MIN_CACHE_TOKENS = 32768
    CLAUDE_MIN_CACHE_TOKENS = 1024
    OPENAI_MIN_CACHE_TOKENS = 1024

    def __init__(self):
        self._gemini_caches = {}  # prefix_hash -> {"name": "cachedContents/...", "expires_at": float}
        self.stats = {
            "total_calls": 0,
            "prefix_cache_hits": 0,
            "last_prefix_hash": None,
            "last_static_tokens": 0,
            "last_dynamic_tokens": 0,
            "estimated_saved_tokens": 0
        }

    def compute_hash(self, static_prefix):
        return hashlib.sha256(static_prefix.encode("utf-8")).hexdigest()[:16]

    def record_usage(self, static_prefix, dynamic_context):
        p_hash = self.compute_hash(static_prefix)
        s_tokens = estimate_tokens(static_prefix)
        d_tokens = estimate_tokens(dynamic_context)
        self.stats["total_calls"] += 1
        self.stats["last_static_tokens"] = s_tokens
        self.stats["last_dynamic_tokens"] = d_tokens
        if self.stats["last_prefix_hash"] == p_hash:
            self.stats["prefix_cache_hits"] += 1
            self.stats["estimated_saved_tokens"] += int(s_tokens * 0.9)
        self.stats["last_prefix_hash"] = p_hash
        return p_hash, s_tokens, d_tokens

    def build_claude_payload(self, static_prefix, dynamic_context, model="claude-3-7-sonnet-latest", max_tokens=2048):
        """สร้าง Payload สำหรับ Claude API พร้อม cache_control: ephemeral"""
        system_block = {
            "type": "text",
            "text": static_prefix,
            "cache_control": {"type": "ephemeral"}
        }
        return {
            "model": model,
            "max_tokens": max_tokens,
            "system": [system_block],
            "messages": [
                {"role": "user", "content": dynamic_context}
            ]
        }

    def build_openai_payload(self, static_prefix, dynamic_context, model="gpt-4o"):
        """สร้าง Payload สำหรับ OpenAI API แบบ Prefix Matching (Automatic Prompt Caching)"""
        return {
            "model": model,
            "messages": [
                {"role": "system", "content": static_prefix},
                {"role": "user", "content": dynamic_context}
            ],
            "temperature": 0.2
        }

    def get_or_create_gemini_cache(self, static_prefix, api_key, model="models/gemini-2.5-pro", ttl_seconds=3600):
        """
        ตรวจสอบขนาด Static Prefix:
        หากเกิน 32,768 Tokens จะเรียก Gemini Cache Manager (v1beta/cachedContents) สร้าง CachedContent
        และคืนค่า cachedContent ID (เช่น 'cachedContents/abc123xyz') เพื่อส่งแทนข้อความเต็ม
        """
        s_tokens = estimate_tokens(static_prefix)
        if s_tokens < self.GEMINI_MIN_CACHE_TOKENS or not api_key:
            return None

        p_hash = self.compute_hash(static_prefix)
        now = time.time()
        cached = self._gemini_caches.get(p_hash)
        if cached and cached.get("expires_at", 0) > now + 60:
            return cached["name"]

        url = f"https://generativelanguage.googleapis.com/v1beta/cachedContents?key={api_key}"
        body = {
            "model": model if model.startswith("models/") else f"models/{model}",
            "systemInstruction": {
                "parts": [{"text": static_prefix}]
            },
            "ttl": f"{int(ttl_seconds)}s"
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cache_name = data.get("name")
                if cache_name:
                    self._gemini_caches[p_hash] = {
                        "name": cache_name,
                        "expires_at": now + ttl_seconds
                    }
                    return cache_name
        except Exception:
            pass
        return None

    def build_gemini_payload(self, static_prefix, dynamic_context, api_key=None, model="models/gemini-2.5-pro"):
        """
        สร้าง Payload สำหรับ Gemini API:
        - ถ้ามี cachedContent ID (เมื่อ >= 32,768 tokens) จะอ้างอิง cachedContent ทันทีโดยไม่ส่ง static_prefix ซ้ำ
        - ถ้าไม่ถึง 32,768 tokens จะวาง static_prefix ไว้ใน systemInstruction ส่วนบนสุด เพื่อรับ Implicit Prefix Caching
        """
        cache_name = self.get_or_create_gemini_cache(static_prefix, api_key=api_key, model=model)
        if cache_name:
            return {
                "cachedContent": cache_name,
                "contents": [
                    {"role": "user", "parts": [{"text": dynamic_context}]}
                ]
            }
        return {
            "systemInstruction": {
                "parts": [{"text": static_prefix}]
            },
            "contents": [
                {"role": "user", "parts": [{"text": dynamic_context}]}
            ]
        }


PROMPT_CACHE = PromptCacheManager()


def extract_json_object(raw_text):
    raw_text = raw_text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.S)
    if fence:
        try:
            return json.loads(fence.group(1))
        except Exception:
            pass
    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw_text[start:end + 1])
        except Exception:
            pass
    return {
        "reply": raw_text,
        "memory_to_save": None,
        "add_trusted_contact": None,
        "remove_trusted_contact": None,
        "actions": [],
        "continue_after_actions": False
    }


def is_partner_trusted(partner_name, trusted_contacts):
    if not partner_name or not trusted_contacts:
        return False
    p_low = partner_name.strip().lower()
    for t in trusted_contacts:
        t_low = str(t).strip().lower()
        if t_low and (t_low in p_low or p_low in t_low):
            return True
    return False


class BridgeHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send_json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/api/status":
            try:
                st = call_language_server("GetUserStatus", {}, timeout=4)
                user_status = st.get("userStatus", {})
                email = (user_status.get("email") or "").strip().lower()
                auth_info = check_email_authorization(email)

                if not auth_info.get("authorized"):
                    self._send_json(200, {
                        "ok": False,
                        "unauthorized": True,
                        "version": "2.6.0",
                        "email": email,
                        "error": f"🔒 บัญชี {email or 'นี้'} ยังไม่ได้รับสิทธิ์ใช้งาน Yotathai AI กรุณาแจ้งอีเมลนี้ให้คุณช่างถึกเพื่อเปิดสิทธิ์ครับ"
                    })
                    return

                configs = user_status.get("cascadeModelConfigData", {}).get("clientModelConfigs", [])
                quota_pct = None
                for c in configs:
                    if c.get("modelOrAlias", {}).get("model") == "MODEL_PLACEHOLDER_M418":
                        rem = c.get("quotaInfo", {}).get("remainingFraction")
                        if rem is not None:
                            quota_pct = int(round(float(rem) * 100))
                        break
                owner_display = "คุณช่างถึก" if is_master_owner() else (auth_info.get("name") or user_status.get("name") or "คุณผู้ใช้งาน")
                self._send_json(200, {
                    "ok": True,
                    "authorized": True,
                    "version": "2.6.0",
                    "engine": "Yotathai AI Ultra",
                    "user": owner_display,
                    "email": email,
                    "tier": auth_info.get("tier", "pro_construction"),
                    "packs": auth_info.get("packs", []),
                    "quotaPercent": quota_pct,
                    "trustedContacts": load_trusted_contacts(),
                    "cacheStats": PROMPT_CACHE.stats
                })
                return
            except Exception as e:
                # Fallback check: if Claude CLI or Gemini CLI is available on Mac/Windows, report ready!
                claude_bin = shutil.which("claude") or ("/opt/homebrew/bin/claude" if os.path.exists("/opt/homebrew/bin/claude") else None)
                gemini_bin = shutil.which("gemini") or ("/opt/homebrew/bin/gemini" if os.path.exists("/opt/homebrew/bin/gemini") else None)
                owner_display = "คุณช่างถึก" if is_master_owner() else "คุณผู้ใช้งาน"
                if is_master_owner():
                    for cli_bin, label in [(claude_bin, "Claude CLI"), (gemini_bin, "Gemini CLI")]:
                        if cli_bin:
                            self._send_json(200, {
                                "ok": True,
                                "authorized": True,
                                "version": "2.6.0",
                                "engine": label,
                                "user": owner_display,
                                "email": "aphisit8118@gmail.com",
                                "tier": "master",
                                "packs": ["rakaklang_2569", "takeoff_boq", "law_procurement"],
                                "quotaPercent": 100,
                                "trustedContacts": load_trusted_contacts(),
                                "cacheStats": PROMPT_CACHE.stats
                            })
                            return
                self._send_json(200, {"ok": False, "error": str(e)})
                return

        if self.path == "/api/memories":
            self._send_json(200, {"ok": True, "memories": load_memories()})
            return

        if self.path == "/api/trusted_contacts":
            self._send_json(200, {"ok": True, "trustedContacts": load_trusted_contacts()})
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def _call_ai_universal(self, prompt_text, model="MODEL_PLACEHOLDER_M318", timeout=45, static_prefix=None, dynamic_context=None):
        """
        เรียกใช้งาน AI ได้ทุกค่าย พร้อมรองรับ Prompt Caching (Gemini / Claude / OpenAI / Antigravity):
        - หากแยก static_prefix + dynamic_context มาให้ จะบันทึกสถิติ Cache Hit และเลือกโครงสร้าง Prompt Caching ตามโมเดล
        """
        if static_prefix is not None and dynamic_context is not None:
            PROMPT_CACHE.record_usage(static_prefix, dynamic_context)

        # 1) กรณีตั้งค่า ANTHROPIC_API_KEY และเรียกผ่าน Claude API โดยตรง (Prompt Caching: ephemeral)
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        if anthropic_key and model.startswith("claude-") and static_prefix and dynamic_context:
            try:
                body = PROMPT_CACHE.build_claude_payload(static_prefix, dynamic_context, model=model)
                req = urllib.request.Request(
                    "https://api.anthropic.com/v1/messages",
                    data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "anthropic-beta": "prompt-caching-2024-07-31"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    content_blocks = data.get("content", [])
                    if content_blocks and content_blocks[0].get("text"):
                        return content_blocks[0]["text"]
            except Exception:
                pass

        # 2) กรณีตั้งค่า GEMINI_API_KEY และเรียกผ่าน Gemini API โดยตรง (Context Caching >= 32,768 tokens)
        gemini_key = os.environ.get("GEMINI_API_KEY")
        if gemini_key and model.startswith("gemini-") and static_prefix and dynamic_context:
            try:
                body = PROMPT_CACHE.build_gemini_payload(static_prefix, dynamic_context, api_key=gemini_key, model=model)
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    cands = data.get("candidates", [])
                    if cands:
                        parts = cands[0].get("content", {}).get("parts", [])
                        if parts and parts[0].get("text"):
                            return parts[0]["text"]
            except Exception:
                pass

        # 3) กรณีตั้งค่า OPENAI_API_KEY และเรียกผ่าน OpenAI API โดยตรง (Automatic Prefix Caching)
        openai_key = os.environ.get("OPENAI_API_KEY")
        if openai_key and model.startswith("gpt-") and static_prefix and dynamic_context:
            try:
                body = PROMPT_CACHE.build_openai_payload(static_prefix, dynamic_context, model=model)
                req = urllib.request.Request(
                    "https://api.openai.com/v1/chat/completions",
                    data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {openai_key}"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    choices = data.get("choices", [])
                    if choices:
                        msg = choices[0].get("message", {}).get("content", "")
                        if msg:
                            return msg
            except Exception:
                pass

        # 4) Default: Antigravity Local Language Server (ใช้ Static Prefix อยู่บนสุด 100% เพื่อ Prefix Cache Hit)
        if model not in ("CLAUDE_CLI_DIRECT", "GEMINI_CLI_DIRECT"):
            try:
                resp = call_language_server(
                    "GetModelResponse",
                    {"prompt": prompt_text, "model": model},
                    timeout=timeout
                )
                reply = resp.get("response", "")
                if reply:
                    return reply
            except Exception:
                # หาก Antigravity ปิดอยู่ ให้สลับไปใช้ Claude CLI หรือ Gemini CLI ในเครื่องอัตโนมัติ
                pass

        # 5) Direct / Fallback: เรียกผ่าน Gemini CLI (gemini -p) หากผู้ใช้เลือก GEMINI_CLI_DIRECT
        gemini_candidates = [shutil.which("gemini"), "/opt/homebrew/bin/gemini", "/usr/local/bin/gemini"]
        if model == "GEMINI_CLI_DIRECT":
            for gemini_bin in gemini_candidates:
                if gemini_bin and os.path.exists(gemini_bin):
                    res = subprocess.run(
                        [gemini_bin, "-p", prompt_text],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        timeout=timeout
                    )
                    if res.returncode == 0 and res.stdout.strip():
                        return res.stdout.strip()

        # 6) Fallback / Direct: เรียกผ่าน Claude Code CLI (claude -p)
        claude_candidates = [shutil.which("claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"]
        for claude_bin in claude_candidates:
            if claude_bin and os.path.exists(claude_bin):
                res = subprocess.run(
                    [claude_bin, "-p", prompt_text],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=timeout
                )
                if res.returncode == 0 and res.stdout.strip():
                    return res.stdout.strip()

        # 7) Fallback สุดท้าย: ลองเรียกผ่าน Gemini CLI หากไม่มี Claude CLI
        for gemini_bin in gemini_candidates:
            if gemini_bin and os.path.exists(gemini_bin):
                res = subprocess.run(
                    [gemini_bin, "-p", prompt_text],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=timeout
                )
                if res.returncode == 0 and res.stdout.strip():
                    return res.stdout.strip()

        raise RuntimeError("ไม่สามารถเชื่อมต่อ AI ได้ (กรุณาเปิด Antigravity หรือตรวจสอบ claude / gemini CLI ในเครื่อง)")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        payload = json.loads(raw)

        if self.path == "/api/self_update":
            new_code = payload.get("code", "")
            new_ver = payload.get("version", "")
            if new_code and "BridgeHandler" in new_code and "19876" in new_code:
                try:
                    script_path = Path(__file__).resolve()
                    script_path.write_text(new_code, encoding="utf-8")
                    self._send_json(200, {"ok": True, "updatedTo": new_ver})
                    # Restart self in background
                    import sys
                    subprocess.Popen([sys.executable, str(script_path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    os._exit(0)
                except Exception as e:
                    self._send_json(200, {"ok": False, "error": str(e)})
                    return
            self._send_json(200, {"ok": False, "error": "Invalid update payload"})
            return

        if self.path == "/api/memories":
            mem = (payload.get("memory") or "").strip()
            memories = load_memories()
            if mem and mem not in memories:
                memories.append(mem)
                save_memories(memories)
            self._send_json(200, {"ok": True, "memories": memories})
            return

        if self.path == "/api/trusted_contacts":
            contacts = payload.get("trustedContacts")
            if isinstance(contacts, str):
                contacts = [x.strip() for x in contacts.split(",") if x.strip()]
            elif not isinstance(contacts, list):
                contacts = load_trusted_contacts()
            saved = save_trusted_contacts(contacts)
            self._send_json(200, {"ok": True, "trustedContacts": saved})
            return

        if self.path == "/api/mic/start":
            global ACTIVE_MIC_PROC, ACTIVE_MIC_WAV
            try:
                if globals().get("ACTIVE_MIC_PROC") is not None:
                    try:
                        ACTIVE_MIC_PROC.terminate()
                        ACTIVE_MIC_PROC.wait(timeout=1)
                    except Exception:
                        pass
                ACTIVE_MIC_WAV = "/tmp/yt_chrome_agent_mic.wav"
                try:
                    if os.path.exists(ACTIVE_MIC_WAV):
                        os.remove(ACTIVE_MIC_WAV)
                except Exception:
                    pass
                # ตรวจสอบว่ามีไมโครโฟนของ MacBook Pro หรือไม่ (แคชไว้เพื่อให้กดปุ๊บติดปั๊บทันที)
                audio_input = globals().get("CACHED_AUDIO_INPUT")
                if not audio_input:
                    dev_list = subprocess.run(
                        ["/opt/homebrew/bin/ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3
                    ).stderr
                    audio_input = ":ไมโครโฟนของ MacBook Pro" if "ไมโครโฟนของ MacBook Pro" in dev_list else ":0"
                    globals()["CACHED_AUDIO_INPUT"] = audio_input
                cmd = [
                    "/opt/homebrew/bin/ffmpeg", "-y",
                    "-f", "avfoundation", "-i", audio_input,
                    "-ar", "16000", "-ac", "1", ACTIVE_MIC_WAV
                ]
                ACTIVE_MIC_PROC = subprocess.Popen(
                    cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                self._send_json(200, {"ok": True, "device": audio_input})
            except Exception as e:
                self._send_json(200, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/mic/stop":
            try:
                proc = globals().get("ACTIVE_MIC_PROC")
                wav_path = globals().get("ACTIVE_MIC_WAV", "/tmp/yt_chrome_agent_mic.wav")
                if proc is not None:
                    try:
                        proc.communicate(input=b"q\n", timeout=2)
                    except Exception:
                        try:
                            proc.terminate()
                            proc.wait(timeout=1)
                        except Exception:
                            pass
                    globals()["ACTIVE_MIC_PROC"] = None

                if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 1000:
                    self._send_json(200, {"ok": False, "error": "ไม่ได้ยินเสียงพูด หรือไฟล์เสียงสั้นเกินไปครับ"})
                    return

                import speech_recognition as sr
                recognizer = sr.Recognizer()
                with sr.AudioFile(wav_path) as source:
                    audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data, language="th-TH")
                self._send_json(200, {"ok": True, "text": text.strip()})
            except Exception as e:
                err_name = type(e).__name__
                if "UnknownValueError" in err_name:
                    self._send_json(200, {"ok": False, "error": "ฟังเสียงไม่ชัด กรุณาพูดใหม่อีกครั้งครับ"})
                else:
                    self._send_json(200, {"ok": False, "error": f"ถอดเสียงไม่สำเร็จ: {e}"})
            return

        # Endpoint พิเศษประหยัดโทเค็นสูงสุด (<230 โทเค็น) สำหรับ Auto-Reply 2 โหมดอัจฉริยะ (v2.0)
        if self.path == "/api/autoreply":
            try:
                platform = payload.get("platform", "Messenger")
                partner = (payload.get("partnerName") or payload.get("sender") or "เพื่อน").strip()
                incoming = (payload.get("incomingMessage") or payload.get("incomingText") or "").strip()
                raw_recent = payload.get("recentChat") or payload.get("recentContext") or []
                model = payload.get("model") or "MODEL_PLACEHOLDER_M318"

                if not incoming:
                    self._send_json(200, {"ok": False, "error": "ไม่มีข้อความขาเข้า"})
                    return

                # แปลงประวัติแชทล่าสุด (ทั้งรูปแบบ list[str] และ list[dict])
                recent_lines = []
                already_introduced_as_ai = False
                for item in raw_recent[-6:]:
                    if isinstance(item, dict):
                        s_name = item.get("sender", "")
                        s_txt = item.get("text", "")
                        line_str = f"{s_name}: {s_txt}"
                        if s_name == "คุณช่างถึก" and ("ai" in s_txt.lower() or "ผู้ช่วย" in s_txt):
                            already_introduced_as_ai = True
                    else:
                        line_str = str(item)
                        if "ai" in line_str.lower() or "ผู้ช่วย" in line_str:
                            already_introduced_as_ai = True
                    recent_lines.append(line_str)

                chat_context = "\n".join(recent_lines) if recent_lines else f"{partner}: {incoming}"

                # ตรวจสอบรายชื่อคนสนิท (จาก payload หรือจากไฟล์ trusted_contacts.json)
                client_trusted = payload.get("trustedContacts")
                if isinstance(client_trusted, list):
                    trusted_contacts = save_trusted_contacts(client_trusted)
                else:
                    trusted_contacts = load_trusted_contacts()

                forced_persona = payload.get("personaMode")  # 'as_owner' | 'ai_assistant' | 'auto' | None
                if forced_persona == "as_owner":
                    use_owner_persona = True
                elif forced_persona == "ai_assistant":
                    use_owner_persona = False
                else:
                    use_owner_persona = is_partner_trusted(partner, trusted_contacts)

                ai_style = (
                    payload.get("aiStylePrompt")
                    or payload.get("customStyle")
                    or "บอกตรงๆ อย่างสุภาพว่าเป็น AI ผู้ช่วยของคุณช่างถึก เริ่มต้นชวนคุย สอบถามธุระ และรับเรื่องไว้ให้คุณช่างถึก"
                ).strip()
                owner_style = (
                    payload.get("ownerStylePrompt")
                    or payload.get("stylePrompt")
                    or "คุยเหมือนคุณช่างถึกเป็นคนพิมพ์คุยเอง เป็นกันเอง ธรรมชาติ สั้นกระชับ ชวนคุยต่ออย่างเพื่อนสนิท"
                ).strip()

                if use_owner_persona:
                    persona_used = "as_owner"
                    compact_prompt = (
                        f"คุณคือ 'คุณช่างถึก' กำลังแชท {platform} คุยกับคนสนิทที่คุณไว้ใจชื่อ '{partner}' ด้วยตัวเอง\n"
                        f"กฎสำคัญ: คุยเหมือนคุณช่างถึกพิมพ์คุยเอง 100% ห้ามบอกว่าเป็น AI หรือบอทเด็ดขาด!\n"
                        f"แนวทางการคุย: {owner_style}\n"
                        f"บทสนทนาล่าสุด:\n{chat_context}\n"
                        f"ข้อความล่าสุดจาก {partner}: \"{incoming}\"\n\n"
                        f"จงแต่งข้อความตอบกลับสั้นๆ เป็นธรรมชาติ (1-2 ประโยค) ตอบเฉพาะข้อความที่จะส่งกลับเท่านั้น ห้ามใส่เครื่องหมายคำพูดครอบ:"
                    )
                else:
                    persona_used = "ai_assistant"
                    intro_rule = (
                        "เนื่องจากเพิ่งเริ่มคุย ให้แนะนำตัวตรงๆ อย่างสุภาพว่าเป็น 'AI ผู้ช่วยของคุณช่างถึก' แล้วเริ่มต้นคุย/สอบถามธุระหรือชวนคุยตามข้อความที่เขาทักมาได้เลย"
                        if not already_introduced_as_ai
                        else "คุยต่อเนื่องในฐานะ 'AI ผู้ช่วยของคุณช่างถึก' อย่างสุภาพ เป็นธรรมชาติ ชวนคุยหรือรับเรื่องต่อได้เลย (ไม่ต้องพูดคำว่าสวัสดีผมคือ AI ซ้ำอีกเพราะแนะนำตัวไปแล้ว)"
                    )
                    compact_prompt = (
                        f"คุณคือ 'AI ผู้ช่วยของคุณช่างถึก' กำลังตอบแชท {platform} กับคู่สนทนาชื่อ '{partner}'\n"
                        f"กฎสำคัญ: {intro_rule}\n"
                        f"แนวทางการคุย: {ai_style}\n"
                        f"บทสนทนาล่าสุด:\n{chat_context}\n"
                        f"ข้อความล่าสุดจาก {partner}: \"{incoming}\"\n\n"
                        f"จงแต่งข้อความตอบกลับสั้นๆ สุภาพ เป็นธรรมชาติ (1-2 ประโยค) ตอบเฉพาะข้อความที่จะส่งกลับเท่านั้น ห้ามใส่เครื่องหมายคำพูดครอบ:"
                    )

                raw_reply = self._call_ai_universal(compact_prompt, model=model, timeout=25).strip()
                if raw_reply.startswith("{") and raw_reply.endswith("}"):
                    try:
                        j = json.loads(raw_reply)
                        raw_reply = j.get("reply_message") or j.get("reply") or raw_reply
                    except Exception:
                        pass
                clean_reply = raw_reply.strip().strip('"').strip("'")

                persona_label = "👤 คุยเหมือนคุณช่างถึก" if persona_used == "as_owner" else "🤖 บอกตรงๆ ว่าเป็น AI"

                # บันทึกลง CHAT_LOG.md
                try:
                    import datetime
                    log_file = BASE_DIR / "CHAT_LOG.md"
                    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    with open(log_file, "a", encoding="utf-8") as lf:
                        lf.write(f"\n### 🤖 [Auto-Reply v2.0 | {platform} | {persona_label}] {now_str} | คู่สนทนา: `{partner}`\n")
                        lf.write(f"- **{partner}:** {incoming}\n")
                        lf.write(f"- **ตอบอัตโนมัติ ({persona_label}):** {clean_reply}\n")
                except Exception:
                    pass

                self._send_json(200, {
                    "ok": True,
                    "reply": clean_reply,
                    "replyMessage": clean_reply,
                    "personaUsed": persona_used,
                    "personaLabel": persona_label
                })
            except Exception as e:
                self._send_json(200, {"ok": False, "error": str(e)})
            return

        if self.path == "/api/agent":
            try:
                user_prompt = payload.get("userPrompt", "")
                history = payload.get("history", [])
                snapshot = payload.get("snapshot", {})
                model = payload.get("model") or "MODEL_PLACEHOLDER_M318"
                attachment = payload.get("attachment")

                # ตรวจสอบสิทธิ์อีเมลและดึงชุดฐานความรู้ตามสิทธิ์ของผู้ใช้งาน
                active_email = _REMOTE_CACHE.get("last_email", "")
                try:
                    st = call_language_server("GetUserStatus", {}, timeout=3)
                    active_email = (st.get("userStatus", {}).get("email") or active_email).strip().lower()
                except Exception:
                    pass
                auth_info = check_email_authorization(active_email)
                if not auth_info.get("authorized"):
                    self._send_json(200, {
                        "ok": False,
                        "unauthorized": True,
                        "email": active_email,
                        "error": f"🔒 บัญชี {active_email or 'ของคุณ'} ยังไม่ได้รับสิทธิ์ใช้งาน Yotathai AI กรุณาแจ้งอีเมลนี้ให้คุณช่างถึกเพื่อเปิดสิทธิ์ครับ"
                    })
                    return

                memories = load_memories()
                trusted_contacts = load_trusted_contacts()
                reference_docs = get_authorized_knowledge_docs(auth_info)

                # แยกโครงสร้าง Prompt เป็น 2 ส่วนชัดเจน: Static Prefix (บนสุด) + Dynamic Context (ล่างสุด)
                static_prefix = build_static_prefix(memories, trusted_contacts=trusted_contacts, reference_docs=reference_docs)
                dynamic_context = build_dynamic_context(user_prompt, history, snapshot, attachment=attachment)
                full_prompt = f"{static_prefix}\n\n{dynamic_context}"

                raw_reply = self._call_ai_universal(
                    full_prompt,
                    model=model,
                    timeout=50,
                    static_prefix=static_prefix,
                    dynamic_context=dynamic_context
                )
                parsed = extract_json_object(raw_reply)

                new_mem = parsed.get("memory_to_save")
                saved_mem = None
                if new_mem and isinstance(new_mem, str) and new_mem.strip().lower() != "null":
                    clean_mem = new_mem.strip()
                    if clean_mem not in memories:
                        memories.append(clean_mem)
                        save_memories(memories)
                        saved_mem = clean_mem

                # จัดการคำสั่งเพิ่ม/ถอดรายชื่อคนสนิท (คุยเหมือนคุณช่างถึกคุยเอง vs บอกว่าเป็น AI)
                trusted_updated = None
                add_tc = parsed.get("add_trusted_contact")
                if add_tc and isinstance(add_tc, str) and add_tc.strip().lower() != "null":
                    tc_name = add_tc.strip()
                    if tc_name and tc_name not in trusted_contacts:
                        trusted_contacts.append(tc_name)
                        trusted_contacts = save_trusted_contacts(trusted_contacts)
                    trusted_updated = {"action": "added", "name": tc_name, "trustedContacts": trusted_contacts}

                rem_tc = parsed.get("remove_trusted_contact")
                if rem_tc and isinstance(rem_tc, str) and rem_tc.strip().lower() != "null":
                    tc_name = rem_tc.strip()
                    trusted_contacts = [
                        c for c in trusted_contacts
                        if c.lower() != tc_name.lower() and tc_name.lower() not in c.lower()
                    ]
                    trusted_contacts = save_trusted_contacts(trusted_contacts)
                    trusted_updated = {"action": "removed", "name": tc_name, "trustedContacts": trusted_contacts}

                # บันทึกประวัติการสนทนาลงไฟล์ CHAT_LOG.md ในคอมพิวเตอร์อัตโนมัติ
                try:
                    import datetime
                    log_file = BASE_DIR / "CHAT_LOG.md"
                    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    if not user_prompt.startswith("(ผลจากการกระทำก่อนหน้า:"):
                        with open(log_file, "a", encoding="utf-8") as lf:
                            lf.write(f"\n### 🕒 {now_str} | แท็บ: `{snapshot.get('title', '')}` ({snapshot.get('url', '')})\n")
                            lf.write(f"- **คุณช่างถึก:** {user_prompt}\n")
                            lf.write(f"- **ช่างถึก AI:** {parsed.get('reply', '')}\n")
                            if parsed.get("actions"):
                                lf.write(f"- **การกระทำ (Actions):** `{json.dumps(parsed.get('actions'), ensure_ascii=False)}`\n")
                            if saved_mem:
                                lf.write(f"- **🧠 บันทึกความจำใหม่:** `{saved_mem}`\n")
                            if trusted_updated:
                                lf.write(f"- **👤 อัปเดตโหมดคนสนิท:** `{json.dumps(trusted_updated, ensure_ascii=False)}`\n")
                except Exception:
                    pass

                self._send_json(200, {
                    "ok": True,
                    "result": {
                        "reply": parsed.get("reply", ""),
                        "actions": parsed.get("actions", []),
                        "continue_after_actions": bool(parsed.get("continue_after_actions", False)),
                        "memory_saved": saved_mem,
                        "scratchpad_add": parsed.get("scratchpad_add"),
                        "trusted_updated": trusted_updated,
                        "trusted_contacts": trusted_contacts,
                        "enable_auto_reply": parsed.get("enable_auto_reply"),
                        "cache_stats": PROMPT_CACHE.stats
                    }
                })
            except Exception as e:
                self._send_json(200, {"ok": False, "error": str(e)})
            return

        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_DELETE(self):
        if self.path == "/api/memories":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(raw)
            idx = payload.get("index")
            memories = load_memories()
            if isinstance(idx, int) and 0 <= idx < len(memories):
                memories.pop(idx)
                save_memories(memories)
            self._send_json(200, {"ok": True, "memories": memories})
            return
        self._send_json(404, {"ok": False, "error": "Not found"})


if __name__ == "__main__":
    load_memories()
    load_trusted_contacts()
    server = http.server.ThreadingHTTPServer((HOST, PORT), BridgeHandler)
    print(f"Yotathai Chrome Agent v2.0 Bridge listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()

