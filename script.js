const fileInput = document.getElementById('file');
const promptEl = document.getElementById('prompt');
const goBtn = document.getElementById('go');
const status = document.getElementById('status');
const result = document.getElementById('result');

goBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file) return alert('请上传图片');
  const prompt = promptEl.value.trim();
  if (!prompt) return alert('请输入指令');

  goBtn.disabled = true;
  goBtn.textContent = 'AI解析中...';
  result.innerHTML = '';

  try {
    const spec = aiParse(prompt);
    status.textContent = `目标：${spec.kb}KB，自动转码+压缩`;

    goBtn.textContent = '处理中...';
    const blob = await processImage(file, spec.kb);

    showResult(blob, spec.kb);
    status.textContent = `✅ 完成：${(blob.size/1024).toFixed(1)}KB`;
  } catch (e) {
    alert('错误：' + e.message);
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = '🚀 AI一键处理';
  }
};

function aiParse(text) {
  text = text.toLowerCase();
  const match = text.match(/(\d+)\s*kb/i);
  const kb = match ? Math.max(10, parseInt(match[1])) : 20;
  return { kb };
}

// 核心：支持 HEIC + 强制压缩
async function processImage(file, targetKB) {
  const img = await loadImageAutoConvert(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const target = targetKB * 1024;

  // 从低质量往高找，保证一定能压到
  for (let q = 0.01; q <= 1; q += 0.01) {
    const blob = await toBlob(canvas, 'image/jpeg', q);
    if (blob.size <= target * 1.1) return blob;
  }

  return toBlob(canvas, 'image/jpeg', 0.01);
}

// HEIC 自动转码（浏览器原生不支持的自动转成 Image）
async function loadImageAutoConvert(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;

    if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
      const reader = new FileReader();
      reader.onload = e => {
        const url = e.target.result;
        img.src = url;
      };
      reader.readAsDataURL(file);
    } else {
      img.src = URL.createObjectURL(file);
    }
  });
}

function toBlob(canvas, mime, quality) {
  return new Promise(r => canvas.toBlob(r, mime, quality));
}

function showResult(blob, targetKB) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compressed-${targetKB}kb.jpg`;
  a.textContent = '📥 下载图片';
  a.style.display = 'inline-block';
  a.style.padding = '14px 24px';
  a.style.background = '#05c46b';
  a.style.color = '#fff';
  a.style.borderRadius = '12px';
  a.style.textDecoration = 'none';
  result.appendChild(a);
}
