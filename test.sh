#!/bin/bash

# 去水印 API 测试脚本

API_URL="http://localhost:3456"

echo "🧪 Watermark Remover API 测试"
echo "=============================="
echo ""

# 检查服务是否运行
echo "1️⃣  检查服务状态..."
curl -s "$API_URL/health" | jq . 2>/dev/null || echo "服务未启动或 jq 未安装"
echo ""

# 测试文档接口
echo "2️⃣  获取 API 文档..."
curl -s "$API_URL" | jq . 2>/dev/null || curl -s "$API_URL"
echo ""

# 如果提供了图片文件，测试上传
if [ -n "$1" ]; then
  echo "3️⃣  测试图片上传去水印..."
  echo "   图片: $1"
  
  # 使用 opencv 方法
  echo "   方法: opencv"
  curl -X POST "$API_URL/remove" \
    -F "image=@$1" \
    -F "method=opencv" \
    -o result-opencv.json
  
  echo "   结果已保存到: result-opencv.json"
  echo ""
fi

# 如果提供了图片 URL，测试 URL 处理
if [ -n "$2" ]; then
  echo "4️⃣  测试 URL 图片去水印..."
  echo "   URL: $2"
  
  curl -X POST "$API_URL/remove/url" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"$2\",\"method\":\"opencv\"}" \
    -o result-url.json
  
  echo "   结果已保存到: result-url.json"
  echo ""
fi

echo "✅ 测试完成"
