// Yotathai Chrome Agent — Side Panel Controller (สำหรับคุณช่างถึก)
const BRIDGE_URL = 'http://127.0.0.1:19876';

const statusBadge = document.getElementById('statusBadge');
const activeTabTitle = document.getElementById('activeTabTitle');
const chatContainer = document.getElementById('chatContainer');
const welcomeCard = document.getElementById('welcomeCard');
const promptInput = document.getElementById('promptInput');
const modelSelect = document.getElementById('modelSelect');
const btnSend = document.getElementById('btnSend');
const btnMic = document.getElementById('btnMic');
const btnClear = document.getElementById('btnClear');
const btnAudit = document.getElementById('btnAudit');
const btnMemory = document.getElementById('btnMemory');
const memoryModal = document.getElementById('memoryModal');
const btnCloseMemory = document.getElementById('btnCloseMemory');
const memoryList = document.getElementById('memoryList');
const inputNewMemory = document.getElementById('inputNewMemory');
const btnAddMemory = document.getElementById('btnAddMemory');
const btnAttach = document.getElementById('btnAttach');
const btnCaptureScreen = document.getElementById('btnCaptureScreen');
const fileInput = document.getElementById('fileInput');
const attachPreviewBar = document.getElementById('attachPreviewBar');
const attachPreviewName = document.getElementById('attachPreviewName');
const attachPreviewIcon = document.getElementById('attachPreviewIcon');
const btnRemoveAttach = document.getElementById('btnRemoveAttach');
const sessionSelect = document.getElementById('sessionSelect');
const btnNewChat = document.getElementById('btnNewChat');
const btnNewWindowAi = document.getElementById('btnNewWindowAi');
const btnNewWindowTop = document.getElementById('btnNewWindowTop');

let currentWindowId = null;
let currentSessionId = null;
let sessions = []; // [{ id, title, updatedAt, messages: [] }]
let chatHistory = [];
let stopRequested = false;
let isRunning = false;
let currentAttachment = null; // { name, type, data, isImage }
let latestScreenOcrAttachment = null; // เก็บภาพแคปหน้าจอล่าสุดจากคำสั่ง read_screen_ocr
let taskScratchpad = []; // สมุดจดสะสมข้อมูลข้ามห้องแชท/ข้ามหน้าในรอบการทำงาน
let pinnedChatTabId = null; // จำแท็บแชท Messenger/LINE เพื่อให้เฝ้าแชทต่อได้แม้สลับไปแท็บ/หน้าต่างอื่น

const EXT_VERSION = '2.6.0';
const setupGuideCard = document.getElementById('setupGuideCard');
const welcomeHeading = document.getElementById('welcomeHeading');
const btnInstallWin = document.getElementById('btnInstallWin');
const btnInstallMac = document.getElementById('btnInstallMac');
let selfUpdateAttempted = false;

async function triggerBridgeSelfUpdate() {
  if (selfUpdateAttempted) return;
  selfUpdateAttempted = true;
  try {
    const pyUrl = chrome.runtime.getURL('bridge_server.py');
    const resp = await fetch(pyUrl);
    if (!resp.ok) return;
    const code = await resp.text();
    if (code && code.includes('BridgeHandler')) {
      await fetch(`${BRIDGE_URL}/api/self_update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: EXT_VERSION, code })
      });
    }
  } catch (e) {}
}

async function downloadOneClickInstaller(osType) {
  try {
    const pyUrl = chrome.runtime.getURL('bridge_server.py');
    const resp = await fetch(pyUrl);
    const pyCode = await resp.text();
    const b64Py = btoa(unescape(encodeURIComponent(pyCode)));

    if (osType === 'windows') {
      const batContent = [
        '@echo off',
        'chcp 65001 >nul',
        'title Yotathai AI — ตัวติดตั้งอัตโนมัติสำหรับ Windows',
        'echo ========================================================',
        'echo   ⚡ กำลังติดตั้ง Yotathai AI Bridge อัตโนมัติ (ทำครั้งเดียว)...',
        'echo ========================================================',
        'set "TARGET_DIR=%USERPROFILE%\\Yotathai_AI_Bridge\\server"',
        'if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"',
        'powershell -NoProfile -Command "[IO.File]::WriteAllBytes(\'%TARGET_DIR%\\bridge_server.py\', [Convert]::FromBase64String(\'' + b64Py + '\'))"',
        'set "STARTUP_VBS=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Yotathai_AI_AutoStart.vbs"',
        'echo Set WshShell = CreateObject("WScript.Shell") > "%STARTUP_VBS%"',
        'echo WshShell.Run "pythonw ""%TARGET_DIR%\\bridge_server.py""", 0, False >> "%STARTUP_VBS%"',
        'wscript.exe "%STARTUP_VBS%"',
        'echo.',
        'echo ✅ ติดตั้งและเปิดใช้งาน Yotathai AI สำเร็จเรียบร้อยแล้ว!',
        'echo    (ระบบจะเปิดทำงานเองอัตโนมัติทุกครั้งที่เปิดคอมพิวเตอร์)',
        'timeout /t 4'
      ].join('\r\n');
      const blob = new Blob([batContent], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Yotathai_AI_Setup_Windows.bat';
      a.click();
    } else {
      const cmdContent = [
        '#!/bin/zsh',
        'echo "========================================================"',
        'echo "  ⚡ กำลังติดตั้ง Yotathai AI Bridge อัตโนมัติ (สำหรับ Mac)..."',
        'echo "========================================================"',
        'TARGET_DIR="$HOME/Yotathai_AI_Bridge/server"',
        'mkdir -p "$TARGET_DIR"',
        'echo "' + b64Py + '" | base64 -D > "$TARGET_DIR/bridge_server.py"',
        'chmod +x "$TARGET_DIR/bridge_server.py"',
        'PLIST_PATH="$HOME/Library/LaunchAgents/com.yotathai.aibridge.plist"',
        'mkdir -p "$HOME/Library/LaunchAgents"',
        'cat <<EOF > "$PLIST_PATH"',
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        '  <key>Label</key><string>com.yotathai.aibridge</string>',
        '  <key>ProgramArguments</key>',
        '  <array><string>/usr/bin/python3</string><string>$TARGET_DIR/bridge_server.py</string></array>',
        '  <key>RunAtLoad</key><true/>',
        '  <key>KeepAlive</key><true/>',
        '</dict>',
        '</plist>',
        'EOF',
        'pkill -f "bridge_server.py" 2>/dev/null',
        'launchctl unload "$PLIST_PATH" 2>/dev/null',
        'launchctl load "$PLIST_PATH" 2>/dev/null',
        'nohup python3 "$TARGET_DIR/bridge_server.py" >/dev/null 2>&1 &',
        'echo "✅ ติดตั้งและเปิดใช้งาน Yotathai AI สำเร็จเรียบร้อยแล้ว!"',
        'sleep 2'
      ].join('\n');
      const blob = new Blob([cmdContent], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Yotathai_AI_Setup_Mac.command';
      a.click();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการสร้างไฟล์ติดตั้ง: ' + e.message);
  }
}

if (btnInstallWin) btnInstallWin.addEventListener('click', () => downloadOneClickInstaller('windows'));
if (btnInstallMac) btnInstallMac.addEventListener('click', () => downloadOneClickInstaller('mac'));

// 1. Check Bridge & Google AI Ultra Quota Status
async function checkStatus() {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/status`);
    const data = await res.json();
    if (setupGuideCard) setupGuideCard.classList.add('hidden');
    if (data.ok) {
      if (data.version && data.version !== EXT_VERSION) {
        triggerBridgeSelfUpdate();
      }
      if (welcomeHeading && data.user) {
        const packCount = Array.isArray(data.packs) && data.packs.length ? ` · 📚 ฐานความรู้ ${data.packs.length} ชุด` : '';
        welcomeHeading.textContent = `สวัสดีครับ ${data.user}${packCount}`;
      }
      const pct = data.quotaPercent ? ` (${data.quotaPercent}%)` : '';
      const ver = data.version ? `v${data.version.replace(/\.0$/, '')}` : 'v2.6';
      const emailTag = data.email ? ` · ${data.email}` : '';
      statusBadge.textContent = `🟢 ${ver} อนุมัติสิทธิ์แล้ว${emailTag}${pct}`;
      statusBadge.style.color = '#22c55e';
    } else if (data.unauthorized) {
      statusBadge.textContent = `🔒 บัญชี ${data.email || 'นี้'} ยังไม่มีสิทธิ์ (แจ้งคุณช่างถึกเพื่อเปิดสิทธิ์)`;
      statusBadge.style.color = '#ef4444';
      if (welcomeHeading) {
        welcomeHeading.textContent = `🔒 บัญชี ${data.email || ''} ยังไม่ได้รับสิทธิ์ใช้งาน Yotathai AI`;
      }
    } else {
      statusBadge.textContent = '🟠 กรุณาเปิดโปรแกรม Antigravity ในเครื่อง...';
      statusBadge.style.color = '#f59e0b';
    }
  } catch (err) {
    statusBadge.textContent = '🔴 กดติดตั้งตัวเชื่อมด้านล่าง (ทำครั้งเดียว)';
    statusBadge.style.color = '#ef4444';
    if (setupGuideCard) setupGuideCard.classList.remove('hidden');
  }
}

// 2. Track Active Tab Locked to THIS Chrome Window (รองรับทำงานหลายหน้าต่างพร้อมกันโดยไม่ตีกัน)
async function ensureWindowId() {
  if (currentWindowId !== null) return currentWindowId;
  try {
    const win = await chrome.windows.getCurrent();
    if (win && win.id) currentWindowId = win.id;
  } catch (e) {}
  return currentWindowId;
}

async function getActiveTab() {
  const winId = await ensureWindowId();
  if (winId !== null) {
    const tabs = await chrome.tabs.query({ active: true, windowId: winId });
    if (tabs && tabs[0]) return tabs[0];
  }
  const fallback = await chrome.tabs.query({ active: true, currentWindow: true });
  return fallback[0];
}

async function updateActiveTabDisplay() {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    const title = tab.title || tab.url || 'แท็บใหม่';
    activeTabTitle.textContent = `กำลังควบคุม (หน้าต่างนี้): ${title}`;
  } catch (err) {
    activeTabTitle.textContent = 'พร้อมควบคุมแท็บปัจจุบัน';
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const winId = await ensureWindowId();
  if (!winId || activeInfo.windowId === winId) {
    updateActiveTabDisplay();
    // หากไม่ได้กำลังรันคำสั่งค้างอยู่ และแท็บที่คลิกกลับมามีบทสนทนาของตัวเองผูกไว้ ให้สลับบทสนทนาเรื่องนั้นกลับมาให้อัตโนมัติทันที!
    if (!isRunning && activeInfo.tabId) {
      const data = await chrome.storage.local.get(['ytTabSessionMap', 'ytSessions']);
      const tabMap = data.ytTabSessionMap || {};
      const boundSessionId = tabMap[activeInfo.tabId];
      if (boundSessionId && boundSessionId !== currentSessionId) {
        await switchConversation(boundSessionId, false);
      }
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((!currentWindowId || tab.windowId === currentWindowId) && (changeInfo.status === 'complete' || changeInfo.title)) {
    updateActiveTabDisplay();
  }
});

if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (focusedWinId) => {
    const winId = await ensureWindowId();
    if (winId && focusedWinId === winId && !isRunning) {
      updateActiveTabDisplay();
      renderSessionDropdown();
    }
  });
}

// 3. Extract Compact Page Snapshot (Token-Saving DOM Parser v2.5 — ทะลุ Shadow DOM & iframe + ดึงทุก <textarea>/[contenteditable] เสมอ) + Yotathai Rule Audit
async function capturePageSnapshot(tab) {
  if (!tab || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
    return {
      url: tab ? tab.url : 'chrome://newtab',
      title: tab ? tab.title : 'แท็บใหม่',
      restricted: true,
      elements: [],
      pageText: '(หน้าแท็บระบบของ Chrome — สามารถใช้คำสั่ง navigate เพื่อเปิดเว็บไซต์ใดๆ ได้ทันที)',
      audit: null
    };
  }

  try {
    const scriptPromise = chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Helper 1: รวบรวม Document + ทุก Shadow Root + ทุก Same-Origin iframe แบบ Recursive
        function collectAllRoots(startRoot = document, visited = new Set()) {
          const roots = [];
          function walk(root) {
            if (!root || visited.has(root)) return;
            visited.add(root);
            roots.push(root);
            let allNodes = [];
            try {
              allNodes = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
            } catch (e) {}
            for (const el of allNodes) {
              if (el.shadowRoot) {
                walk(el.shadowRoot);
              }
              if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
                try {
                  if (el.contentDocument) walk(el.contentDocument);
                } catch (e) {}
              }
            }
          }
          walk(startRoot);
          return roots;
        }

        const allRoots = collectAllRoots(document);

        function querySelectorAllDeep(selector) {
          const results = [];
          const seenNodes = new Set();
          for (const r of allRoots) {
            try {
              const matched = r.querySelectorAll(selector);
              for (const el of matched) {
                if (!seenNodes.has(el)) {
                  seenNodes.add(el);
                  results.push(el);
                }
              }
            } catch (e) {}
          }
          return results;
        }

        // Helper 2: Extract clean human-readable text without SVG path data, scripts, or styles
        function getCleanInteractiveText(node, maxLen = 70) {
          if (!node) return '';
          if (typeof node.value === 'string' && node.value.trim()) {
            return node.value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
          }
          const aria = (node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('aria-placeholder'))) || '';
          if (aria.trim()) return aria.replace(/\s+/g, ' ').trim().slice(0, maxLen);

          let raw = '';
          try {
            const doc = node.ownerDocument || document;
            const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
              acceptNode(txtNode) {
                const p = txtNode.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                const pTag = p.tagName.toLowerCase();
                if (pTag === 'svg' || pTag === 'path' || pTag === 'script' || pTag === 'style' || pTag === 'noscript') {
                  return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
              }
            });
            let curr;
            while ((curr = walker.nextNode())) {
              const t = curr.nodeValue.trim();
              if (t) raw += (raw ? ' ' : '') + t;
              if (raw.length >= maxLen + 20) break;
            }
          } catch (e) {}
          if (!raw && node.innerText) {
            raw = node.innerText;
          }
          if (!raw && node.getAttribute) {
            raw = node.getAttribute('title') || '';
          }
          return raw.replace(/\s+/g, ' ').trim().slice(0, maxLen);
        }

        // Helper 3: หาข้อความ Hint หรือตัวเลขความยาวข้อความรอบๆ กล่องพิมพ์ (เช่น "171/500" หรือชื่อหัวข้อของ LINE OA Manager)
        function findBoxContextHint(el) {
          const hints = [];
          try {
            let curr = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
            for (let depth = 0; depth < 4 && curr; depth++) {
              const txt = (curr.innerText || '').replace(/\s+/g, ' ').trim();
              const counterMatch = txt.match(/\b\d+\s*\/\s*\d+\b/);
              if (counterMatch && !hints.includes(counterMatch[0])) {
                hints.push(`ตัวนับ ${counterMatch[0]}`);
              }
              const labels = curr.querySelectorAll ? Array.from(curr.querySelectorAll('label, h1, h2, h3, h4, h5, legend, [class*="title"], [class*="label"]')) : [];
              for (const lb of labels) {
                const lt = (lb.innerText || '').replace(/\s+/g, ' ').trim();
                if (lt && lt.length >= 2 && lt.length <= 45 && !hints.includes(lt)) {
                  hints.push(lt);
                  break;
                }
              }
              if (hints.length >= 2) break;
              curr = curr.parentElement || (curr.getRootNode && curr.getRootNode().host) || null;
            }
          } catch (e) {}
          return hints.join(' | ').slice(0, 65);
        }

        // 1) Priority 1: ดึงทุก <textarea>, [contenteditable], [role="textbox"], <input> ทะลุ Shadow DOM & iframe เสมอ!
        const inputSelectors = [
          'textarea',
          '[contenteditable]:not([contenteditable="false"])',
          '[contenteditable="true"]',
          '[contenteditable=""]',
          '[contenteditable="plaintext-only"]',
          '[role="textbox"]',
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])',
          '[role="searchbox"]',
          '[role="combobox"]',
          'select',
          '[role="button"][aria-label*="คิดอะไรอยู่"]',
          '[role="button"][aria-label*="เขียนอะไร"]',
          '[role="button"][aria-label*="What\'s on your mind"]'
        ];
        // 2) Priority 2: Open Dropdowns, Autocomplete Options, Calendar Dates
        const popupAndCalendarSelectors = [
          '[role="option"]',
          '[role="listbox"] li',
          '[role="listbox"] div',
          '[role="gridcell"]',
          '[data-testid*="date"]',
          '[data-testid*="day"]',
          '[class*="calendar"] td',
          '[class*="datepicker"] td',
          '[class*="dropdown"] li',
          '[class*="autocomplete"] li'
        ];
        // 3) Priority 3: Interactive Buttons, Form Controls, Navigation Links & Chat List Items (LINE OA / Messenger)
        const clickableSelectors = [
          '[aria-label="โพสต์"]',
          '[aria-label="Post"]',
          '[aria-label="กด Enter เพื่อส่ง"]',
          '[aria-label="ส่ง"]',
          '.list-group-item',
          '[class*="chatlist"] [role="button"]',
          '[class*="chat-list"] [role="button"]',
          '[role="listitem"]',
          '[role="row"]',
          'button',
          '[role="button"]',
          'input[type="submit"]',
          'input[type="button"]',
          'input[type="checkbox"]',
          'input[type="radio"]',
          '[role="tab"]',
          '[role="menuitem"]',
          'a[href]',
          '[role="link"]'
        ];

        const seen = new Set();
        const orderedNodes = [];

        for (const n of querySelectorAllDeep(inputSelectors.join(','))) {
          if (!seen.has(n)) {
            seen.add(n);
            orderedNodes.push({ el: n, kind: 'input' });
          }
        }
        // ตรวจเพิ่มเติม: เผื่อกรณี Element ที่มี isContentEditable=true แต่ไม่ได้ติด selector
        for (const r of allRoots) {
          try {
            for (const n of r.querySelectorAll('*')) {
              if (!seen.has(n) && (n.isContentEditable || n.tagName === 'TEXTAREA')) {
                // ข้าม child node ที่อยู่ภายใต้ contenteditable แม่ตัวเดียวกัน เพื่อไม่ให้ซ้ำ
                if (n.parentElement && n.parentElement.isContentEditable) continue;
                seen.add(n);
                orderedNodes.unshift({ el: n, kind: 'input' });
              }
            }
          } catch (e) {}
        }

        for (const n of querySelectorAllDeep(popupAndCalendarSelectors.join(','))) {
          if (!seen.has(n)) {
            const txt = getCleanInteractiveText(n, 60);
            if (txt && txt.length <= 60 && n.children.length <= 3) {
              seen.add(n);
              orderedNodes.push({ el: n, kind: 'popup' });
            }
          }
        }
        for (const n of querySelectorAllDeep(clickableSelectors.join(','))) {
          if (!seen.has(n)) {
            seen.add(n);
            orderedNodes.push({ el: n, kind: 'click' });
          }
        }
        // 4) Catch custom cursor:pointer leaf elements (e.g. calendar days, LINE OA chat rooms, save buttons)
        for (const n of querySelectorAllDeep('div, span, li, a, label')) {
          if (orderedNodes.length >= 180) break;
          if (seen.has(n) || n.children.length > 4) continue;
          const txt = getCleanInteractiveText(n, 65);
          if (!txt || txt.length > 65) continue;
          const win = (n.ownerDocument && n.ownerDocument.defaultView) || window;
          const st = win.getComputedStyle(n);
          if (st.cursor === 'pointer' || txt.includes('คิดอะไรอยู่') || txt.includes('เขียนอะไร') || txt === 'บันทึก' || txt === 'Save') {
            seen.add(n);
            orderedNodes.push({ el: n, kind: 'pointer' });
          }
        }

        const elements = [];
        let nextId = 1;
        let editableBoxOrder = 0;

        for (const item of orderedNodes) {
          if (elements.length >= 115) break;
          const el = item.el;
          const rect = el.getBoundingClientRect();
          // สำหรับ input / textarea / contenteditable ผ่อนปรนขนาดขั้นต่ำเพื่อให้ดึงเข้าลิสต์เสมอแม้ยังไม่คลิกโฟกัส
          const minSize = item.kind === 'input' ? 2 : 4;
          if (rect.width < minSize || rect.height < minSize) continue;
          // Skip elements far outside current viewport unless they are inputs
          if (item.kind !== 'input' && (rect.bottom < -50 || rect.top > window.innerHeight + 250)) continue;
          const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
          const style = win.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || (style.opacity === '0' && item.kind !== 'input')) continue;

          const tag = el.tagName.toLowerCase();
          if (tag === 'svg' || tag === 'path' || tag === 'script' || tag === 'style') continue;

          const type = el.getAttribute('type') || '';
          const role = el.getAttribute('role') || '';
          const ceAttr = el.getAttribute('contenteditable');
          const isCE = Boolean(
            el.isContentEditable ||
            ceAttr === 'true' ||
            ceAttr === '' ||
            ceAttr === 'plaintext-only'
          );
          const isTextEntryBox = (tag === 'textarea' || isCE || role === 'textbox' || (tag === 'input' && !['submit', 'button', 'checkbox', 'radio', 'hidden', 'file'].includes(type)));

          if (isTextEntryBox) {
            editableBoxOrder++;
          }

          let siblingHint = '';
          if (isTextEntryBox) {
            siblingHint = findBoxContextHint(el);
          }

          const rawText = getCleanInteractiveText(el, 85);
          let rawPlaceholder = (
            el.getAttribute('placeholder') ||
            el.getAttribute('aria-placeholder') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('name') ||
            siblingHint ||
            ''
          ).replace(/\s+/g, ' ').trim().slice(0, 75);

          if (isTextEntryBox) {
            const boxLabel = `ช่องพิมพ์ข้อความ กล่องที่ ${editableBoxOrder} (${tag === 'textarea' ? 'textarea' : isCE ? 'contenteditable' : tag})`;
            if (!rawPlaceholder) {
              rawPlaceholder = boxLabel;
            } else if (!rawPlaceholder.includes('กล่องที่')) {
              rawPlaceholder = `${boxLabel} — ${rawPlaceholder}`.slice(0, 90);
            }
          }

          // Deduplicate text vs placeholder to save tokens
          const text = rawText;
          const placeholder = (rawPlaceholder && rawPlaceholder !== text) ? rawPlaceholder : (isTextEntryBox ? `ช่องพิมพ์ข้อความ กล่องที่ ${editableBoxOrder}` : '');

          if (item.kind !== 'input' && !isTextEntryBox && !text && !placeholder) continue;

          const id = nextId++;
          el.setAttribute('data-yt-id', String(id));

          let tagDesc = tag;
          if (tag === 'textarea') {
            tagDesc = `textarea[box=${editableBoxOrder}]`;
          } else if (isCE || role === 'textbox') {
            tagDesc = `textbox[contenteditable="true"][box=${editableBoxOrder}]`;
          } else if (item.kind === 'popup' || role === 'gridcell' || role === 'option') {
            tagDesc = `option`;
          } else if (type) {
            tagDesc = `${tag}[${type}]`;
          } else if (role) {
            tagDesc = `${tag}[${role}]`;
          }

          // Return ONLY { id, tag, text, placeholder } (omit empty fields to minimize JSON payload)
          const compactEl = { id, tag: tagDesc };
          if (text) compactEl.text = text;
          if (placeholder) compactEl.placeholder = placeholder;
          elements.push(compactEl);
        }

        // Extract clean visible text summary (รวมข้อความใน Shadow DOM และค่าใน <textarea> ด้วย)
        const textChunks = [];
        if (document.body && document.body.innerText) {
          textChunks.push(document.body.innerText);
        }
        for (const r of allRoots) {
          if (r !== document && r.innerText) {
            textChunks.push(r.innerText);
          }
        }
        for (const ta of querySelectorAllDeep('textarea, [contenteditable]:not([contenteditable="false"])')) {
          const val = (typeof ta.value === 'string' ? ta.value : ta.innerText || '').trim();
          if (val) textChunks.push(`[ข้อความในกล่องพิมพ์]: ${val}`);
        }
        const bodyText = textChunks.join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, 2200);

        // Yotathai Rules Audit (broken images, Google Storage/Drive links)
        const imgs = querySelectorAllDeep('img');
        const brokenImages = imgs
          .filter(img => img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:'))
          .map(img => img.src.slice(0, 100))
          .slice(0, 8);

        const allUrls = [
          ...imgs.map(i => i.src || ''),
          ...querySelectorAllDeep('a[href]').map(a => a.href || '')
        ];
        const googleLeakUrls = allUrls
          .filter(u => /firebasestorage\.googleapis\.com|storage\.googleapis\.com|drive\.google\.com|docs\.google\.com/i.test(u))
          .slice(0, 8);

        return {
          url: window.location.href,
          title: document.title,
          restricted: false,
          elements,
          pageText: bodyText,
          audit: {
            totalImages: imgs.length,
            brokenImages,
            googleLeakUrls
          }
        };
      }
    });

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 5000));
    const results = await Promise.race([scriptPromise, timeoutPromise]);

    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (err) {
    console.warn('Snapshot fallback:', err);
  }

  return {
    url: tab.url || '',
    title: tab.title || '',
    restricted: true,
    elements: [],
    pageText: '',
    audit: null
  };
}

// 4. Wait for Tab Complete (Fast, non-blocking for SPAs)
async function waitForTabLoad(tabId, timeoutMs = 3500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t.status === 'complete') {
        await new Promise(r => setTimeout(r, 350));
        return t;
      }
    } catch (e) {
      break;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  try {
    return await chrome.tabs.get(tabId);
  } catch (e) {
    return null;
  }
}

async function execScriptWithTimeout(options, timeoutMs = 8000) {
  const timer = new Promise(resolve => setTimeout(() => resolve([{ result: { ok: false, msg: 'คำสั่งหน้าเว็บใช้เวลานานเกินกำหนด ข้ามไปขั้นตอนถัดไป' } }]), timeoutMs));
  return Promise.race([chrome.scripting.executeScript(options), timer]);
}

// Helper: แคปภาพหน้าจอของแท็บปัจจุบันเพื่อส่งให้ OCR สกัดข้อความจากภาพสลิป/รูปภาพบนหน้าจอ
async function captureTabScreenshotAttachment() {
  try {
    const winId = await ensureWindowId();
    const dataUrl = await chrome.tabs.captureVisibleTab(winId || null, { format: 'png' });
    if (!dataUrl) return null;
    const ts = new Date().toLocaleTimeString('th-TH');
    return {
      name: `ภาพแคปหน้าจอแท็บปัจจุบัน_${ts}.png`,
      type: 'image/png',
      data: dataUrl,
      isImage: true
    };
  } catch (err) {
    console.warn('captureVisibleTab error:', err);
    return null;
  }
}

// 5. Execute Single Browser Action on Active Tab (v2.5 — ทะลุ Shadow DOM & iframe + รองรับ LINE OA / Vue / React Rich Text Editor)
async function executeBrowserAction(action) {
  let tab = await getActiveTab();
  if (!tab) return 'ไม่พบแท็บที่เปิดอยู่';

  if (action.type === 'read_screen_ocr') {
    appendActionBadge('📸 กำลังแคปหน้าจอแท็บปัจจุบันเพื่ออ่านภาพสลิป/ข้อความในรูป (OCR)...');
    const shot = await captureTabScreenshotAttachment();
    if (shot) {
      latestScreenOcrAttachment = shot;
      return 'แคปภาพหน้าจอสำเร็จและเตรียมส่งเข้า OCR ในขั้นตอนถัดไปแล้ว';
    }
    return 'ไม่สามารถแคปภาพหน้าจอของแท็บนี้ได้';
  }

  if (action.type === 'navigate') {
    let targetUrl = action.url || '';
    if (targetUrl && !/^(https?|chrome-extension|chrome):\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
    appendActionBadge(`🌐 เปิดหน้าเว็บ: ${targetUrl}`);
    await chrome.tabs.update(tab.id, { url: targetUrl });
    await waitForTabLoad(tab.id, 6000);
    await updateActiveTabDisplay();
    return `เปิดหน้า ${targetUrl} เรียบร้อย`;
  }

  if (action.type === 'new_tab') {
    let targetUrl = action.url || 'https://www.google.com';
    if (!/^(https?|chrome-extension|chrome):\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
    appendActionBadge(`➕ เปิดแท็บใหม่: ${targetUrl}`);
    const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
    await waitForTabLoad(newTab.id, 6000);
    await updateActiveTabDisplay();
    return `เปิดแท็บใหม่ ${targetUrl} เรียบร้อย`;
  }

  if (action.type === 'wait') {
    const ms = Math.min(Math.max(Number(action.ms) || 1000, 400), 3000);
    appendActionBadge(`⏳ รอหน้าเว็บโหลด (${(ms / 1000).toFixed(1)} วินาที)...`);
    await new Promise(r => setTimeout(r, ms));
    return `รอ ${ms}ms เรียบร้อย`;
  }

  if (action.type === 'scroll') {
    const dir = action.direction === 'up' ? -1 : 1;
    const amt = (Number(action.amount) || 450) * dir;
    const targetPane = (action.target || 'main').toLowerCase(); // 'left' | 'right' | 'main'
    const paneLabel = targetPane === 'left' ? ' (แถบรายชื่อแชทฝั่งซ้าย)' : targetPane === 'right' ? ' (ห้องข้อความแชทฝั่งขวา)' : '';
    appendActionBadge(`📜 เลื่อนหน้าจอ${dir > 0 ? 'ลง' : 'ขึ้น'}${paneLabel}`);
    const res = await execScriptWithTimeout({
      target: { tabId: tab.id },
      func: (scrollY, pane) => {
        function collectAllRoots(startRoot = document, visited = new Set()) {
          const roots = [];
          function walk(root) {
            if (!root || visited.has(root)) return;
            visited.add(root);
            roots.push(root);
            let allNodes = [];
            try { allNodes = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : []; } catch (e) {}
            for (const el of allNodes) {
              if (el.shadowRoot) walk(el.shadowRoot);
              if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
                try { if (el.contentDocument) walk(el.contentDocument); } catch (e) {}
              }
            }
          }
          walk(startRoot);
          return roots;
        }
        function querySelectorAllDeep(selector) {
          const out = [];
          const seen = new Set();
          for (const r of collectAllRoots(document)) {
            try {
              for (const el of r.querySelectorAll(selector)) {
                if (!seen.has(el)) { seen.add(el); out.push(el); }
              }
            } catch (e) {}
          }
          return out;
        }

        const isScrollable = (el) => {
          if (!el || el === document.body || el === document.documentElement) return false;
          if (el.scrollHeight <= el.clientHeight + 20) return false;
          const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
          const st = win.getComputedStyle(el);
          const oy = st.overflowY;
          return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && st.display !== 'none' && st.visibility !== 'hidden';
        };

        const allScrollables = querySelectorAllDeep('div, ul, section, main, aside').filter(el => {
          if (!isScrollable(el)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 120 && r.height > 150;
        });

        let chosen = null;
        if (pane === 'left') {
          const leftCands = allScrollables.filter(el => {
            const r = el.getBoundingClientRect();
            return r.left < window.innerWidth * 0.45 && r.width < window.innerWidth * 0.65;
          });
          leftCands.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
          chosen = leftCands[0] || null;
        } else if (pane === 'right') {
          const rightCands = allScrollables.filter(el => {
            const r = el.getBoundingClientRect();
            return r.left >= window.innerWidth * 0.18 && r.right > window.innerWidth * 0.55;
          });
          rightCands.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
          chosen = rightCands[0] || null;
        }

        if (!chosen && allScrollables.length > 0 && (location.hostname.includes('line.biz') || location.pathname.includes('/messages'))) {
          allScrollables.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth));
          chosen = allScrollables[0];
        }

        if (chosen) {
          chosen.scrollBy({ top: scrollY, behavior: 'smooth' });
          return { ok: true, msg: `เลื่อนกล่องข้อมูล (${pane}) เรียบร้อย` };
        }

        window.scrollBy({ top: scrollY, behavior: 'smooth' });
        return { ok: true, msg: 'เลื่อนหน้าจอหลักเรียบร้อย' };
      },
      args: [amt, targetPane]
    }, 4000);
    await new Promise(r => setTimeout(r, 650));
    return res?.[0]?.result?.msg || 'เลื่อนหน้าจอเรียบร้อย';
  }

  if (action.type === 'click') {
    appendActionBadge(`👆 คลิก [${action.id || ''}]: ${action.label || ''}`);
    const res = await execScriptWithTimeout({
      target: { tabId: tab.id },
      func: (targetId, fallbackText) => {
        function collectAllRoots(startRoot = document, visited = new Set()) {
          const roots = [];
          function walk(root) {
            if (!root || visited.has(root)) return;
            visited.add(root);
            roots.push(root);
            let allNodes = [];
            try { allNodes = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : []; } catch (e) {}
            for (const el of allNodes) {
              if (el.shadowRoot) walk(el.shadowRoot);
              if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
                try { if (el.contentDocument) walk(el.contentDocument); } catch (e) {}
              }
            }
          }
          walk(startRoot);
          return roots;
        }
        function querySelectorAllDeep(selector) {
          const out = [];
          const seen = new Set();
          for (const r of collectAllRoots(document)) {
            try {
              for (const el of r.querySelectorAll(selector)) {
                if (!seen.has(el)) { seen.add(el); out.push(el); }
              }
            } catch (e) {}
          }
          return out;
        }
        function querySelectorDeep(selector) {
          return querySelectorAllDeep(selector)[0] || null;
        }

        const isVis = (node) => {
          if (!node) return false;
          const r = node.getBoundingClientRect();
          if (r.width < 3 || r.height < 3) return false;
          const win = (node.ownerDocument && node.ownerDocument.defaultView) || window;
          const st = win.getComputedStyle(node);
          return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
        };

        let el = targetId ? querySelectorDeep(`[data-yt-id="${targetId}"]`) : null;
        if (el && !isVis(el)) el = null;

        if (!el && fallbackText) {
          const cleanTarget = fallbackText.trim();
          const all = querySelectorAllDeep(
            '[aria-label="โพสต์"], [aria-label="Post"], button, [role="button"], a, [role="option"], [role="gridcell"], td, li, span, div, input[type="submit"]'
          ).filter(isVis);
          // 1) Exact match on aria-label or leaf/small elements first (crucial for "บันทึก", "โพสต์", or calendar dates)
          el = all.find(n => (n.getAttribute('aria-label') || '').trim() === cleanTarget) ||
               all.find(n => n.children.length <= 2 && (n.innerText || n.value || n.getAttribute('aria-label') || '').trim() === cleanTarget);
          // 2) Substring match on interactive elements
          if (!el) {
            el = all.find(n => n.children.length <= 3 && (n.innerText || n.value || n.getAttribute('aria-label') || '').trim().includes(cleanTarget));
          }
        }
        if (!el) return { ok: false, msg: `ไม่พบปุ่ม "${fallbackText || targetId}" บนหน้าจอ` };

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const origOutline = el.style.outline;
        const origBoxShadow = el.style.boxShadow;
        el.style.outline = '3px solid #f97316';
        el.style.boxShadow = '0 0 18px rgba(249, 115, 22, 0.85)';
        setTimeout(() => {
          el.style.outline = origOutline;
          el.style.boxShadow = origBoxShadow;
        }, 1500);

        el.focus();
        // Dispatch pointer + mouse events with composed: true so Shadow DOM components receive them
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
        el.click();
        return { ok: true, msg: `คลิก "${(el.innerText || el.value || el.getAttribute('aria-label') || fallbackText || '').slice(0, 40).trim()}" สำเร็จ` };
      },
      args: [String(action.id || ''), String(action.label || '')]
    }, 6000);
    await new Promise(r => setTimeout(r, 700));
    await waitForTabLoad(tab.id, 2500);
    return res?.[0]?.result?.msg || 'คลิกเรียบร้อย';
  }

  if (action.type === 'type') {
    const boxNum = Number(action.boxIndex || action.index || 0);
    appendActionBadge(`⌨️ พิมพ์ "${action.value}" ลงช่อง [${action.id || (boxNum ? `กล่องที่ ${boxNum}` : 'แชท/โพสต์/ค้นหา')}]`);
    const res = await execScriptWithTimeout({
      target: { tabId: tab.id },
      func: async (targetId, textValue, pressEnter, targetBoxIndex) => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // 1. ฟังก์ชันค้นหาแบบทะลุทุก Shadow Root และ Same-Origin iframe (Deep Query Selector)
        function collectAllRoots(startRoot = document, visited = new Set()) {
          const roots = [];
          function walk(root) {
            if (!root || visited.has(root)) return;
            visited.add(root);
            roots.push(root);
            let allNodes = [];
            try { allNodes = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : []; } catch (e) {}
            for (const el of allNodes) {
              if (el.shadowRoot) walk(el.shadowRoot);
              if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
                try { if (el.contentDocument) walk(el.contentDocument); } catch (e) {}
              }
            }
          }
          walk(startRoot);
          return roots;
        }

        function querySelectorAllDeep(selector) {
          const out = [];
          const seen = new Set();
          for (const r of collectAllRoots(document)) {
            try {
              for (const el of r.querySelectorAll(selector)) {
                if (!seen.has(el)) { seen.add(el); out.push(el); }
              }
            } catch (e) {}
          }
          return out;
        }

        function querySelectorDeep(selector) {
          return querySelectorAllDeep(selector)[0] || null;
        }

        const isVisible = (node) => {
          if (!node) return false;
          const r = node.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
          const win = (node.ownerDocument && node.ownerDocument.defaultView) || window;
          const st = win.getComputedStyle(node);
          return st.display !== 'none' && st.visibility !== 'hidden';
        };

        const isEditableBox = (node) => {
          if (!node) return false;
          const ce = node.getAttribute && node.getAttribute('contenteditable');
          return Boolean(
            node.isContentEditable ||
            ce === 'true' ||
            ce === '' ||
            ce === 'plaintext-only' ||
            (node.getAttribute && node.getAttribute('role') === 'textbox') ||
            node.tagName === 'INPUT' ||
            node.tagName === 'TEXTAREA'
          );
        };

        let el = targetId && targetId !== '0' ? querySelectorDeep(`[data-yt-id="${targetId}"]`) : null;

        // กรณีพิเศษ Facebook Post: ถ้า el ที่ชี้ไปเป็นปุ่มเปิดกล่องสร้างโพสต์ ("คุณกำลังคิดอะไรอยู่..." / "เขียนอะไรสักหน่อย...") ให้คลิกเปิด Modal ก่อน!
        if (el && !isEditableBox(el)) {
          let innerEdit = null;
          try {
            innerEdit = el.querySelector('textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], input');
            if (!innerEdit && el.shadowRoot) {
              innerEdit = el.shadowRoot.querySelector('textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], input');
            }
          } catch (e) {}
          if (innerEdit && isVisible(innerEdit)) {
            el = innerEdit;
          } else {
            const elLabel = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
            if (elLabel.includes('คิดอะไรอยู่') || elLabel.includes('เขียนอะไร') || elLabel.includes("what's on your mind")) {
              el.click();
              await sleep(1100);
              el = null;
            }
          }
        }

        // ถ้าอยู่หน้าฟีด Facebook แล้วสั่งพิมพ์โพสต์โดยยังไม่ได้เปิดกล่องสร้างโพสต์ ให้คลิกปุ่ม "คุณกำลังคิดอะไรอยู่..." อัตโนมัติ
        if (!el && location.hostname.includes('facebook.com') && !location.pathname.includes('/messages')) {
          const existingDialogEditor = querySelectorDeep(
            '[role="dialog"] [contenteditable="true"][role="textbox"], [role="dialog"] [contenteditable="true"], [role="dialog"] [role="textbox"]'
          );
          if (existingDialogEditor && isVisible(existingDialogEditor)) {
            el = existingDialogEditor;
          } else {
            const postTrigger = querySelectorAllDeep('[role="button"], div, span').find(n => {
              if (!isVisible(n)) return false;
              const t = ((n.getAttribute('aria-label') || '') + ' ' + (n.innerText || '')).trim();
              return (t.includes('คุณกำลังคิดอะไรอยู่') || t.includes('เขียนอะไรสักหน่อย') || t.includes("What's on your mind")) && t.length < 90;
            });
            if (postTrigger) {
              postTrigger.click();
              await sleep(1100);
              const openedEditor = querySelectorDeep(
                '[role="dialog"] [contenteditable="true"][role="textbox"], [role="dialog"] [contenteditable="true"], [role="dialog"] [role="textbox"]'
              );
              if (openedEditor && isVisible(openedEditor)) {
                el = openedEditor;
              }
            }
          }
        }

        // Smart fallback (ทะลุ Shadow DOM & iframe + รองรับการเลือกตามลำดับกล่อง targetBoxIndex 1, 2, ... ใน LINE OA Manager)
        if (!el || !isEditableBox(el)) {
          const candidates = querySelectorAllDeep(
            'textarea, ' +
            '[contenteditable]:not([contenteditable="false"]), ' +
            '[contenteditable="true"], ' +
            '[role="textbox"], ' +
            'input[type="text"], ' +
            'input[type="search"], ' +
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'
          ).filter(isVisible);

          if (targetBoxIndex && targetBoxIndex >= 1 && targetBoxIndex <= candidates.length) {
            el = candidates[targetBoxIndex - 1];
          } else if (targetId && Number(targetId) >= 1 && Number(targetId) <= candidates.length && !querySelectorDeep(`[data-yt-id="${targetId}"]`)) {
            // หาก AI ส่ง id เป็น 1 หรือ 2 โดยหมายถึงกล่องที่ 1 หรือ 2
            el = candidates[Number(targetId) - 1];
          } else {
            const preferredBox = candidates.find(c => {
              if (c.closest && c.closest('[role="dialog"]')) return true;
              const label = (c.getAttribute('aria-label') || c.getAttribute('aria-placeholder') || c.getAttribute('placeholder') || c.parentElement?.innerText || '').toLowerCase();
              return (
                label.includes('คิดอะไรอยู่') ||
                label.includes('เขียนอะไร') ||
                label.includes('สร้างโพสต์') ||
                label.includes('ข้อความ') ||
                label.includes('message') ||
                label.includes('enter') ||
                label.includes('aa') ||
                label.includes('คิดเห็น') ||
                label.includes('แชท')
              );
            });
            el = preferredBox || candidates[0] || null;
          }
        }

        if (!el) return { ok: false, msg: 'ไม่พบช่องพิมพ์ข้อความบนหน้าจอ (ตรวจทั้ง DOM ปกติ, Shadow DOM และ iframe แล้ว)' };

        // ป้องกันการพิมพ์ซ้อนทับกันในหน้าเว็บเดียวกัน (Page-level Re-entrancy Lock)
        if (window.__ytTypingLock) {
          return { ok: false, msg: 'กำลังพิมพ์ข้อความอยู่ ข้ามการพิมพ์ซ้ำ' };
        }
        window.__ytTypingLock = true;

        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const origOutline = el.style.outline;
          el.style.outline = '3px solid #f97316';
          setTimeout(() => { el.style.outline = origOutline; }, 1800);

          const doc = el.ownerDocument || document;
          const win = doc.defaultView || window;
          const isMessengerOrFb = location.hostname.includes('facebook.com') || location.hostname.includes('messenger.com');

          // 1. คลิกและโฟกัสไปที่ Element (สำคัญสำหรับ LINE OA / Vue / React Editor)
          try {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
            el.click();
          } catch (e) {}
          el.focus();
          await sleep(60);

          const ceAttr = el.getAttribute && el.getAttribute('contenteditable');
          const isCE = Boolean(
            el.isContentEditable ||
            ceAttr === 'true' ||
            ceAttr === '' ||
            ceAttr === 'plaintext-only' ||
            (el.getAttribute && el.getAttribute('role') === 'textbox' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')
          );

          if (isCE) {
            // 2A. กรณีเป็น contenteditable (LINE OA Rich Text Editor / Vue.js / React / Facebook / Messenger)
            try {
              const sel = win.getSelection ? win.getSelection() : window.getSelection();
              const range = doc.createRange();
              range.selectNodeContents(el);
              sel.removeAllRanges();
              sel.addRange(range);
              doc.execCommand('selectAll', false, null);
              doc.execCommand('delete', false, null);
              await sleep(40);
            } catch (e) {}

            // ใช้ execCommand('insertText') เพื่อแทรกข้อความ
            let inserted = false;
            try {
              inserted = doc.execCommand('insertText', false, textValue);
            } catch (e) {}

            await sleep(60);

            const afterTxt = (el.innerText || el.textContent || '').trim();
            if (!inserted || afterTxt.length === 0) {
              // Fallback สำหรับ Custom Rich Text Editor ใน Shadow DOM / Vue.js ที่ execCommand ไม่ทำงาน
              try {
                el.textContent = textValue;
                el.dispatchEvent(new InputEvent('input', {
                  bubbles: true,
                  composed: true,
                  inputType: 'insertText',
                  data: textValue
                }));
                el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              } catch (e) {}
            } else if (!isMessengerOrFb) {
              // สำหรับ LINE OA Manager (`manager.line.biz`) หรือเว็บ Vue.js อื่นๆ (ที่ไม่ใช่ Messenger)
              // กระตุ้น change event เพื่อให้ตัวนับตัวอักษร (เช่น 171/500) และปุ่มบันทึกของ Vue อัปเดต State ทันที
              try {
                el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              } catch (e) {}
            }
          } else {
            // 2B. กรณีเป็น <textarea> หรือ <input> (รองรับ LINE OA Manager / Vue.js v-model / React Controlled Component 100%)
            const proto = el.tagName === 'TEXTAREA'
              ? win.HTMLTextAreaElement.prototype
              : win.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

            // เคลียร์ค่าเก่าและตั้งค่าใหม่ผ่าน Native Prototype Value Setter
            if (nativeSetter) {
              nativeSetter.call(el, '');
            } else {
              el.value = '';
            }
            el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward', data: null }));

            if (nativeSetter) {
              nativeSetter.call(el, textValue);
            } else {
              el.value = textValue;
            }

            // ยิงทั้ง InputEvent (พร้อม composed: true ทะลุ Shadow DOM) และ Event('change') เพื่อให้ Vue/React อัปเดต State และตัวนับ 171/500 ทันที
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              composed: true,
              inputType: 'insertText',
              data: textValue
            }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }

          await sleep(220);

          if (pressEnter) {
            // ตรวจสอบก่อนว่าอยู่ในกล่องสร้างโพสต์ Facebook ([role="dialog"] ที่มีปุ่ม aria-label="โพสต์" / "Post") หรือไม่
            const dialogContainer = (el.closest && el.closest('[role="dialog"]')) || querySelectorDeep('[role="dialog"]');
            let fbPostBtn = null;
            if (dialogContainer && location.hostname.includes('facebook.com') && !location.pathname.includes('/messages')) {
              const postBtnSelectors = [
                '[aria-label="โพสต์"][role="button"]',
                '[aria-label="Post"][role="button"]',
                '[aria-label="โพสต์"]',
                '[aria-label="Post"]',
                'button[type="submit"]'
              ];
              for (const sel of postBtnSelectors) {
                const candidate = dialogContainer.querySelector(sel);
                if (candidate && isVisible(candidate) && candidate.getAttribute('aria-disabled') !== 'true') {
                  fbPostBtn = candidate;
                  break;
                }
              }
              if (!fbPostBtn) {
                fbPostBtn = Array.from(dialogContainer.querySelectorAll('[role="button"], button')).find(b => {
                  if (!isVisible(b) || b.getAttribute('aria-disabled') === 'true') return false;
                  const t = (b.innerText || b.getAttribute('aria-label') || '').trim();
                  return t === 'โพสต์' || t === 'Post' || t === 'เผยแพร่';
                });
              }
            }

            if (fbPostBtn) {
              await sleep(180);
              fbPostBtn.click();
              return { ok: true, msg: `พิมพ์ข้อความ "${textValue}" และกดปุ่ม "โพสต์" บน Facebook สำเร็จ` };
            }

            // กรณีเป็นหน้าตั้งค่า LINE OA Manager (manager.line.biz): การกด Enter ใน textarea คือการขึ้นบรรทัดใหม่ ไม่ใช่การส่งแชท!
            // ดังนั้นหากไม่ได้อยู่ในห้องแชท แต่สั่ง pressEnter ในหน้าตั้งค่าที่มีปุ่ม "บันทึก" (Save) ให้คลิกปุ่ม "บันทึก" แทน หรือไม่กด Enter ทิ้งเปล่า
            if (location.hostname.includes('manager.line.biz') && !location.hostname.includes('chat.line.biz')) {
              const saveBtn = querySelectorAllDeep('button, [role="button"], input[type="submit"]').find(b => {
                if (!isVisible(b) || b.disabled) return false;
                const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
                return t === 'บันทึก' || t === 'Save' || t === 'บันทึกการแก้ไข';
              });
              if (saveBtn) {
                await sleep(150);
                saveBtn.click();
                return { ok: true, msg: `พิมพ์ข้อความ "${textValue}" ลงกล่องข้อความและกดปุ่ม "บันทึก" ใน LINE OA Manager สำเร็จ` };
              }
              return { ok: true, msg: `พิมพ์ข้อความ "${textValue}" ลงกล่องข้อความใน LINE OA Manager สำเร็จ` };
            }

            // กรณีเป็น Messenger / LINE Chat / ช่องค้นหา: ส่งด้วย keydown Enter เพียงครั้งเดียว
            const enterOpts = {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              charCode: 13,
              bubbles: true,
              cancelable: true,
              composed: true
            };
            el.dispatchEvent(new KeyboardEvent('keydown', enterOpts));

            if (el.form) {
              try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch (e) {}
            }

            // รอ 300ms หากข้อความยังค้างอยู่ในกล่อง (Enter ไม่ส่ง) จึงค่อยคลิกปุ่มส่ง
            await sleep(300);
            if (isCE && (el.innerText || '').trim().length > 0) {
              const sendSelectors = [
                '[aria-label="กด Enter เพื่อส่ง"]',
                '[aria-label="ส่ง"]',
                '[aria-label="Press enter to send"]',
                '[aria-label="Press Enter to send"]',
                '[aria-label="Send"]',
                'div[role="button"][aria-label*="ส่ง"]',
                'div[role="button"][aria-label*="Send"]',
                'button[type="submit"]'
              ];
              for (const sel of sendSelectors) {
                const sendBtn = querySelectorDeep(sel);
                if (sendBtn && isVisible(sendBtn)) {
                  sendBtn.click();
                  break;
                }
              }
            }
          }

          return { ok: true, msg: `พิมพ์ข้อความ "${textValue}"${pressEnter ? ' และกดส่ง/บันทึก' : ''} สำเร็จ` };
        } finally {
          window.__ytTypingLock = false;
        }
      },
      args: [String(action.id || ''), String(action.value || ''), Boolean(action.pressEnter), boxNum]
    }, 10000);
    await new Promise(r => setTimeout(r, 700));
    if (action.pressEnter) {
      await waitForTabLoad(tab.id, 2500);
    }
    return res?.[0]?.result?.msg || 'พิมพ์ข้อความเรียบร้อย';
  }

  return 'ดำเนินการแล้ว';
}

// 6. UI Message, CSV/Excel Exporter & Multi-Conversation Session Manager
function extractCsvRowsFromText(text) {
  if (!text) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tableLines = lines.filter(l => l.includes('|') && l.split('|').filter(c => c.trim() !== '').length >= 2);
  const rows = [];
  for (const line of tableLines) {
    // ข้ามบรรทัดคั่นตาราง Markdown เช่น |---|---|
    if (/^\|?[\s\-:|]+\|?$/.test(line)) continue;
    const rawCells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (rawCells.length >= 2) {
      rows.push(rawCells);
    }
  }
  if (rows.length >= 2) return rows;
  return null;
}

function downloadCsvFile(rows, filenamePrefix = 'Yotathai_Summary') {
  const escapeCsvCell = (val) => {
    const s = String(val ?? '').replace(/\r?\n/g, ' ').trim();
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent = '\uFEFF' + rows.map(r => r.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `${filenamePrefix}_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

function appendMessage(role, text) {
  if (!text) return;
  if (welcomeCard) welcomeCard.classList.add('hidden');
  const div = document.createElement('div');
  div.className = `msg ${role === 'user' ? 'msg-user' : 'msg-ai'}`;

  const textSpan = document.createElement('div');
  textSpan.textContent = text;
  div.appendChild(textSpan);

  // หากข้อความตอบกลับของ AI มีตารางข้อมูล (เช่น สรุปยอดโอนสลิป / รายชื่อ / ตารางเปรียบเทียบ) ให้แสดงปุ่มดาวน์โหลด Excel (.csv) ทันที
  if (role === 'ai') {
    const csvRows = extractCsvRowsFromText(text);
    if (csvRows && csvRows.length >= 2) {
      const exportBtn = document.createElement('button');
      exportBtn.className = 'csv-export-btn';
      exportBtn.textContent = `📥 ดาวน์โหลดตาราง Excel (.csv) [${csvRows.length - 1} รายการ]`;
      exportBtn.addEventListener('click', () => {
        downloadCsvFile(csvRows, 'Yotathai_AI_Table');
      });
      div.appendChild(exportBtn);
    } else if (taskScratchpad.length >= 2 && (text.includes('สรุป') || text.includes('รายการ') || text.includes('บาท'))) {
      const scratchRows = [['ลำดับ', 'ข้อมูลที่บันทึกได้'], ...taskScratchpad.map((item, idx) => [String(idx + 1), item])];
      const exportBtn = document.createElement('button');
      exportBtn.className = 'csv-export-btn';
      exportBtn.textContent = `📥 ดาวน์โหลดข้อมูลสะสม Excel (.csv) [${taskScratchpad.length} รายการ]`;
      exportBtn.addEventListener('click', () => {
        downloadCsvFile(scratchRows, 'Yotathai_Scratchpad');
      });
      div.appendChild(exportBtn);
    }
  }

  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendActionBadge(text) {
  if (welcomeCard) welcomeCard.classList.add('hidden');
  const div = document.createElement('div');
  div.className = 'msg msg-action';
  div.textContent = text;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function deriveSessionTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user' && m.content);
  if (!firstUser) return 'บทสนทนาใหม่';
  const clean = firstUser.content.replace(/\s+/g, ' ').trim();
  return clean.length > 32 ? clean.slice(0, 32) + '…' : clean;
}

function formatTimeShort(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

function renderSessionDropdown() {
  if (!sessionSelect) return;
  sessionSelect.innerHTML = '';

  const existsInSaved = sessions.some(s => s.id === currentSessionId);
  if (!existsInSaved) {
    const newOpt = document.createElement('option');
    newOpt.value = currentSessionId;
    newOpt.textContent = '✨ บทสนทนาใหม่ (หน้าต่างนี้)';
    sessionSelect.appendChild(newOpt);
  }

  const sorted = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sorted.forEach((s, idx) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    const t = formatTimeShort(s.updatedAt);
    opt.textContent = `💬 ${idx + 1}. ${s.title || 'บทสนทนา'}${t ? ` (${t})` : ''}`;
    sessionSelect.appendChild(opt);
  });

  sessionSelect.value = currentSessionId;
}

function renderCurrentChat() {
  chatContainer.innerHTML = '';
  chatContainer.appendChild(welcomeCard);
  if (!chatHistory || chatHistory.length === 0) {
    welcomeCard.classList.remove('hidden');
  } else {
    welcomeCard.classList.add('hidden');
    for (const item of chatHistory) {
      appendMessage(item.role, item.content);
    }
  }
}

async function saveChatHistory() {
  const winId = await ensureWindowId();
  const activeTab = await getActiveTab();
  const data = await chrome.storage.local.get(['ytSessions', 'ytWindowSessionMap', 'ytTabSessionMap']);
  let allSessions = Array.isArray(data.ytSessions) ? data.ytSessions : [];
  const winMap = data.ytWindowSessionMap || {};
  const tabMap = data.ytTabSessionMap || {};

  if (!currentSessionId) {
    currentSessionId = generateSessionId();
  }

  const title = chatHistory.length > 0 ? deriveSessionTitle(chatHistory) : '✨ เรื่องใหม่ (พร้อมสั่งงาน)';
  const updatedSession = {
    id: currentSessionId,
    title,
    updatedAt: Date.now(),
    messages: chatHistory.slice(-30)
  };
  const existingIdx = allSessions.findIndex(s => s.id === currentSessionId);
  if (existingIdx >= 0) {
    allSessions[existingIdx] = updatedSession;
  } else {
    allSessions.unshift(updatedSession);
  }
  allSessions = allSessions
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 35);

  if (winId !== null) {
    winMap[winId] = currentSessionId;
  }
  if (activeTab && activeTab.id) {
    tabMap[activeTab.id] = currentSessionId;
  }

  sessions = allSessions;
  await chrome.storage.local.set({
    ytSessions: allSessions,
    ytWindowSessionMap: winMap,
    ytTabSessionMap: tabMap
  });
  renderSessionDropdown();
}

async function startNewConversation() {
  const winId = await ensureWindowId();
  const activeTab = await getActiveTab();
  currentSessionId = generateSessionId();
  chatHistory = [];

  const data = await chrome.storage.local.get(['ytSessions', 'ytWindowSessionMap', 'ytTabSessionMap']);
  let allSessions = Array.isArray(data.ytSessions) ? data.ytSessions : [];
  const winMap = data.ytWindowSessionMap || {};
  const tabMap = data.ytTabSessionMap || {};

  allSessions.unshift({
    id: currentSessionId,
    title: '✨ เรื่องใหม่ (พร้อมสั่งงาน)',
    updatedAt: Date.now(),
    messages: []
  });
  allSessions = allSessions.slice(0, 35);
  sessions = allSessions;

  if (winId !== null) {
    winMap[winId] = currentSessionId;
  }
  if (activeTab && activeTab.id) {
    tabMap[activeTab.id] = currentSessionId;
  }

  await chrome.storage.local.set({
    ytSessions: allSessions,
    ytWindowSessionMap: winMap,
    ytTabSessionMap: tabMap
  });

  renderCurrentChat();
  renderSessionDropdown();
  appendActionBadge('✨ เริ่มเรื่องใหม่สำหรับแท็บ/หน้าต่างนี้แล้ว (คลิกกลับไปแท็บหรือหน้าต่างเดิม เรื่องเดิมยังอยู่ครบ 100%)');
}

async function switchConversation(targetSessionId, bindCurrentTab = true) {
  const winId = await ensureWindowId();
  const activeTab = await getActiveTab();
  const data = await chrome.storage.local.get(['ytSessions', 'ytWindowSessionMap', 'ytTabSessionMap']);
  sessions = Array.isArray(data.ytSessions) ? data.ytSessions : [];
  const winMap = data.ytWindowSessionMap || {};
  const tabMap = data.ytTabSessionMap || {};

  const found = sessions.find(s => s.id === targetSessionId);
  if (found) {
    currentSessionId = found.id;
    chatHistory = Array.isArray(found.messages) ? [...found.messages] : [];
  } else {
    currentSessionId = targetSessionId || generateSessionId();
    chatHistory = [];
  }

  if (winId !== null) {
    winMap[winId] = currentSessionId;
  }
  if (bindCurrentTab && activeTab && activeTab.id) {
    tabMap[activeTab.id] = currentSessionId;
  }
  await chrome.storage.local.set({
    ytWindowSessionMap: winMap,
    ytTabSessionMap: tabMap
  });
  renderCurrentChat();
  renderSessionDropdown();
}

// ฟังก์ชันเปิดหน้าต่างเบราว์เซอร์ใหม่ + แยก AI คุยเรื่องใหม่ทันที โดยหน้าต่างเดิมยังเก็บเรื่องเดิมและบอทเดิมไว้ 100%
async function openIsolatedAiWindow() {
  try {
    // 1. บันทึกล็อกเรื่องเดิมไว้กับหน้าต่างเดิมและแท็บเดิมก่อน
    await saveChatHistory();

    // 2. สร้าง Session ใหม่สำหรับหน้าต่างใหม่ที่จะเปิด
    const newSessionId = generateSessionId();
    const data = await chrome.storage.local.get(['ytSessions', 'ytWindowSessionMap', 'ytTabSessionMap']);
    let allSessions = Array.isArray(data.ytSessions) ? data.ytSessions : [];
    const winMap = data.ytWindowSessionMap || {};
    const tabMap = data.ytTabSessionMap || {};

    allSessions.unshift({
      id: newSessionId,
      title: '🪟 เรื่องใหม่ (แยกหน้าต่าง)',
      updatedAt: Date.now(),
      messages: []
    });
    allSessions = allSessions.slice(0, 35);

    // 3. เปิดหน้าต่าง Chrome ใหม่ทันที
    const newWin = await chrome.windows.create({
      url: 'https://www.google.com',
      focused: true,
      type: 'normal'
    });

    if (newWin && newWin.id) {
      winMap[newWin.id] = newSessionId;
      if (newWin.tabs && newWin.tabs[0] && newWin.tabs[0].id) {
        tabMap[newWin.tabs[0].id] = newSessionId;
      }
    }

    await chrome.storage.local.set({
      ytSessions: allSessions,
      ytWindowSessionMap: winMap,
      ytTabSessionMap: tabMap
    });

    // 4. สั่งเปิดแถบข้าง ช่างถึก AI ในหน้าต่างใหม่ให้อัตโนมัติ
    if (newWin && newWin.id && chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ windowId: newWin.id });
      } catch (e) {}
    }

    appendActionBadge('🪟 เปิดหน้าต่างเบราว์เซอร์ใหม่ + แยก AI เรื่องใหม่เรียบร้อย (หน้าต่างนี้ยังเก็บเรื่องเดิมไว้ 100%)');
  } catch (err) {
    appendActionBadge(`⚠️ ไม่สามารถเปิดหน้าต่างใหม่ได้: ${err.message}`);
  }
}

async function loadChatHistory() {
  const winId = await ensureWindowId();
  const activeTab = await getActiveTab();
  const data = await chrome.storage.local.get([
    'ytSessions',
    'ytWindowSessionMap',
    'ytTabSessionMap',
    'ytChatHistory',
    'ytSelectedModel'
  ]);

  if (data.ytSelectedModel) {
    modelSelect.value = data.ytSelectedModel;
  } else {
    modelSelect.value = 'MODEL_PLACEHOLDER_M318'; // ค่าเริ่มต้น: Gemini 3.8 Flash ประหยัดพลังงาน
  }

  let allSessions = Array.isArray(data.ytSessions) ? data.ytSessions : [];
  const winMap = data.ytWindowSessionMap || {};
  const tabMap = data.ytTabSessionMap || {};

  // Migrate legacy single ytChatHistory into ytSessions if present
  if (allSessions.length === 0 && Array.isArray(data.ytChatHistory) && data.ytChatHistory.length > 0) {
    const migratedId = generateSessionId();
    allSessions.push({
      id: migratedId,
      title: deriveSessionTitle(data.ytChatHistory),
      updatedAt: Date.now(),
      messages: data.ytChatHistory.slice(-30)
    });
    await chrome.storage.local.set({ ytSessions: allSessions });
    await chrome.storage.local.remove('ytChatHistory');
  }

  // Check if this Chrome window or active tab already has a dedicated conversation session
  const tabSessionId = (activeTab && activeTab.id) ? tabMap[activeTab.id] : null;
  const winSessionId = winId !== null ? winMap[winId] : null;
  const mappedSessionId = tabSessionId || winSessionId;
  const mappedSession = mappedSessionId ? allSessions.find(s => s.id === mappedSessionId) : null;

  if (mappedSession) {
    currentSessionId = mappedSession.id;
    chatHistory = Array.isArray(mappedSession.messages) ? [...mappedSession.messages] : [];
  } else if (mappedSessionId) {
    // มีรหัสห้องที่ผูกไว้กับหน้าต่างนี้แล้ว (เช่น เพิ่งกดเปิดหน้าต่างแยกใหม่)
    currentSessionId = mappedSessionId;
    chatHistory = [];
  } else {
    // ตรวจสอบว่ามีหน้าต่างอื่นที่กำลังเปิดใช้งานห้องสนทนาอยู่หรือไม่
    const activeWindowIds = new Set();
    try {
      const allWins = await chrome.windows.getAll();
      allWins.forEach(w => activeWindowIds.add(String(w.id)));
    } catch (e) {}

    const otherOpenWindowsCount = Array.from(activeWindowIds).filter(id => String(id) !== String(winId)).length;
    const sessionsUsedByOtherWindows = new Set();
    for (const [wKey, sId] of Object.entries(winMap)) {
      if (String(winId) !== String(wKey) && activeWindowIds.has(String(wKey))) {
        sessionsUsedByOtherWindows.add(sId);
      }
    }

    // หากมีหน้าต่าง Chrome อื่นเปิดอยู่แล้ว หน้าต่างใหม่นี้จะได้ AI ห้องสนทนาเรื่องใหม่ทันทีโดยไม่ดึงเรื่องเก่ามาปน!
    if (otherOpenWindowsCount === 0 && allSessions.length > 0 && sessionsUsedByOtherWindows.size === 0) {
      currentSessionId = allSessions[0].id;
      chatHistory = Array.isArray(allSessions[0].messages) ? [...allSessions[0].messages] : [];
    } else {
      currentSessionId = generateSessionId();
      chatHistory = [];
      allSessions.unshift({
        id: currentSessionId,
        title: '🪟 เรื่องใหม่ (หน้าต่างนี้)',
        updatedAt: Date.now(),
        messages: []
      });
    }
  }

  if (winId !== null) {
    winMap[winId] = currentSessionId;
  }
  if (activeTab && activeTab.id) {
    tabMap[activeTab.id] = currentSessionId;
  }

  sessions = allSessions;
  await chrome.storage.local.set({
    ytSessions: allSessions,
    ytWindowSessionMap: winMap,
    ytTabSessionMap: tabMap
  });

  renderCurrentChat();
  renderSessionDropdown();
}

// Keep session dropdown synced across multiple Chrome windows without hijacking this window's active session
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.ytSessions) {
    sessions = Array.isArray(changes.ytSessions.newValue) ? changes.ytSessions.newValue : [];
    renderSessionDropdown();
  }
});

// 7. Main Agent Loop (รองรับทำงานต่อเนื่องสูงสุด 15 ขั้นตอน + ระบบกันค้างอัตโนมัติ)
async function callAgentBridgeWithTimeout(payload, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

let lastMasterGoalText = '';
let stepHistoryLog = [];

async function runAgentTurn(userText, isContinuation = false) {
  const attached = currentAttachment;
  if (!userText.trim() && !attached && !isContinuation) return;

  // หากของเดิมกำลังค้างอยู่ ให้สั่งหยุดของเดิมทันทีแล้วรันคำสั่งใหม่ของคุณช่างถึกเลย!
  if (isRunning) {
    stopRequested = true;
    await new Promise(r => setTimeout(r, 350));
  }

  isRunning = true;
  stopRequested = false;
  runningBar.classList.remove('hidden');
  runningStatusText.textContent = 'กำลังอ่านหน้าเว็บและวางแผน...';

  if (!isContinuation) {
    lastMasterGoalText = userText.trim() || (attached ? `วิเคราะห์ไฟล์แนบ: ${attached.name}` : '');
    stepHistoryLog = [];
    taskScratchpad = [];
    latestScreenOcrAttachment = null;

    let displayMsg = userText;
    if (attached) {
      displayMsg = `${userText ? userText + '\n' : ''}[แนบไฟล์: ${attached.name}]`;
      clearAttachment();
    }
    appendMessage('user', displayMsg);
    chatHistory.push({ role: 'user', content: displayMsg });
    await saveChatHistory();
  }

  // เก็บไฟล์แนบหรือภาพแคปหน้าจอให้คงอยู่ตลอดทุก Step ของคำสั่งนี้ (ไม่หายหลัง Step 1)
  let activeAttachment = attached || latestScreenOcrAttachment || null;

  let stepCount = 0;
  const maxSteps = 15;
  let lastActionResults = [];
  let needsMoreSteps = false;

  try {
    while (stepCount < maxSteps && !stopRequested) {
      stepCount++;
      const tab = await getActiveTab();
      const snapshot = await capturePageSnapshot(tab);

      // หากขั้นตอนก่อนหน้าเพิ่งสั่ง read_screen_ocr ให้ใช้ภาพแคปหน้าจอล่าสุดส่งเข้า OCR ทันที
      if (latestScreenOcrAttachment) {
        activeAttachment = latestScreenOcrAttachment;
      }

      runningStatusText.textContent = stepCount === 1
        ? 'กำลังคิดคำตอบ (Google AI Ultra)...'
        : `กำลังทำงานต่อเนื่อง ขั้นที่ ${stepCount}/${maxSteps}...`;

      let promptForStep = userText;
      if (stepCount > 1 || isContinuation) {
        const historyTrace = stepHistoryLog.length > 0
          ? `\n[ประวัติสิ่งที่ทำไปแล้วในรอบนี้ (ห้ามคลิกห้องเดิมหรือทำซ้ำขั้นตอนเดิมเด็ดขาด)]:\n- ${stepHistoryLog.slice(-12).join('\n- ')}`
          : '';
        const scratchpadTrace = taskScratchpad.length > 0
          ? `\n[สมุดจดข้อมูลสะสมข้ามหน้า (Scratchpad ที่บันทึกได้แล้ว ${taskScratchpad.length} รายการ)]:\n- ${taskScratchpad.join('\n- ')}`
          : '';
        promptForStep =
          `[คำสั่งหลักของคุณช่างถึก (ยึดเป้าหมายนี้เป็นหลัก 100% ห้ามหลงประเด็น)]: "${lastMasterGoalText || userText}"` +
          `${historyTrace}` +
          `${scratchpadTrace}` +
          `\n[ผลจากการกระทำล่าสุด (Step ${stepCount - 1})]: ${lastActionResults.join('; ') || 'ดำเนินการต่อ'}` +
          `\nกรุณาตรวจสอบหน้าเว็บล่าสุด (และข้อความ OCR จากภาพถ้ามี) แล้วทำขั้นตอนถัดไปทันที หากพบข้อมูลสำคัญให้ใส่ใน "scratchpad_add" เพื่อสะสมไว้ หรือสรุปผลเป็นตารางให้คุณช่างถึกหากครบถ้วนแล้ว`;
      }

      let data = null;
      try {
        data = await callAgentBridgeWithTimeout({
          userPrompt: promptForStep,
          history: chatHistory.slice(-10),
          snapshot,
          model: modelSelect.value,
          attachment: activeAttachment
        }, 35000);
      } catch (timeoutErr) {
        const errMsg = String(timeoutErr?.message || timeoutErr || '');
        if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
          throw new Error('ไม่สามารถเชื่อมต่อ Local Bridge (พอร์ต 19876) ได้ กรุณาเปิด start_bridge.command');
        }
        // หากโมเดลใหญ่ (เช่น Claude Sonnet) ช้าหรือค้าง ให้สลับไปใช้ Gemini 3.8 Flash อัตโนมัติทันทีเพื่อไม่ให้ค้าง!
        appendActionBadge('⚡ โมเดลหลักตอบช้าสลับใช้ Gemini 3.8 Flash อัตโนมัติเพื่อไม่ให้ค้าง...');
        data = await callAgentBridgeWithTimeout({
          userPrompt: promptForStep,
          history: chatHistory.slice(-10),
          snapshot,
          model: 'MODEL_PLACEHOLDER_M318',
          attachment: activeAttachment
        }, 30000);
      }

      if (!data || !data.ok) {
        appendMessage('ai', `⚠️ เกิดข้อผิดพลาด: ${data?.error || 'ไม่สามารถติดต่อ Local Bridge ได้'}`);
        break;
      }

      const plan = data.result || {};
      if (plan.memory_saved) {
        appendActionBadge(`🧠 จำข้อมูลใหม่ลงฐานความจำถาวร: "${plan.memory_saved}"`);
      }

      if (plan.scratchpad_add && typeof plan.scratchpad_add === 'string' && plan.scratchpad_add.trim().toLowerCase() !== 'null') {
        const cleanNote = plan.scratchpad_add.trim();
        if (cleanNote && !taskScratchpad.includes(cleanNote)) {
          taskScratchpad.push(cleanNote);
          appendActionBadge(`📝 จดบันทึกสะสม (#${taskScratchpad.length}): ${cleanNote}`);
        }
      }

      if (plan.trusted_updated && Array.isArray(plan.trusted_updated.trustedContacts)) {
        const joined = plan.trusted_updated.trustedContacts.join(', ');
        if (autoReplyWhitelist) autoReplyWhitelist.value = joined;
        await chrome.storage.local.set({ ytAutoReplyWhitelist: joined });
        if (plan.trusted_updated.action === 'added') {
          appendActionBadge(`👤 ตั้งค่า "${plan.trusted_updated.name}" เป็นคนสนิท → โหมดคุยเหมือนคุณช่างถึกคุยเอง`);
        } else {
          appendActionBadge(`🤖 ตั้งค่า "${plan.trusted_updated.name}" → โหมดบอกตรงๆ ว่าเป็น AI ผู้ช่วย`);
        }
        updatePartnerPersonaBanner(currentDetectedPartner);
      }

      if (plan.enable_auto_reply === true && !autoReplyEnabled) {
        setAutoReplyState(true);
      } else if (plan.enable_auto_reply === false && autoReplyEnabled) {
        setAutoReplyState(false);
      }

      if (plan.reply) {
        appendMessage('ai', plan.reply);
        chatHistory.push({ role: 'ai', content: plan.reply });
        await saveChatHistory();
      }

      const actions = Array.isArray(plan.actions) ? plan.actions : [];
      if (actions.length === 0) {
        needsMoreSteps = false;
        break;
      }

      lastActionResults = [];
      for (const act of actions) {
        if (stopRequested) break;
        runningStatusText.textContent = `กำลังสั่งงาน Chrome: ${act.type}...`;
        const outcome = await executeBrowserAction(act);
        lastActionResults.push(outcome);
        stepHistoryLog.push(`Step ${stepCount} [${act.type}${act.label ? ':' + act.label : ''}]: ${outcome}`);
      }

      needsMoreSteps = Boolean(plan.continue_after_actions);
      if (!needsMoreSteps || stopRequested) {
        break;
      }
    }

    // หากครบ 15 ขั้นตอนแล้วยังไม่จบ ให้แสดงปุ่มกดทำต่อทันที ห้ามเงียบหาย! (ส่งต่อทั้งเป้าหมายและสมุดจดสะสมครบ 100%)
    if (stepCount >= maxSteps && needsMoreSteps && !stopRequested) {
      const contBtn = document.createElement('button');
      contBtn.className = 'quick-btn';
      contBtn.style.marginTop = '6px';
      contBtn.style.borderColor = '#f97316';
      contBtn.textContent = `▶️ งานมีหลายขั้นตอน (จดข้อมูลแล้ว ${taskScratchpad.length} รายการ) — คลิกที่นี่เพื่อทำต่อจากจุดนี้ทันที`;
      contBtn.addEventListener('click', () => {
        contBtn.remove();
        runAgentTurn(lastMasterGoalText || 'ทำขั้นตอนต่อไปต่อจากเมื่อสักครู่ให้เสร็จ', true);
      });
      chatContainer.appendChild(contBtn);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  } catch (err) {
    appendMessage('ai', `⚠️ ระบบเชื่อมต่อขัดข้อง: ${err.message}`);
  } finally {
    isRunning = false;
    runningBar.classList.add('hidden');
    checkStatus();
  }
}

// Attachment & Screen OCR Handlers
function setAttachment(name, type, data, isImage) {
  currentAttachment = { name, type, data, isImage };
  attachPreviewName.textContent = name;
  attachPreviewIcon.textContent = isImage ? '🖼️' : '📄';
  attachPreviewBar.classList.remove('hidden');
}

function clearAttachment() {
  currentAttachment = null;
  fileInput.value = '';
  attachPreviewBar.classList.add('hidden');
}

if (btnCaptureScreen) {
  btnCaptureScreen.addEventListener('click', async () => {
    const shot = await captureTabScreenshotAttachment();
    if (!shot) {
      appendActionBadge('⚠️ ไม่สามารถแคปหน้าจอแท็บนี้ได้ (กรุณาเปิดหน้าเว็บปกติที่ไม่ใช่หน้าตั้งค่า Chrome)');
      return;
    }
    setAttachment(shot.name, shot.type, shot.data, true);
    const currentText = promptInput.value.trim();
    if (!currentText) {
      promptInput.value = 'อ่านข้อความและรายละเอียดสลิป/รูปภาพจากหน้าจอที่แคปนี้ให้ครบถ้วน';
    }
    promptInput.focus();
  });
}

btnAttach.addEventListener('click', () => {
  fileInput.click();
});

btnRemoveAttach.addEventListener('click', () => {
  clearAttachment();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  const reader = new FileReader();
  reader.onload = () => {
    setAttachment(file.name, file.type, reader.result, isImage);
  };
  reader.readAsDataURL(file);
});

// Support pasting image from clipboard (Ctrl+V / Cmd+V)
promptInput.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment(`รูปภาพจากคลิปบอร์ด_${new Date().toLocaleTimeString('th-TH')}.png`, file.type, reader.result, true);
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

// 8. Event Listeners
btnSend.addEventListener('click', () => {
  const text = promptInput.value.trim();
  if (!text && !currentAttachment) return;
  promptInput.value = '';
  runAgentTurn(text);
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = promptInput.value.trim();
    if (!text && !currentAttachment) return;
    promptInput.value = '';
    runAgentTurn(text);
  }
});

modelSelect.addEventListener('change', () => {
  chrome.storage.local.set({ ytSelectedModel: modelSelect.value });
});

sessionSelect.addEventListener('change', () => {
  if (sessionSelect.value) {
    switchConversation(sessionSelect.value);
  }
});

btnNewChat.addEventListener('click', () => {
  startNewConversation();
});

if (btnNewWindowAi) {
  btnNewWindowAi.addEventListener('click', () => {
    openIsolatedAiWindow();
  });
}

if (btnNewWindowTop) {
  btnNewWindowTop.addEventListener('click', () => {
    openIsolatedAiWindow();
  });
}

const btnReloadExt = document.getElementById('btnReloadExt');
if (btnReloadExt) {
  btnReloadExt.addEventListener('click', () => {
    chrome.runtime.reload();
  });
}

btnStop.addEventListener('click', () => {
  stopRequested = true;
  isRunning = false;
  runningBar.classList.add('hidden');
  appendActionBadge('⏹ หยุดการทำงานตามคำสั่งคุณช่างถึก');
});

btnClear.addEventListener('click', async () => {
  stopRequested = true;
  isRunning = false;
  runningBar.classList.add('hidden');
  const data = await chrome.storage.local.get(['ytSessions']);
  let allSessions = Array.isArray(data.ytSessions) ? data.ytSessions : [];
  allSessions = allSessions.filter(s => s.id !== currentSessionId);
  sessions = allSessions;
  await chrome.storage.local.set({ ytSessions: allSessions });
  await startNewConversation();
});

btnAudit.addEventListener('click', () => {
  runAgentTurn('ตรวจหน้าเว็บที่เปิดอยู่นี้ตามกฎเหล็กเครือโยธาไทย: เช็ครูปเสีย, เช็คลิงก์ Google Storage/Drive ที่หลุด และสรุปสถานะให้ผมทันที');
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = btn.getAttribute('data-prompt');
    if (p) runAgentTurn(p);
  });
});

// 9. Persistent Memory Modal
async function refreshMemories() {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/memories`);
    const data = await res.json();
    memoryList.innerHTML = '';
    const items = data.memories || [];
    if (items.length === 0) {
      memoryList.innerHTML = '<div class="memory-item">เชื่อมโยงกับ GEMINI.md ของเครือโยธาไทยแล้ว (ยังไม่มีความจำเสริม)</div>';
      return;
    }
    items.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'memory-item';
      const span = document.createElement('span');
      span.textContent = `• ${m}`;
      const del = document.createElement('button');
      del.className = 'memory-del';
      del.textContent = 'ลบ';
      del.addEventListener('click', async () => {
        await fetch(`${BRIDGE_URL}/api/memories`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: idx })
        });
        refreshMemories();
      });
      row.appendChild(span);
      row.appendChild(del);
      memoryList.appendChild(row);
    });
  } catch (e) {
    memoryList.innerHTML = '<div class="memory-item">ไม่สามารถโหลดความจำได้</div>';
  }
}

btnMemory.addEventListener('click', () => {
  memoryModal.classList.remove('hidden');
  refreshMemories();
});

btnCloseMemory.addEventListener('click', () => {
  memoryModal.classList.add('hidden');
});

btnAddMemory.addEventListener('click', async () => {
  const val = inputNewMemory.value.trim();
  if (!val) return;
  inputNewMemory.value = '';
  await fetch(`${BRIDGE_URL}/api/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory: val })
  });
  refreshMemories();
});

// 10. Thai Voice Dictation (🎤 อัดเสียงตรงจากไมโครโฟน MacBook Pro ผ่าน Local Bridge ไม่ติดบล็อก Chrome 100%)
let isMicRecording = false;

async function toggleMicRecording() {
  if (!isMicRecording) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/mic/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const data = await res.json();
      if (data.ok) {
        isMicRecording = true;
        btnMic.classList.add('recording');
        btnMic.title = 'กำลังฟังเสียง... (กดซ้ำเพื่อหยุดและแปลงเป็นข้อความ)';
        appendActionBadge('🔴 กำลังฟังเสียงจากไมโครโฟน MacBook Pro... พูดได้เลยครับ (พูดจบกดปุ่ม 🎙️ ซ้ำ)');
      } else {
        appendActionBadge(`⚠️ เริ่มไมโครโฟนไม่สำเร็จ: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      appendActionBadge('⚠️ ไม่สามารถติดต่อ Local Bridge สำหรับไมโครโฟนได้');
    }
  } else {
    isMicRecording = false;
    btnMic.classList.remove('recording');
    btnMic.title = 'สั่งงานด้วยเสียง (ภาษาไทย)';
    appendActionBadge('⏳ กำลังแปลงเสียงพูดเป็นข้อความภาษาไทย...');
    try {
      const res = await fetch(`${BRIDGE_URL}/api/mic/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const data = await res.json();
      if (data.ok && data.text) {
        promptInput.value = (promptInput.value + ' ' + data.text).trim();
        promptInput.scrollTop = promptInput.scrollHeight;
        promptInput.focus();
        appendActionBadge(`✅ ถอดเสียงสำเร็จ: "${data.text}"`);
      } else {
        appendActionBadge(`⚠️ ${data.error || 'ไม่ได้ยินเสียงพูด กรุณาลองใหม่ครับ'}`);
      }
    } catch (e) {
      appendActionBadge('⚠️ เกิดข้อผิดพลาดในการถอดเสียง');
    }
  }
}

btnMic.addEventListener('click', toggleMicRecording);

// 11. ระบบบอทตอบแชทอัตโนมัติ v2.0 (2 โหมดอัจฉริยะ: คนใหม่บอกตรงๆ ว่าเป็น AI / คนสนิทคุยเหมือนคุณช่างถึกคุยเอง)
const btnAutoReply = document.getElementById('btnAutoReply');
const autoReplyBanner = document.getElementById('autoReplyBanner');
const autoReplyBannerText = document.getElementById('autoReplyBannerText');
const currentPartnerBadge = document.getElementById('currentPartnerBadge');
const btnSwitchPersonaQuick = document.getElementById('btnSwitchPersonaQuick');
const btnStopAutoReplyQuick = document.getElementById('btnStopAutoReplyQuick');
const autoReplyModal = document.getElementById('autoReplyModal');
const btnCloseAutoReply = document.getElementById('btnCloseAutoReply');
const autoReplyTargetMode = document.getElementById('autoReplyTargetMode');
const autoReplyWhitelist = document.getElementById('autoReplyWhitelist');
const autoReplyAiStyle = document.getElementById('autoReplyAiStyle');
const autoReplyStyle = document.getElementById('autoReplyStyle');
const btnToggleAutoReply = document.getElementById('btnToggleAutoReply');

let autoReplyEnabled = false;
let isAutoReplyBusy = false;
let currentDetectedPartner = '';
const lastRepliedMap = {}; // { partnerName: lastIncomingMessageText }
const botSentMessages = new Set(); // เก็บข้อความที่บอทเพิ่งพิมพ์ส่งไป เพื่อไม่ให้อ่านข้อความตัวเองซ้ำ

function getTrustedListArray() {
  const raw = autoReplyWhitelist ? autoReplyWhitelist.value : '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function isPartnerTrustedLocal(partnerName) {
  if (!partnerName) return false;
  const list = getTrustedListArray();
  const pLow = partnerName.trim().toLowerCase();
  return list.some(t => {
    const tLow = t.toLowerCase();
    return tLow && (pLow.includes(tLow) || tLow.includes(pLow));
  });
}

function updatePartnerPersonaBanner(partnerName) {
  if (!currentPartnerBadge || !btnSwitchPersonaQuick) return;
  const pName = partnerName || 'คู่สนทนาปัจจุบัน';
  const trusted = isPartnerTrustedLocal(pName);
  if (trusted) {
    currentPartnerBadge.className = 'persona-pill persona-owner';
    currentPartnerBadge.textContent = `👤 ${pName}: โหมดคุยเหมือนผมเอง`;
    btnSwitchPersonaQuick.textContent = 'สลับเป็นบอกว่าเป็น AI ⇄';
  } else {
    currentPartnerBadge.className = 'persona-pill persona-ai';
    currentPartnerBadge.textContent = `🤖 ${pName}: โหมดบอกตรงๆ ว่าเป็น AI`;
    btnSwitchPersonaQuick.textContent = 'สลับเป็นคุยเหมือนผม ⇄';
  }
}

async function syncTrustedContactsToServer(contactsArr) {
  try {
    await fetch(`${BRIDGE_URL}/api/trusted_contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trustedContacts: contactsArr })
    });
  } catch (e) {}
}

async function loadAutoReplyConfig() {
  const data = await chrome.storage.local.get([
    'ytAutoReplyTargetMode',
    'ytAutoReplyWhitelist',
    'ytAutoReplyAiStyle',
    'ytAutoReplyStyle'
  ]);
  if (data.ytAutoReplyTargetMode && autoReplyTargetMode) {
    autoReplyTargetMode.value = data.ytAutoReplyTargetMode;
  } else if (autoReplyTargetMode) {
    autoReplyTargetMode.value = 'all';
  }
  if (data.ytAutoReplyWhitelist && autoReplyWhitelist) {
    autoReplyWhitelist.value = data.ytAutoReplyWhitelist;
  }
  if (data.ytAutoReplyAiStyle && autoReplyAiStyle) {
    autoReplyAiStyle.value = data.ytAutoReplyAiStyle;
  }
  if (data.ytAutoReplyStyle && autoReplyStyle) {
    autoReplyStyle.value = data.ytAutoReplyStyle;
  }

  // ซิงก์รายชื่อคนสนิทจาก Server หากมีอัปเดตล่าสุด
  try {
    const res = await fetch(`${BRIDGE_URL}/api/trusted_contacts`);
    const sData = await res.json();
    if (sData && sData.ok && Array.isArray(sData.trustedContacts) && sData.trustedContacts.length > 0) {
      if (!data.ytAutoReplyWhitelist && autoReplyWhitelist) {
        autoReplyWhitelist.value = sData.trustedContacts.join(', ');
      }
    }
  } catch (e) {}

  updatePartnerPersonaBanner(currentDetectedPartner);
}

async function saveAutoReplyConfig() {
  const whitelistStr = autoReplyWhitelist ? autoReplyWhitelist.value.trim() : '';
  await chrome.storage.local.set({
    ytAutoReplyTargetMode: autoReplyTargetMode ? autoReplyTargetMode.value : 'all',
    ytAutoReplyWhitelist: whitelistStr,
    ytAutoReplyAiStyle: autoReplyAiStyle ? autoReplyAiStyle.value.trim() : '',
    ytAutoReplyStyle: autoReplyStyle ? autoReplyStyle.value.trim() : ''
  });
  await syncTrustedContactsToServer(getTrustedListArray());
  updatePartnerPersonaBanner(currentDetectedPartner);
}

function setAutoReplyState(enabled) {
  autoReplyEnabled = enabled;
  if (enabled) {
    btnAutoReply?.classList.add('active-bot');
    autoReplyBanner?.classList.remove('hidden');
    if (btnToggleAutoReply) {
      btnToggleAutoReply.textContent = '⏹ ปิดระบบตอบแชทอัตโนมัติ v2.5';
      btnToggleAutoReply.classList.add('active');
    }
    appendActionBadge('🤖 เปิดบอทตอบแชทอัตโนมัติ v2.5 (ทะลุ Shadow DOM + แก้พิมพ์เบิ้ล 100% | คนใหม่ = บอกว่าเป็น AI | คนสนิท = คุยเหมือนผมเอง)');
    checkChatAndAutoReply();
  } else {
    btnAutoReply?.classList.remove('active-bot');
    autoReplyBanner?.classList.add('hidden');
    if (btnToggleAutoReply) {
      btnToggleAutoReply.textContent = '▶️ เปิดระบบตอบแชทอัตโนมัติ v2.5';
      btnToggleAutoReply.classList.remove('active');
    }
    appendActionBadge('⏹ ปิดระบบตอบแชทอัตโนมัติแล้ว');
  }
}

if (btnAutoReply) {
  btnAutoReply.addEventListener('click', () => {
    autoReplyModal?.classList.remove('hidden');
  });
}

if (btnCloseAutoReply) {
  btnCloseAutoReply.addEventListener('click', () => {
    saveAutoReplyConfig();
    autoReplyModal?.classList.add('hidden');
  });
}

if (autoReplyTargetMode) {
  autoReplyTargetMode.addEventListener('change', saveAutoReplyConfig);
}

if (autoReplyWhitelist) {
  autoReplyWhitelist.addEventListener('change', saveAutoReplyConfig);
}

if (autoReplyAiStyle) {
  autoReplyAiStyle.addEventListener('change', saveAutoReplyConfig);
}

if (autoReplyStyle) {
  autoReplyStyle.addEventListener('change', saveAutoReplyConfig);
}

if (btnToggleAutoReply) {
  btnToggleAutoReply.addEventListener('click', async () => {
    await saveAutoReplyConfig();
    setAutoReplyState(!autoReplyEnabled);
    autoReplyModal?.classList.add('hidden');
  });
}

if (btnStopAutoReplyQuick) {
  btnStopAutoReplyQuick.addEventListener('click', () => {
    setAutoReplyState(false);
  });
}

// ปุ่มสลับโหมดด่วนในคลิกเดียวบนแถบสีเขียว (สลับระหว่าง "บอกว่าเป็น AI" ⇄ "คุยเหมือนคุณช่างถึกคุยเอง")
if (btnSwitchPersonaQuick) {
  btnSwitchPersonaQuick.addEventListener('click', async () => {
    const partner = currentDetectedPartner;
    if (!partner || partner === 'คู่สนทนาปัจจุบัน' || partner === 'คู่สนทนา') {
      appendActionBadge('⚠️ กรุณาเปิดห้องแชทของคู่สนทนาก่อน เพื่อสลับโหมดการคุย');
      return;
    }
    let list = getTrustedListArray();
    const currentlyTrusted = isPartnerTrustedLocal(partner);
    if (currentlyTrusted) {
      list = list.filter(item => {
        const iLow = item.toLowerCase();
        const pLow = partner.toLowerCase();
        return !iLow.includes(pLow) && !pLow.includes(iLow);
      });
      appendActionBadge(`🤖 สลับโหมดของ "${partner}" → บอกเขาตรงๆ ว่าเป็น AI ผู้ช่วยของคุณช่างถึก`);
    } else {
      list.push(partner);
      appendActionBadge(`👤 สลับโหมดของ "${partner}" → คนสนิทที่ไว้ใจ (คุยเหมือนคุณช่างถึกคุยเอง)`);
    }
    if (autoReplyWhitelist) {
      autoReplyWhitelist.value = list.join(', ');
    }
    await saveAutoReplyConfig();
  });
}

// ฟังก์ชันตรวจจับข้อความใหม่ใน DOM ของ Messenger และ LINE (0 โทเค็น 100% ตอนเฝ้า)
async function inspectChatDomZeroToken(tabId, targetMode, whitelistArr) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (mode, whitelist) => {
        const url = location.href;
        const isMessenger = url.includes('facebook.com/messages') || url.includes('messenger.com');
        const isLine = url.includes('line.me') || url.includes('chat.line.biz');
        if (!isMessenger && !isLine) {
          return { supported: false };
        }

        const platform = isMessenger ? 'Facebook Messenger' : 'LINE';

        // 1. กรณีโหมด all หรือ whitelist: ตรวจดูแถบรายชื่อแชทด้านซ้ายว่ามีแชทใหม่ที่ยังไม่ได้อ่านหรือไม่ (รวมถึงคนใหม่ทักมาหรือส่งรูปมา)
        if (isMessenger && (mode === 'all' || mode === 'whitelist')) {
          const navLinks = Array.from(document.querySelectorAll(
            '[role="navigation"] a[role="link"], [aria-label*="แชท"] a[role="link"], [role="grid"] a[role="link"], a[role="link"][href*="/messages/"]'
          ));
          for (const link of navLinks) {
            const r = link.getBoundingClientRect();
            if (r.width < 40 || r.height < 28 || r.left > window.innerWidth * 0.48) continue;

            const aria = (link.getAttribute('aria-label') || '') + ' ' + (link.innerText || '');
            const rowContainer = link.closest('[role="row"], [role="listitem"], li') || link.parentElement;

            // ตรวจทั้งป้าย aria, จุดสีฟ้า (ทำเครื่องหมายว่าอ่านแล้ว), และตัวหนังสือหนา (font-weight >= 600)
            let hasBoldPreview = false;
            const spans = Array.from(link.querySelectorAll('span[dir="auto"], span'));
            if (spans.length >= 2) {
              for (const sp of spans.slice(1)) {
                const txt = (sp.innerText || '').trim();
                if (!txt || txt.length < 1) continue;
                const fw = parseInt(window.getComputedStyle(sp).fontWeight, 10) || 400;
                if (fw >= 600 && !txt.startsWith('คุณ:')) {
                  hasBoldPreview = true;
                  break;
                }
              }
            }

            const hasUnreadDot = Boolean(
              (rowContainer || link).querySelector(
                '[aria-label*="ยังไม่ได้อ่าน"], [aria-label*="unread"], [aria-label*="ทำเครื่องหมายว่าอ่านแล้ว"], [aria-label*="Mark as read"]'
              )
            );
            const isUnread =
              aria.includes('ยังไม่ได้อ่าน') ||
              aria.toLowerCase().includes('unread') ||
              hasUnreadDot ||
              hasBoldPreview;

            if (!isUnread) continue;

            if (mode === 'whitelist' && whitelist.length > 0) {
              const matched = whitelist.some(w => aria.toLowerCase().includes(w.toLowerCase()));
              if (!matched) continue;
            }
            // ถ้าลิงก์นี้ยังไม่ได้เปิดอยู่ ให้คลิกเปิดแชทนั้นทันทีเพื่อเข้าไปคุย
            const href = link.getAttribute('href') || '';
            const cleanHrefPath = href.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
            const cleanLocPath = location.pathname.replace(/\/$/, '');
            if (cleanHrefPath && cleanLocPath !== cleanHrefPath && !cleanLocPath.endsWith(cleanHrefPath)) {
              link.click();
              return { supported: true, platform, switchedThread: true, note: 'สลับไปยังแชทที่มีข้อความใหม่' };
            }
          }
        }

        // 2. อ่านชื่อคู่สนทนาในห้องแชทปัจจุบัน
        const mainArea = document.querySelector('div[role="main"]') || document.body;
        const mainRect = mainArea.getBoundingClientRect();

        let partnerName = '';
        const headerCandidates = mainArea.querySelectorAll('h1, h2, h3, [role="banner"] span[dir="auto"], a[role="link"] span[dir="auto"]');
        for (const h of headerCandidates) {
          const r = h.getBoundingClientRect();
          if (r.top >= 0 && r.top < 170 && r.width > 15) {
            const t = (h.innerText || '').trim();
            if (t && t.length >= 2 && t.length <= 60 && !['แชท', 'Chats', 'Marketplace', 'คำขอส่งข้อความ'].includes(t)) {
              partnerName = t.split('\n')[0].trim();
              break;
            }
          }
        }
        if (!partnerName) partnerName = document.title.replace(/^\(\d+\)\s*/, '').split('|')[0].trim() || 'คู่สนทนา';

        // 3. สแกนหาข้อความและรูปภาพ/สติกเกอร์ทั้งหมดในหน้าจอแชท พร้อมแยกฝั่งซ้าย (คู่สนทนาส่งมา) กับฝั่งขวา (เราส่งเอง)
        const rawNodes = Array.from(mainArea.querySelectorAll('div[dir="auto"], span[dir="auto"], .mdMN01Txt, [data-testid="message-text"]'));
        const messages = [];
        const seenTexts = new Set();

        // กรองข้อความระบบ เวลา (เช่น 23:19) และสถานะการส่งของ Messenger/LINE ออก ไม่ให้นับเป็นข้อความแชท
        const isSystemOrTimestamp = (txt) => {
          if (!txt) return true;
          if (/^\d{1,2}:\d{2}(\s*(AM|PM|น\.))?$/i.test(txt)) return true; // เช่น "23:19", "10:30 AM"
          if (/^(วันนี้|เมื่อวาน|จ\.|อ\.|พ\.|พฤ\.|ศ\.|ส\.|อา\.)\s*\d{1,2}:\d{2}/i.test(txt)) return true;
          if (/^\d+\s*(นาที|ชั่วโมง|วินาที|วัน)/.test(txt)) return true;
          const sysExact = [
            'Aa', 'ส่ง', 'Send', 'กำลังพิมพ์...', 'Active now', 'ใช้งานอยู่ตอนนี้', 'Enter',
            'ส่งแล้ว', 'เห็นแล้ว', 'กำลังส่ง', 'Sent', 'Seen', 'Delivered', 'เมื่อสักครู่', 'Just now'
          ];
          if (sysExact.includes(txt)) return true;
          if (
            txt.includes('การเข้ารหัสแบบต้นทางถึงปลายทาง') ||
            txt.includes('End-to-end encrypted') ||
            txt.startsWith('ใช้งานเมื่อ ') ||
            txt.startsWith('Active ') ||
            txt.startsWith('คุณส่ง')
          ) {
            return true;
          }
          return false;
        };

        for (const el of rawNodes) {
          if (el.querySelector('div[dir="auto"]')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.top < 115 || rect.bottom > window.innerHeight - 68) continue;
          if (rect.left < mainRect.left + 5) continue;
          if (el.closest('[contenteditable="true"], [role="textbox"], [role="navigation"], [role="banner"]')) continue;

          const text = (el.innerText || '').trim();
          if (!text || text.length < 1 || text.length > 600) continue;
          if (isSystemOrTimestamp(text)) continue;

          const relCenterX = (rect.left + rect.width / 2) - mainRect.left;
          const relLeft = rect.left - mainRect.left;
          const isIncoming = (relLeft < mainRect.width * 0.36) && (relCenterX < mainRect.width * 0.56);

          const key = `${Math.round(rect.top / 8)}_${text}`;
          if (seenTexts.has(key)) continue;
          seenTexts.add(key);

          messages.push({
            text,
            top: rect.top,
            isIncoming
          });
        }

        // 3.2 ตรวจจับรูปภาพหรือสติกเกอร์ในห้องแชท (กรณีคู่สนทนาส่งรูปมาโดยไม่มีข้อความ)
        const imgNodes = Array.from(mainArea.querySelectorAll('img'));
        for (const img of imgNodes) {
          const rect = img.getBoundingClientRect();
          // ข้ามรูปโปรไฟล์เล็กๆ หรือไอคอนปุ่มด้านบน/ด้านล่าง
          if (rect.width < 58 || rect.height < 58) continue;
          if (rect.top < 120 || rect.bottom > window.innerHeight - 75) continue;
          if (rect.left < mainRect.left + 10) continue;
          if (img.closest('[role="banner"], [role="navigation"], [contenteditable="true"]')) continue;

          const relCenterX = (rect.left + rect.width / 2) - mainRect.left;
          const relLeft = rect.left - mainRect.left;
          const isIncoming = (relLeft < mainRect.width * 0.38) && (relCenterX < mainRect.width * 0.56);

          const altText = (img.getAttribute('alt') || '').trim();
          const srcTail = (img.getAttribute('src') || '').slice(-18);
          const mediaLabel = altText ? `[ส่งรูปภาพ: ${altText}]` : `[ส่งรูปภาพ/สติกเกอร์ #${srcTail}]`;
          const key = `img_${Math.round(rect.top / 16)}_${srcTail}`;
          if (seenTexts.has(key)) continue;
          seenTexts.add(key);

          messages.push({
            text: mediaLabel,
            top: rect.top,
            isIncoming
          });
        }

        messages.sort((a, b) => a.top - b.top);
        const recent = messages.slice(-8);
        const lastMsg = recent.length > 0 ? recent[recent.length - 1] : null;

        return {
          supported: true,
          platform,
          partnerName,
          lastMsg,
          recentContext: recent.map(m => ({
            sender: m.isIncoming ? partnerName : 'คุณช่างถึก',
            text: m.text
          }))
        };
      },
      args: [targetMode, whitelistArr]
    });
    return result;
  } catch (e) {
    return { supported: false, error: e.message };
  }
}

// ฟังก์ชันพิมพ์และกดส่งข้อความลงในกล่องแชท Messenger / LINE โดยตรง (Single-Injection ป้องกันพิมพ์เบิ้ล 100%)
async function sendChatReplyDirectly(tabId, replyText) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (textToSend) => {
      if (window.__ytTypingLock) {
        return { ok: false, error: 'กำลังพิมพ์ข้อความอยู่ ข้ามการพิมพ์ซ้อน' };
      }
      window.__ytTypingLock = true;

      try {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const candidates = Array.from(document.querySelectorAll(
          'div[role="main"] [contenteditable="true"][role="textbox"], ' +
          'div[role="main"] [contenteditable="true"], ' +
          '[contenteditable="true"][aria-label*="ข้อความ"], ' +
          '[contenteditable="true"][aria-label*="Message"], ' +
          '[contenteditable="true"][role="textbox"], ' +
          'textarea'
        )).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 40 && r.height > 12;
        });

        candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
        const box = candidates[0];
        if (!box) return { ok: false, error: 'ไม่พบช่องพิมพ์ข้อความแชท' };

        box.scrollIntoView({ behavior: 'instant', block: 'center' });
        box.focus();
        await wait(60);

        if (box.isContentEditable || box.getAttribute('contenteditable') === 'true') {
          // 1. เคลียร์ข้อความเดิมที่อาจค้างอยู่ในช่องแชทก่อนเสมอ (Select All + Delete)
          try {
            const existing = (box.innerText || '').trim();
            if (existing.length > 0) {
              document.execCommand('selectAll', false, null);
              document.execCommand('delete', false, null);
              await wait(40);
            } else {
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(box);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch (e) {}

          // 2. ใช้คำสั่งเดียว: document.execCommand('insertText') เท่านั้น!
          // ห้ามยิง beforeinput หรือ InputEvent('input') ซ้ำเด็ดขาด เพราะ Chrome จะยิงให้อัตโนมัติอยู่แล้ว
          let inserted = false;
          try {
            inserted = document.execCommand('insertText', false, textToSend);
          } catch (e) {}

          await wait(50);
          if (!inserted && (box.innerText || '').trim().length === 0) {
            const dt = new DataTransfer();
            dt.setData('text/plain', textToSend);
            box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          }
        } else {
          box.value = textToSend;
          box.dispatchEvent(new Event('input', { bubbles: true }));
          box.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await wait(200);

        // 3. กดส่งด้วย keydown Enter เพียงครั้งเดียว
        const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        box.dispatchEvent(new KeyboardEvent('keydown', enterOpts));

        // 4. รอ 300ms หากข้อความยังค้างอยู่ในกล่อง (Enter ไม่ทำงาน) จึงค่อยคลิกปุ่มส่ง
        await wait(300);
        const sendBtn = document.querySelector(
          'div[role="main"] [aria-label="กด Enter เพื่อส่ง"], ' +
          'div[role="main"] [aria-label="Press Enter to send"], ' +
          'div[role="main"] [aria-label="ส่ง"], ' +
          'div[role="main"] [aria-label="Send"]'
        );
        if (sendBtn && (box.innerText || '').trim().length > 0) {
          sendBtn.click();
        }
        return { ok: true };
      } finally {
        window.__ytTypingLock = false;
      }
    },
    args: [replyText]
  });
  return result;
}

function isChatPlatformUrl(url) {
  if (!url) return false;
  return (
    url.includes('facebook.com/messages') ||
    url.includes('messenger.com') ||
    url.includes('line.me') ||
    url.includes('chat.line.biz')
  );
}

async function findTargetChatTab() {
  const activeTab = await getActiveTab();
  if (activeTab && activeTab.id && isChatPlatformUrl(activeTab.url)) {
    pinnedChatTabId = activeTab.id;
    return activeTab;
  }
  // หากคุณช่างถึกสลับไปแท็บอื่น (เช่น โอนเงินธนาคาร) ให้ยังเฝ้าแท็บแชทเดิมที่ล็อกไว้เบื้องหลังต่อได้ทันที!
  if (pinnedChatTabId) {
    try {
      const pinned = await chrome.tabs.get(pinnedChatTabId);
      if (pinned && pinned.id && isChatPlatformUrl(pinned.url)) {
        return pinned;
      }
    } catch (e) {
      pinnedChatTabId = null;
    }
  }
  // ค้นหาแท็บ Messenger/LINE ที่เปิดอยู่ในหน้าต่างนี้
  try {
    const winId = await ensureWindowId();
    const tabs = await chrome.tabs.query(winId !== null ? { windowId: winId } : { currentWindow: true });
    const foundChatTab = tabs.find(t => t.id && isChatPlatformUrl(t.url));
    if (foundChatTab) {
      pinnedChatTabId = foundChatTab.id;
      return foundChatTab;
    }
  } catch (e) {}
  return null;
}

const lastReplyTimestampMap = {}; // ป้องกันการตอบซ้ำติดกันเร็วเกินไปในห้องเดิม

async function checkChatAndAutoReply() {
  if (!autoReplyEnabled || isRunning || isAutoReplyBusy) return;

  try {
    isAutoReplyBusy = true;
    const tab = await findTargetChatTab();
    if (!tab || !tab.id || !tab.url) {
      if (autoReplyBannerText) {
        autoReplyBannerText.textContent = '🤖 เฝ้าแชท v2.5 (เปิดแท็บ Messenger/LINE ทิ้งไว้เพื่อให้บอททำงาน)';
      }
      return;
    }

    const mode = autoReplyTargetMode ? autoReplyTargetMode.value : 'all';
    const whitelistArr = getTrustedListArray();

    const domState = await inspectChatDomZeroToken(tab.id, mode, whitelistArr);
    if (!domState || !domState.supported) return;

    if (domState.switchedThread) {
      if (autoReplyBannerText) {
        autoReplyBannerText.textContent = '🤖 พบข้อความทักเข้ามาใหม่! กำลังเปิดห้องแชท...';
      }
      return;
    }

    const partner = domState.partnerName || 'คู่สนทนา';
    currentDetectedPartner = partner;
    updatePartnerPersonaBanner(partner);

    const isTrusted = isPartnerTrustedLocal(partner);

    if (autoReplyBannerText) {
      autoReplyBannerText.textContent = `🤖 เฝ้าแชท "${partner}" (0 โทเค็นตอนรอ)`;
    }

    // ถ้าเลือกโหมดเฉพาะคนสนิท (whitelist) และคนนี้ไม่อยู่ในรายชื่อคนสนิท ให้ข้าม
    if (mode === 'whitelist' && whitelistArr.length > 0 && !isTrusted) {
      return;
    }

    const lastMsg = domState.lastMsg;
    if (!lastMsg || !lastMsg.isIncoming) {
      // ข้อความล่าสุดเป็นของฝั่งเราเอง หรือยังไม่มีข้อความใหม่จากคู่สนทนา -> ไม่เสียโทเค็นแม้แต่ 1 โทเค็น!
      return;
    }

    const incomingText = lastMsg.text.trim();
    if (!incomingText) return;

    // ตรวจสอบว่าข้อความนี้ไม่ใช่ข้อความที่เราเพิ่งส่งออกไปเอง (ตรวจทั้งตรงตัวและบางส่วน)
    for (const sentMsg of botSentMessages) {
      if (sentMsg && (incomingText === sentMsg || incomingText.includes(sentMsg) || sentMsg.includes(incomingText))) {
        return;
      }
    }

    const sig = `${partner}||${incomingText}`;
    if (lastRepliedMap[partner] === sig) {
      // เคยตอบข้อความนี้ไปแล้ว -> ข้ามทันที (0 โทเค็น)
      return;
    }

    // Cooldown 5 วินาทีต่อห้องแชท เพื่อรอให้ DOM ของ Messenger อัปเดตลูกโป่งข้อความฝั่งขวาให้เสร็จสมบูรณ์หลังส่ง
    const nowTs = Date.now();
    if (lastReplyTimestampMap[partner] && (nowTs - lastReplyTimestampMap[partner] < 5000)) {
      return;
    }

    // พบข้อความใหม่จากคู่สนทนาจริงๆ! แยกโหมด 1 (บอกว่าเป็น AI) vs โหมด 2 (คุยเหมือนคุณช่างถึก)
    lastRepliedMap[partner] = sig;
    lastReplyTimestampMap[partner] = nowTs;
    const personaMode = isTrusted ? 'as_owner' : 'ai_assistant';

    if (autoReplyBannerText) {
      autoReplyBannerText.textContent = isTrusted
        ? `⚡ กำลังตอบ "${partner}" (โหมดคุยเหมือนคุณช่างถึก)...`
        : `⚡ กำลังตอบ "${partner}" (โหมดบอกตรงๆ ว่าเป็น AI)...`;
    }

    const res = await fetch(`${BRIDGE_URL}/api/autoreply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: domState.platform,
        partnerName: partner,
        sender: partner,
        incomingMessage: incomingText,
        incomingText,
        recentContext: domState.recentContext || [],
        personaMode,
        trustedContacts: whitelistArr,
        aiStylePrompt: autoReplyAiStyle ? autoReplyAiStyle.value.trim() : '',
        ownerStylePrompt: autoReplyStyle ? autoReplyStyle.value.trim() : '',
        model: modelSelect ? modelSelect.value : 'MODEL_PLACEHOLDER_M318'
      })
    });

    const data = await res.json();
    const replyRaw = data?.reply || data?.replyMessage || '';
    if (!data || !data.ok || !replyRaw) return;

    const replyText = replyRaw.trim();
    botSentMessages.add(replyText);

    const sendRes = await sendChatReplyDirectly(tab.id, replyText);
    if (sendRes && sendRes.ok) {
      lastReplyTimestampMap[partner] = Date.now();
      const modeTag = isTrusted ? '👤 [คุยเหมือนคุณช่างถึก]' : '🤖 [บอกตรงๆ ว่าเป็น AI]';
      appendActionBadge(`${modeTag} ตอบ ${partner} (จาก: "${incomingText.slice(0, 26)}") → "${replyText}"`);
    }
  } catch (err) {
    // ไม่รบกวนหน้าจอหลักหากเกิดข้อผิดพลาดชั่วคราวระหว่างสแกน
  } finally {
    isAutoReplyBusy = false;
  }
}

// Init
checkStatus();
updateActiveTabDisplay();
loadChatHistory();
loadAutoReplyConfig();
setInterval(checkStatus, 15000);
setInterval(checkChatAndAutoReply, 4500);

// Auto-deduplication & Session Migration helper
(async function handleExtensionDeduplication() {
  try {
    if (chrome.runtime?.id === 'bckipidmifaepcjjfcgonbjnfhngaffb' && chrome.management?.uninstallSelf) {
      await chrome.management.uninstallSelf({ showConfirmDialog: false });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('dump_storage') === '1') {
      const allData = await chrome.storage.local.get(null);
      const sessionsList = Array.isArray(allData.ytSessions) ? allData.ytSessions : [];
      document.title = JSON.stringify({
        extId: chrome.runtime.id,
        sessionCount: sessionsList.length,
        latestUpdatedAt: sessionsList[0]?.updatedAt || 0
      });
    }
    if (params.get('uninstall_self') === '1') {
      if (chrome.management && chrome.management.uninstallSelf) {
        await chrome.management.uninstallSelf({ showConfirmDialog: false });
      }
    }
  } catch (e) {
    console.warn('Dedup helper error:', e);
  }
})();

