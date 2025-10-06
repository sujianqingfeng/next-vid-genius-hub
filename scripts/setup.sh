#!/bin/bash

# 设置脚本 - 处理原生模块安装
set -e

echo "🚀 开始设置项目..."

# 检查是否安装了必要的系统依赖
echo "📋 检查系统依赖..."

# macOS 依赖检查
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 检测到 macOS 系统"
    
    # 检查 Homebrew
    if ! command -v brew &> /dev/null; then
        echo "❌ 未找到 Homebrew，请先安装: https://brew.sh/"
        exit 1
    fi
    
    # 安装 ffmpeg
    echo "🎬 安装 ffmpeg..."
    brew install ffmpeg
    
    # 安装 yt-dlp
    echo "📺 安装 yt-dlp..."
    brew install yt-dlp
fi

# 安装 Node.js 依赖
echo "📦 安装 Node.js 依赖..."
pnpm install

# 重建 yt-dlp-wrap 原生模块
echo "🔨 重建 yt-dlp-wrap 原生模块..."
pnpm rebuild yt-dlp-wrap

echo "✅ 设置完成！"
echo "🎯 现在可以运行: pnpm dev" 
