#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "======================================"
echo "MCP 服务一键部署脚本"
echo "======================================"

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装!${NC}"
    echo "请先安装Docker和Docker Compose。"
    exit 1
fi

# 检查Docker是否运行
if ! docker info &> /dev/null; then
    echo -e "${RED}错误: Docker 守护进程未运行!${NC}"
    echo "请先启动Docker服务。"
    exit 1
fi

# 显示当前src目录中的服务
echo "-----------------------------------"
echo "当前src目录下的服务:"
for d in src/*/ ; do
    if [ -d "$d" ] && [ -f "${d}Dockerfile" ]; then
        echo "• $(basename "$d")"
    fi
done

# 确保目录存在
mkdir -p nginx/conf.d
mkdir -p nginx/html/static
mkdir -p nginx/html/error

# 生成配置文件
echo "步骤 1: 生成配置文件"
echo "-----------------------------------"
echo "正在生成配置..."
node scripts/generate-config.js

# 部署服务
echo "步骤 2: 部署服务"
echo "-----------------------------------"
echo "停止现有服务..."
docker-compose down || true

echo "清理构建缓存..."
docker builder prune -f

echo "构建和启动服务..."
if ! docker-compose up -d --build --force-recreate; then
    echo -e "${RED}错误: 部署失败!${NC}"
    exit 1
fi

# 验证服务状态
echo "步骤 3: 验证服务"
echo "-----------------------------------"
echo "等待服务启动..."
sleep 5

# 显示容器状态
echo "容器状态:"
docker-compose ps

echo ""
echo "服务端口映射:"
docker-compose ps | grep -v "PORTS" | awk '{print $1, $6}' | sort

echo ""
echo "健康状态检查:"
container_health=$(docker-compose ps | grep -v "healthy" | wc -l)
if [ $container_health -gt 1 ]; then
    echo -e "${YELLOW}⚠️ 有些容器可能未通过健康检查!${NC}"
else
    echo -e "${GREEN}✅ 服务已成功启动并通过健康检查!${NC}"
fi

echo ""
echo "======================================"
echo "MCP 服务访问地址:"
grep -r '"name"' deployment-manifest.json | awk -F'"' '{print "• " $4 ": http://106.63.6.55:11121/" $4}'
echo ""
echo "部署信息:"
echo "详细信息可在 deployment-manifest.json 文件中查看"
echo "======================================"
echo "提示:"
echo "1. 查看服务日志:   docker-compose logs -f [服务名]"
echo "2. 添加新服务:     将服务添加到src目录，然后重新运行此脚本"
echo "3. 更新配置:       ./scripts/deploy.sh"
echo "" 