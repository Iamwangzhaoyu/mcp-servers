# MCP 服务自动部署系统

## 简介

该项目提供了一套完整的MCP（Model Context Protocol）服务自动部署系统，使您可以轻松地部署和管理多个MCP服务。系统自动生成Docker和Nginx配置，实现一键部署，支持多种类型的MCP服务。

## 主要功能

1. **服务自动发现** - 自动识别src目录下的所有MCP服务（Node.js、Python和Java等）
2. **配置自动生成** - 自动生成docker-compose和nginx配置
3. **一键部署** - 单个命令即可部署所有服务
4. **统一访问路径** - 通过Nginx反向代理，无需端口号统一访问
5. **智能端口分配** - 自动为每个服务分配可用端口
6. **多语言支持** - 支持Node.js、Python和Java等多种语言实现的MCP服务

## 已集成的MCP服务

当前系统已集成以下MCP服务：

1. **context7** - 提供最新的代码文档和示例，解决LLM训练数据过时的问题
   - 访问路径: `/context7`
   - 功能: 实时获取各种库的最新文档和代码示例

2. **mcp-server-chart** - 强大的图表生成服务，支持25+种图表类型
   - 访问路径: `/mcp-server-chart`
   - 功能: 生成各种类型的数据可视化图表，包括柱状图、折线图、饼图等

## 快速开始

### 一键部署所有服务

```bash
# 添加执行权限
chmod +x scripts/deploy.sh

# 部署所有服务
./scripts/deploy.sh
```

### 验证服务是否正常运行

```bash
# 检查服务状态
docker ps

# 访问服务主页
curl -I http://localhost:11121/static/
```

## 目录结构

```
mcp-servers/
├── docker-compose.yml  # 自动生成的Docker配置
├── nginx/
│   ├── conf.d/        # 自动生成的Nginx配置
│   └── html/          # 静态资源和错误页面
├── scripts/
│   ├── deploy.sh      # 一键部署脚本
│   ├── generate-config.js # 配置生成脚本
│   ├── lib/          # 生成配置的核心库
│   │   ├── discovery.js # 服务自动识别
│   │   ├── docker-compose.js # Docker配置生成
│   │   ├── nginx.js  # Nginx配置生成
│   │   ├── ports.js  # 端口分配管理
│   │   ├── service-manager.js # 服务发现和管理
│   │   └── utils.js  # 通用工具函数
│   └── start-all.js   # 启动所有服务的脚本
├── SECURITY.md        # 安全配置指南
├── deployment-manifest.json # 部署清单
└── src/
    ├── context7/      # MCP服务 - 文档查询服务
    ├── mcp-server-chart/ # MCP服务 - 图表生成服务
    └── [your-new-service]/ # 您的新服务
```

## 服务访问

部署完成后，可以通过以下URL访问服务：

- `http://localhost:11121/[service-name]` - 本地访问
  - 例如：`http://localhost:11121/context7`
  - 例如：`http://localhost:11121/mcp-server-chart`

特别说明：
- `context7` 服务在内部使用 `/mcp` 路径，但通过Nginx代理后，对外提供 `/context7` 路径访问
- 所有服务都通过端口11121访问
- 每个服务内部使用独立端口（从3000开始自动分配）

## 系统要求

- Docker 和 Docker Compose v2
- Node.js 18+
- Bash Shell (用于脚本执行)

## 添加新服务的流程

1. 在`src/`目录下创建您的MCP服务，确保包含：
   - Dockerfile
   - package.json (适用于Node.js服务)
   - requirements.txt (适用于Python服务)
   - pom.xml 或 build.gradle (适用于Java服务)

2. 部署所有服务：
   ```bash
   ./scripts/deploy.sh
   ```

3. 访问服务：
   ```
   http://localhost:11121/[your-service-name]
   ```

## 支持的MCP服务类型

系统可自动识别以下类型的MCP服务：

1. **Node.js MCP服务**
   - 通过package.json中的依赖识别
   - 支持检测 `@modelcontextprotocol/sdk` 依赖
   - 自动从 package.json 中解析入口点

2. **Python MCP服务**
   - 通过requirements.txt中的依赖识别
   - 支持检测 `modelcontextprotocol` 或 `mcp_` 相关依赖

3. **Java MCP服务**
   - 通过pom.xml或build.gradle中的依赖识别
   - 支持检测 `modelcontextprotocol` 或 `mcp.` 相关依赖

4. **其他类型**
   - 通过Dockerfile中的特征识别

## 配置说明

### Nginx配置

- 使用Nginx反向代理所有服务
- 通过URL路径映射到相应服务，统一使用11121端口
- 特殊处理了context7服务，将`/context7`路径请求重写到其内部的`/mcp`路径
- 启用了debug级别日志，方便调试
- 支持WebSocket连接

### Docker配置

- 解决了Nginx容器权限问题
  - 禁用了只读文件系统
  - 缓存目录使用tmpfs挂载
  - 移除了用户限制，使用默认的root用户
- 服务环境变量统一使用单斜杠格式的路径前缀
- 容器间通过`mcp-network`网络互联
- 为每个服务配置了健康检查

## 高级配置

可以通过修改以下文件来自定义配置生成逻辑：

- `scripts/lib/docker-compose.js` - 自定义Docker配置生成
- `scripts/lib/nginx.js` - 自定义Nginx配置生成
- `scripts/lib/service-manager.js` - 自定义服务发现和路径处理
- `scripts/lib/discovery.js` - 自定义服务类型识别
- `scripts/lib/ports.js` - 自定义端口分配策略

## 开发模式运行

如果您想在不使用Docker的情况下本地开发：

```bash
# 启动所有服务
node scripts/start-all.js

# 或者单独启动某个服务
cd src/[service-name]
npm start
```

## 故障排查

常见问题及解决方法：

### 1. Nginx容器无法启动或重启循环

检查Nginx日志：
```bash
docker logs mcp-nginx
```

如果看到权限相关错误，可能需要调整`scripts/lib/docker-compose.js`中Nginx容器的配置。

### 2. 服务可以直接访问但无法通过Nginx代理访问

检查Nginx配置和重写规则：
```bash
# 查看当前配置
cat nginx/conf.d/default.conf

# 检查Nginx内部日志
docker exec mcp-nginx cat /var/log/nginx/error.log
```

### 3. 查看服务日志

```bash
# 查看所有日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f [服务名]
```

### 4. 构建失败问题

如果构建失败，可能是由于以下原因：
- Node.js版本不兼容（检查Dockerfile中的Node版本是否匹配服务需求）
- 缺少必要的文件（确保所有源码文件都已提交到代码仓库）
- 网络问题（检查容器网络访问是否正常）

## 配置文件说明

注意：`docker-compose.yml` 和 `nginx/conf.d/default.conf` 是自动生成的文件，不要直接修改它们，应该通过修改生成脚本来更改配置。 