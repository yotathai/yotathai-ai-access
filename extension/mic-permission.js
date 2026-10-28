async function requestMic() {
  const statusEl = document.getElementById('statusText');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    statusEl.textContent = '✅ เปิดสิทธิ์ไมโครโฟนสำเร็จแล้ว! กำลังกลับไปที่แถบ ช่างถึก AI...';
    chrome.runtime.sendMessage({ type: 'YT_MIC_PERMISSION_GRANTED' }).catch(() => {});
    setTimeout(() => window.close(), 400);
  } catch (err) {
    statusEl.textContent = '⚠️ กรุณากดปุ่มไอคอนรูปแม่กุญแจ/ตั้งค่าบนแถบด้านบน แล้วเลือก "อนุญาต" (Allow) ไมโครโฟนครับ (' + err.name + ')';
  }
}

document.getElementById('btnRetry').addEventListener('click', requestMic);
requestMic();
