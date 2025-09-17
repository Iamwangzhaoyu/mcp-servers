# MCP图表生成REST API服务

该服务提供了一个RESTful API接口，用于生成各种类型的图表。它作为MCP服务自动部署系统的一部分，通过调用mcp-server-chart服务来生成图表。

## 功能特性

- RESTful API接口
- 支持多种图表类型生成
- 通过MCP协议与chart服务通信
- 健康检查接口
- Docker支持

## API接口

### 生成图表

- **URL**: `/mcp-chart-service/chart`
- **Method**: `POST`
- **请求体**:
  ```json
  {
    "type": "generate_pie_chart",
    "data": {
      "data": [
        { "category": "销售渠道A", "value": 63 },
        { "category": "销售渠道B", "value": 37 }
      ],
      "title": "销售渠道分布"
    }
  }
  ```
- **响应**:
  ```json
  {
    "success": true,
    "url": "http://example.com/path/to/chart.png"
  }
  ```

### 健康检查

- **URL**: `/mcp-chart-service/health`
- **Method**: `GET`
- **响应**:
  ```json
  {
    "status": "ok",
    "timestamp": "2023-09-17T12:34:56.789Z"
  }
  ```

## 部署

该服务作为MCP服务自动部署系统的一部分，可以通过以下命令部署:

```bash
./scripts/deploy.sh
```

## 本地开发

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 开发模式(热更新)
npm run dev
```

## 环境变量

- `PORT`: 服务监听端口，默认为3000
- `NODE_ENV`: 运行环境，建议设为"production"用于生产环境 