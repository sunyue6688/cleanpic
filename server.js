/**
 * 去水印 API 服务
 * 支持多种处理方式：OpenCV、LaMa、第三方API
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3456;

// 临时文件目录
const TEMP_DIR = process.env.TEMP_DIR || './temp';

// 确保临时目录存在
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (e) {
    // 目录已存在
  }
}

// Multer 配置 - 文件上传
const storage = multer.diskStorage({
  destination: TEMP_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'input-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 中间件
app.use(express.json());

// 提供前端页面
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============ 核心处理函数 ============

/**
 * 使用 OpenCV 去水印（Python）
 * 适合：纯色背景、位置固定的水印
 */
async function removeWithOpenCV(inputPath, outputPath, maskPath = null) {
  const script = `
import cv2
import numpy as np
import sys
import os

input_path = sys.argv[1]
output_path = sys.argv[2]
mask_path = sys.argv[3] if len(sys.argv) > 3 else None

# 检查输入文件是否存在
if not os.path.exists(input_path):
    print(f"ERROR: Input file not found: {input_path}")
    sys.exit(1)

# 读取图片
img = cv2.imread(input_path)
if img is None:
    print(f"ERROR: Cannot read image from {input_path}")
    sys.exit(1)

print(f"Image loaded: {img.shape[1]}x{img.shape[0]}")

# 获取或生成mask
if mask_path and os.path.exists(mask_path):
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        print(f"WARNING: Cannot read mask, using auto-detection")
        mask = None
    else:
        # 关键：调整 mask 尺寸以匹配原图
        h, w = img.shape[:2]
        if mask.shape[0] != h or mask.shape[1] != w:
            print(f"Resizing mask from {mask.shape[1]}x{mask.shape[0]} to {w}x{h}")
            mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)

if mask is None:
    # 自动检测水印位置
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    
    # 假设水印在右下角 20% 区域
    mask[int(h*0.8):h, int(w*0.7):w] = 255
    
    # 检测白色/半透明水印
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, watermark_mask = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)
    mask = cv2.bitwise_or(mask, watermark_mask)

print(f"Mask ready: {mask.shape[1]}x{mask.shape[0]}, {np.count_nonzero(mask)} pixels to inpaint")

# 使用 TELEA 算法进行 inpainting
result = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)

# 保存结果
success = cv2.imwrite(output_path, result)
if success:
    print("SUCCESS")
else:
    print(f"ERROR: Failed to save result to {output_path}")
    sys.exit(1)
`;

  const scriptPath = path.join(TEMP_DIR, 'opencv_remove.py');
  await fs.writeFile(scriptPath, script);
  
  const cmd = `python3 "${scriptPath}" "${inputPath}" "${outputPath}"${maskPath ? ` "${maskPath}"` : ''}`;
  
  try {
    console.log(`Running OpenCV: ${cmd}`);
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
    console.log(`OpenCV output: ${result}`);
    if (result.includes('SUCCESS')) {
      return { success: true };
    }
    return { success: false, error: 'OpenCV processing failed: ' + result };
  } catch (e) {
    console.error(`OpenCV error: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * 使用第三方 API 去水印
 * 当前支持：remove.bg (需要 API key)
 */
async function removeWithAPI(inputPath, outputPath, provider = 'removebg', apiKey = null) {
  // 这里可以集成各种第三方API
  // 示例：remove.bg（主要用于去背景，但也可以处理水印）
  
  if (provider === 'removebg') {
    if (!apiKey) {
      return { success: false, error: 'API key required for remove.bg' };
    }
    
    const FormData = require('form-data');
    const axios = require('axios');
    
    try {
      const form = new FormData();
      form.append('image_file_b64', await fs.readFile(inputPath, { encoding: 'base64' }));
      form.append('size', 'auto');
      
      const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
        headers: {
          ...form.getHeaders(),
          'X-Api-Key': apiKey
        },
        responseType: 'arraybuffer'
      });
      
      await fs.writeFile(outputPath, response.data);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.response?.data?.errors?.[0]?.title || e.message };
    }
  }
  
  return { success: false, error: `Unknown provider: ${provider}` };
}

/**
 * 使用 LaMa 模型去水印（需要预安装）
 * 效果最好，但需要 GPU 和模型文件
 */
async function removeWithLama(inputPath, outputPath, maskPath = null) {
  // LaMa 模型需要单独安装
  // 参考：https://github.com/advimman/lama
  
  const lamaDir = process.env.LAMA_DIR || './lama';
  
  // 检查 LaMa 是否可用
  try {
    await fs.access(path.join(lamaDir, 'bin', 'predict.py'));
  } catch {
    return { success: false, error: 'LaMa model not found. Set LAMA_DIR environment variable.' };
  }
  
  // 如果没有提供 mask，生成一个
  if (!maskPath) {
    maskPath = inputPath.replace(/\.(jpg|png|jpeg)$/i, '_mask.png');
    // 这里可以调用自动检测水印位置的函数
    // 暂时使用简单的右下角 mask
    const generateMaskScript = `
import cv2
import numpy as np

img = cv2.imread("${inputPath}")
h, w = img.shape[:2]
mask = np.zeros((h, w), dtype=np.uint8)
mask[int(h*0.8):h, int(w*0.7):w] = 255
cv2.imwrite("${maskPath}", mask)
`;
    execSync(`python3 -c "${generateMaskScript}"`);
  }
  
  const cmd = `cd "${lamaDir}" && python bin/predict.py model.path=$(pwd)/big-lama indir="${path.dirname(inputPath)}" outdir="${path.dirname(outputPath)}"`;
  
  try {
    execSync(cmd, { timeout: 60000 });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============ API 路由 ============

/**
 * POST /remove
 * 上传图片并去水印
 * 
 * Body (multipart/form-data):
 * - image: 图片文件
 * - mask: (可选) 水印位置 mask
 * - method: 处理方法 (opencv | lama | api)
 * - api_provider: (可选) 第三方API提供商
 * - api_key: (可选) 第三方API密钥
 */
app.post('/remove', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'mask', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files?.image?.[0]) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const imageFile = req.files.image[0];
    const maskFile = req.files.mask?.[0];
    const method = req.body.method || 'opencv';
    const apiProvider = req.body.api_provider || 'removebg';
    const apiKey = req.body.api_key || process.env.REMOVEBG_API_KEY;
    
    const inputPath = imageFile.path;
    const maskPath = maskFile?.path || null;
    const outputPath = inputPath.replace('input-', 'output-');
    
    let result;
    
    switch (method) {
      case 'opencv':
        result = await removeWithOpenCV(inputPath, outputPath, maskPath);
        break;
      case 'lama':
        result = await removeWithLama(inputPath, outputPath, maskPath);
        break;
      case 'api':
        result = await removeWithAPI(inputPath, outputPath, apiProvider, apiKey);
        break;
      default:
        return res.status(400).json({ error: `Unknown method: ${method}` });
    }
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    // 返回处理后的图片
    const imageBuffer = await fs.readFile(outputPath);
    const base64 = imageBuffer.toString('base64');
    
    // 清理临时文件
    await Promise.all([
      fs.unlink(inputPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {}),
      maskPath ? fs.unlink(maskPath).catch(() => {}) : Promise.resolve()
    ]);
    
    res.json({
      success: true,
      image: `data:image/${path.extname(imageFile.originalname).slice(1)};base64,${base64}`,
      method
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /remove/url
 * 通过URL处理图片
 * 
 * Body (JSON):
 * - url: 图片URL
 * - method: 处理方法
 * - api_key: (可选) API密钥
 */
app.post('/remove/url', async (req, res) => {
  try {
    const { url, method = 'opencv', api_key } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'No URL provided' });
    }
    
    // 下载图片
    const axios = require('axios');
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    
    const ext = url.split('.').pop().split('?')[0] || 'jpg';
    const inputPath = path.join(TEMP_DIR, `url-input-${Date.now()}.${ext}`);
    const outputPath = inputPath.replace('input-', 'output-');
    
    await fs.writeFile(inputPath, response.data);
    
    let result;
    
    switch (method) {
      case 'opencv':
        result = await removeWithOpenCV(inputPath, outputPath);
        break;
      case 'api':
        result = await removeWithAPI(inputPath, outputPath, 'removebg', api_key);
        break;
      default:
        result = await removeWithOpenCV(inputPath, outputPath);
    }
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    const imageBuffer = await fs.readFile(outputPath);
    const base64 = imageBuffer.toString('base64');
    
    // 清理
    await Promise.all([
      fs.unlink(inputPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {})
    ]);
    
    res.json({
      success: true,
      image: `data:image/${ext};base64,${base64}`,
      method
    });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /health
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /
 * API 文档
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Watermark Remover API',
    version: '1.0.0',
    endpoints: {
      'POST /remove': {
        description: '上传图片去水印',
        'content-type': 'multipart/form-data',
        fields: {
          image: '图片文件（必需）',
          mask: '水印位置mask（可选）',
          method: '处理方法：opencv | lama | api（默认：opencv）',
          api_provider: '第三方API：removebg（默认）',
          api_key: '第三方API密钥'
        }
      },
      'POST /remove/url': {
        description: '通过URL处理图片',
        'content-type': 'application/json',
        fields: {
          url: '图片URL（必需）',
          method: '处理方法（默认：opencv）',
          api_key: 'API密钥（如果使用api方法）'
        }
      },
      'GET /health': '健康检查'
    },
    methods: {
      opencv: '免费、快速、适合简单水印（右下角固定位置）',
      lama: '效果最好、需要GPU和模型',
      api: '调用第三方API（需要API key）'
    }
  });
});

// 启动服务
ensureTempDir().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Watermark Remover API running at http://localhost:${PORT}`);
    console.log(`📖 API docs: http://localhost:${PORT}`);
    console.log(`\n支持的去除方式：`);
    console.log(`  - opencv: 免费、快速（默认）`);
    console.log(`  - lama: 效果最好（需要安装）`);
    console.log(`  - api: 第三方API`);
  });
});
