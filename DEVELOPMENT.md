# MCP 服务部署系统开发文档

本文档提供了关于如何修改和扩展MCP服务部署系统的技术细节。

## 系统架构

整个系统由以下几个主要部分组成：

1. **服务发现** - 自动扫描`src`目录，发现MCP服务
2. **配置生成** - 为每个服务生成Docker和Nginx配置
3. **部署流程** - 使用生成的配置部署服务
4. **服务识别** - 根据目录内容识别服务类型

## 核心文件说明

### 脚本入口

- `scripts/generate-config.js` - 配置生成的主入口
- `scripts/deploy.sh` - 部署服务的Bash脚本
- `scripts/start-all.js` - 在开发环境下启动所有服务的脚本

### 配置生成库

- `scripts/lib/service-manager.js` - 服务发现和管理
- `scripts/lib/docker-compose.js` - Docker Compose配置生成
- `scripts/lib/nginx.js` - Nginx配置生成
- `scripts/lib/discovery.js` - MCP服务识别逻辑
- `scripts/lib/ports.js` - 端口分配管理
- `scripts/lib/utils.js` - 通用工具函数

## 服务发现流程

1. 扫描`src`目录下的子目录
2. 检查每个子目录是否有Dockerfile
3. 根据目录内容判断是否为MCP服务及其类型（Node.js, Python, Java等）
4. 对每个MCP服务分配端口并生成服务信息

服务发现的关键代码在`scripts/lib/service-manager.js`的`discoverServices`函数中。

### 服务类型识别

系统通过以下方式识别不同类型的MCP服务：

1. **Node.js服务识别**
   - 检查package.json中是否包含@modelcontextprotocol/sdk依赖
   - 检查keywords是否包含mcp关键字
   - 检查包名是否包含mcp字符串

2. **Python服务识别**
   - 检查requirements.txt中是否包含modelcontextprotocol依赖
   - 检查Python文件中是否导入了mcp或modelcontextprotocol模块

3. **Java服务识别**
   - 检查pom.xml或build.gradle中是否包含modelcontextprotocol依赖
   - 检查Java文件中是否导入了mcp相关包

4. **通用Dockerfile识别**
   - 检查Dockerfile内容是否包含mcp、modelcontextprotocol等关键字

识别服务类型的代码位于`scripts/lib/discovery.js`文件中。

## 端口管理

系统使用`scripts/lib/ports.js`实现端口管理：

1. **端口分配策略**
   - 从BASE_PORT（默认为3000）开始分配端口
   - 自动跳过已使用的端口
   - 为每个服务分配唯一端口

2. **端口冲突解决**
   - 检查端口是否可用
   - 自动寻找下一个可用端口
   - 防止端口重复分配

3. **端口验证**
   - 在配置生成前验证所有端口分配是否有冲突

## 重要配置说明

### 端口配置

系统使用了以下端口配置：

- **11121** - Nginx对外暴露的HTTP端口，通过它访问所有MCP服务
- **3000, 3001, ...** - 内部容器端口，由`scripts/lib/ports.js`中的`BASE_PORT`开始自动分配

要修改对外暴露的HTTP端口，可以编辑`scripts/lib/docker-compose.js`中的Nginx配置部分：

```javascript
// Nginx配置
const nginxConfig = {
  image: 'nginx:stable-alpine',
  container_name: 'mcp-nginx',
  ports: ['11121:80'], // 这里可以修改对外端口，格式为"外部端口:内部端口"
  // ...
}
```

### 健康检查配置

系统为不同类型的服务配置了不同的健康检查策略：

```javascript
// 使用更宽松的健康检查
switch (service.type) {
  case 'node':
    healthCheck.test = ['CMD-SHELL', 'pgrep node || pgrep npm || exit 1']
    break
  case 'python':
    healthCheck.test = ['CMD-SHELL', 'pgrep python || exit 1']
    break
  case 'java':
    healthCheck.test = ['CMD-SHELL', 'pgrep java || exit 1']
    break
  case 'docker':
  default:
    healthCheck.test = ['CMD-SHELL', 'exit 0'] // 始终成功
}
```

## 如何修改Nginx配置生成

Nginx配置生成由`scripts/lib/nginx.js`文件中的`generateNginxConfig`函数处理。如果您需要修改Nginx配置，例如：

- 修改路径映射规则
- 添加自定义头部
- 更改路径重写逻辑

请修改此文件中的相关部分。特别是`location`块的生成逻辑:

```javascript
// 特殊处理context7服务
if (service.name === 'context7') {
  return `    # context7服务
  location /context7 {
      rewrite ^/context7(.*)$ /mcp$1 break;
      proxy_pass http://context7:${service.port};
      
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
  }`;
} else {
  return `    # ${service.name}服务
  location /${service.name} {
      proxy_pass http://${service.name}:${service.port};
      
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      
      # WebSocket支持
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
  }`;
}
```

## 如何修改Docker Compose配置生成

Docker Compose配置由`scripts/lib/docker-compose.js`文件中的`buildDockerComposeConfig`函数处理。修改此文件可以：

- 调整容器资源限制
- 更改环境变量
- 修改容器配置参数（如只读设置、用户设置）

例如，Nginx容器配置：

```javascript
// Nginx配置
const nginxConfig = {
  image: 'nginx:stable-alpine',
  container_name: 'mcp-nginx',
  ports: ['11121:80'], // 对外暴露的端口
  volumes: [
    './nginx/conf.d:/etc/nginx/conf.d:ro',
    './nginx/html:/usr/share/nginx/html:ro',
    'nginx-logs:/var/log/nginx',
  ],
  networks: ['mcp-network'],
  restart: 'unless-stopped',
  // ... 其他配置
  read_only: false, // 禁用只读模式
  tmpfs: [
    '/tmp:size=50M', 
    '/var/run:size=50M',
    '/var/cache/nginx:size=100M' // 添加nginx缓存目录作为tmpfs
  ],
  // 不设置用户，使用默认的root用户
}
```

## 服务命令行参数生成

系统会根据服务类型自动生成适当的命令行参数：

```javascript
switch (serviceType) {
  case 'node':
    // 优先使用package.json中定义的start脚本
    return `npm run start -- --transport http --port {{PORT}}`
  case 'python':
    // Python服务默认命令
    return `python -m mcp_server --transport http --port {{PORT}}`
  case 'java':
    // Java服务默认命令
    return `java -jar target/mcp-server.jar --transport http --port {{PORT}}`
  default:
    // 其他类型服务的默认命令
    return `node src/index.js --transport http --port {{PORT}}`
}
```

## 如何添加自定义服务类型

如果您需要添加对新类型MCP服务的支持，需要修改以下文件：

1. `scripts/lib/discovery.js` - 添加服务类型检测函数
2. `scripts/lib/service-manager.js` - 在`discoverServices`函数中添加新服务类型检测
3. `scripts/lib/docker-compose.js` - 为新服务类型添加特殊配置

### 添加新的服务识别方式

要添加新的服务识别逻辑，请按照以下步骤操作：

1. 在`scripts/lib/discovery.js`中添加新的识别函数：

```javascript
/**
 * 检查是否为新类型MCP服务
 * @param {string} servicePath 服务路径
 * @returns {boolean} 是否为新类型MCP服务
 */
export function isNewTypeMcpService(servicePath) {
  // 实现您的服务识别逻辑
  return false
}
```

2. 在`scripts/lib/service-manager.js`的`discoverServices`函数中添加新服务类型的检测：

```javascript
// 按顺序检查不同语言实现
if (isNodeMcpService(servicePath)) {
  serviceType = 'node'
  isMcpService = true
} else if (isPythonMcpService(servicePath)) {
  serviceType = 'python'
  isMcpService = true
} else if (isJavaMcpService(servicePath)) {
  serviceType = 'java'
  isMcpService = true
} else if (isNewTypeMcpService(servicePath)) { // 添加新的服务类型检测
  serviceType = 'new-type'
  isMcpService = true
} else if (dockerfileContainsMcpFeatures(servicePath)) {
  serviceType = 'docker'
  isMcpService = true
}
```

3. 在`scripts/lib/discovery.js`的`determineServiceRunCommand`函数中添加对新服务类型的命令生成：

```javascript
switch (serviceType) {
  // ... 现有服务类型
  case 'new-type':
    return `your-command --transport http --port {{PORT}}`
  // ...
}
```

## 常见修改场景

### 1. 修改端口分配策略

修改`scripts/lib/ports.js`中的`BASE_PORT`变量和`findAvailablePort`函数：

```javascript
// 修改起始端口
export const BASE_PORT = 4000 // 默认为3000

// 修改端口搜索范围
export async function findAvailablePort(startPort, maxAttempts = 1000) {
  // ...
}
```

### 2. 添加特殊处理的服务

在`scripts/lib/nginx.js`中扩展路径映射逻辑，例如context7的特殊处理：

```javascript
// 特殊处理context7
if (service.name === 'context7') {
  return `    # context7服务
  location /context7 {
      rewrite ^/context7(.*)$ /mcp$1 break;
      proxy_pass http://context7:${service.port};
      // ...
  }`;
}
// 添加新的特殊服务处理
else if (service.name === 'your-special-service') {
  return `    # your-special-service服务
  location /your-special-service {
      rewrite ^/your-special-service(.*)$ /custom-path$1 break;
      proxy_pass http://your-special-service:${service.port};
      // ...
  }`;
}
```

### 3. 修改服务命令行参数

在`scripts/lib/discovery.js`的`determineServiceRunCommand`函数中修改：

```javascript
case 'node':
  // 修改Node.js服务的命令参数，例如添加额外参数
  return `node src/index.js --transport http --port {{PORT}} --log-level debug`
```

### 4. 修改部署流程

可以修改`scripts/deploy.sh`脚本来调整部署流程，例如添加部署前的检查：

```bash
# 添加部署前检查
echo "执行部署前检查..."
if ! node scripts/pre-deploy-check.js; then
    echo -e "${RED}错误: 部署前检查失败!${NC}"
    exit 1
fi
```

## 测试修改

1. 修改相关脚本文件
2. 运行`node scripts/generate-config.js`生成新配置
3. 检查生成的`docker-compose.yml`和`nginx/conf.d/default.conf`
4. 运行`./scripts/deploy.sh`部署服务

## 健康检查与故障恢复

系统为每个服务配置了适当的健康检查，具体实现在`scripts/lib/service-manager.js`的`generateHealthCheck`函数中。可以根据需要调整健康检查策略：

```javascript
export function generateHealthCheck(service) {
  const healthCheck = {
    interval: '30s',     // 检查频率
    timeout: '10s',      // 超时时间
    retries: 3,          // 重试次数
    start_period: '60s', // 启动宽限期
  }
  
  // ... 按服务类型配置不同的检查命令
  
  return healthCheck
}
```

## 最佳实践

1. **不要直接修改生成的文件** - 修改生成脚本，而不是生成的配置文件
2. **保持向后兼容** - 修改时考虑现有服务的兼容性
3. **添加日志** - 在关键逻辑点添加适当的日志，方便调试
4. **错误处理** - 确保脚本具有健壮的错误处理
5. **服务命名规范** - 使用小写字母和连字符命名服务
6. **版本控制** - 确保所有源代码文件都添加到版本控制系统中
7. **优先检查识别** - 服务识别逻辑按优先级排序，使特定语言检查先于通用检查 