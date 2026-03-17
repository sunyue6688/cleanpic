# 去水印 API 服务

支持多种处理方式的去水印 API，可以集成到任何工作流中。

## 🚀 快速开始

### 1. 安装依赖

```bash
cd ~/clawd/watermark-remover-api
npm install
```

### 2. 安装 Python 依赖（用于 OpenCV 方法）

```bash
pip3 install opencv-python numpy
```

### 3. 启动服务

```bash
npm start
```

服务会在 `http://localhost:3456` 启动。

### 4. 打开 Web 界面

浏览器打开 `index.html` 文件，或访问 `http://localhost:3456` 查看API文档。

## 📖 API 文档

### POST /remove

上传图片并去水印。

**请求方式**: `multipart/form-data`

**参数**:
- `image` (必需): 图片文件
- `mask` (可选): 水印位置 mask（黑白图，白色区域为水印）
- `method` (可选): 处理方法，默认 `opencv`
  - `opencv`: 免费、快速，适合简单水印
  - `lama`: 效果最好，需要安装模型
  - `api`: 调用第三方 API
- `api_provider` (可选): 第三方 API 提供商，默认 `removebg`
- `api_key` (可选): 第三方 API 密钥

**示例**:

```bash
# 使用 OpenCV 方法
curl -X POST http://localhost:3456/remove \
  -F "image=@test.jpg" \
  -F "method=opencv"

# 使用第三方 API
curl -X POST http://localhost:3456/remove \
  -F "image=@test.jpg" \
  -F "method=api" \
  -F "api_key=YOUR_API_KEY"
```

**响应**:

```json
{
  "success": true,
  "image": "data:image/jpg;base64,...",
  "method": "opencv"
}
```

### POST /remove/url

通过 URL 处理图片。

**请求方式**: `application/json`

**参数**:
- `url` (必需): 图片 URL
- `method` (可选): 处理方法，默认 `opencv`
- `api_key` (可选): API 密钥（如果使用 api 方法）

**示例**:

```bash
curl -X POST http://localhost:3456/remove/url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/image.jpg","method":"opencv"}'
```

### GET /health

健康检查。

```bash
curl http://localhost:3456/health
```

## 🔧 处理方法说明

### 1. OpenCV (默认)

**优点**:
- 完全免费
- 速度快
- 无需额外安装

**缺点**:
- 效果一般，适合简单水印
- 默认只处理右下角固定区域

**适用场景**:
- 位置固定的水印
- 纯色背景
- 批量处理

### 2. LaMa 模型

**优点**:
- 效果最好
- 支持复杂背景

**缺点**:
- 需要安装模型（约 200MB）
- 建议有 GPU
- 处理速度较慢

**安装**:

```bash
# 克隆 LaMa 项目
git clone https://github.com/advimman/lama.git

# 设置环境变量
export LAMA_DIR=/path/to/lama

# 下载模型
cd lama
# 参考 LaMa 项目文档下载预训练模型
```

### 3. 第三方 API

**优点**:
- 效果好
- 无需本地计算资源

**缺点**:
- 需要付费
- 依赖网络

**支持的 API**:
- `removebg`: Remove.bg (需要 API key)

## 🎯 使用建议

1. **简单水印** → 用 OpenCV 方法
2. **复杂水印** → 用 LaMa 模型（如果有效果要求）
3. **批量处理** → 用 OpenCV 方法 + 脚本
4. **高质量要求** → 用第三方 API

## 🧪 测试

```bash
# 运行测试脚本
chmod +x test.sh
./test.sh test.jpg
```

## 📁 项目结构

```
watermark-remover-api/
├── server.js        # API 服务
├── package.json     # Node 依赖
├── index.html       # Web 界面
├── test.sh          # 测试脚本
└── README.md        # 文档
```

## ⚙️ 环境变量

- `PORT`: 服务端口，默认 3456
- `TEMP_DIR`: 临时文件目录，默认 ./temp
- `LAMA_DIR`: LaMa 模型目录
- `REMOVEBG_API_KEY`: Remove.bg API 密钥

## 🔨 扩展开发

### 添加新的处理方法

在 `server.js` 中添加新的处理函数：

```javascript
async function removeWithYourMethod(inputPath, outputPath) {
  // 你的处理逻辑
  return { success: true };
}
```

然后在 `/remove` 路由中添加 case。

### 添加新的第三方 API

在 `removeWithAPI` 函数中添加新的 provider：

```javascript
if (provider === 'your-provider') {
  // 调用你的 API
}
```

## 📝 注意事项

1. OpenCV 方法默认只处理右下角水印，如需自定义，请上传 mask 文件
2. 使用第三方 API 时，请确保遵守其服务条款
3. 临时文件会自动清理，但请确保磁盘空间充足

## 🐛 常见问题

**Q: OpenCV 方法效果不好怎么办？**
A: 上传自定义 mask 文件，或改用 LaMa 模型/第三方 API。

**Q: LaMa 模型如何安装？**
A: 参考 https://github.com/advimman/lama 的安装文档。

**Q: 支持批量处理吗？**
A: 可以通过脚本循环调用 API 实现。

**Q: 支持视频去水印吗？**
A: 当前版本只支持图片。视频需要逐帧处理，性能要求较高。

## 📄 License

MIT
