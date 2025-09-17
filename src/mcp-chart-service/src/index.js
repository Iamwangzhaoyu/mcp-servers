import http from 'node:http'
import { EventEmitter } from 'node:events'
import url from 'node:url'

// 解析命令行参数
function parseArgs() {
	const args = {}
	process.argv.slice(2).forEach((arg, i, argv) => {
		if (arg.startsWith('--')) {
			const key = arg.slice(2)
			const value =
				argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true
			args[key] = value
		}
	})
	return args
}

// 获取命令行参数
const args = parseArgs()
// 优先使用命令行参数指定的端口，其次是环境变量，最后是默认值3000
const PORT = args.port || process.env.PORT || 3000

// McpChartClient类从原chart.js保留
class McpChartClient extends EventEmitter {
	constructor({
		server = 'http://106.63.6.55:11121', //服务器地址
		endpoint = '/mcp-server-chart', // 服务端点
		clientName = 'mcp-chart-client', // 客户端名称
		clientVersion = '1.0.0', // 客户端版本
	} = {}) {
		super()
		this.server = server
		this.endpoint = endpoint
		this.clientName = clientName
		this.clientVersion = clientVersion
		this.sessionId = null
		this.sseConnection = null
		this.tools = null
		this.chartDefaults = {}
	}

	get serviceUrl() {
		return `${this.server}${this.endpoint}`
	}

	async initialize() {
		// 1. 获取会话ID
		const { sessionId } = await this._initSession()
		this.sessionId = sessionId

		if (!this.sessionId) {
			throw new Error('初始化会话失败：未获取到会话ID')
		}

		// 2. 建立SSE连接
		await this._connectSSE()

		// 3. 获取可用工具列表
		this.tools = await this.getToolsList()

		this.emit('ready', {
			sessionId: this.sessionId,
			toolsCount: this.tools.length,
		})
		return { sessionId: this.sessionId, toolsCount: this.tools.length }
	}

	// 初始化
	async _initSession() {
		const initData = JSON.stringify({
			jsonrpc: '2.0',
			id: 'init-1',
			method: 'initialize',
			params: {
				name: this.clientName,
				version: this.clientVersion,
				protocolVersion: '2025-03-26',
				clientInfo: {
					name: this.clientName,
					version: this.clientVersion,
				},
				capabilities: {},
			},
		})

		console.log('初始化MCP会话...')

		return new Promise((resolve, reject) => {
			const req = http.request(
				this.serviceUrl,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json, text/event-stream',
					},
				},
				(res) => {
					// 获取会话ID
					const sessionId = res.headers['mcp-session-id']
					if (sessionId) {
						console.log('获取到会话ID:', sessionId)
					}

					let data = ''
					res.on('data', (chunk) => {
						data += chunk
					})

					res.on('end', () => {
						// 尝试解析JSON响应
						const match = data.match(/data: ({.*})/)
						if (match && match[1]) {
							const parsed = JSON.parse(match[1])
							if (parsed.result && parsed.result.serverInfo) {
								console.log(
									'连接到服务:',
									parsed.result.serverInfo.name,
									parsed.result.serverInfo.version
								)
							}
						}

						resolve({ sessionId, data })
					})
				}
			)

			req.write(initData)
			req.end()
		})
	}

	// 建立SSE连接
	async _connectSSE() {
		if (!this.sessionId) {
			throw new Error('无法建立SSE连接：未初始化会话')
		}

		console.log(`建立SSE连接...`)

		return new Promise((resolve, reject) => {
			const req = http.request(
				this.serviceUrl,
				{
					method: 'GET',
					headers: {
						Accept: 'text/event-stream',
						'mcp-session-id': this.sessionId,
					},
				},
				(res) => {
					if (res.statusCode !== 200) {
						reject(new Error(`SSE连接失败，状态码: ${res.statusCode}`))
						return
					}

					console.log('SSE连接已建立')

					// 保存连接实例
					this.sseConnection = res

					res.setEncoding('utf8')
					let message = ''

					res.on('data', (chunk) => {
						message += chunk

						// 当收到完整的SSE消息时处理它
						if (message.includes('\n\n')) {
							const match = message.match(/data: ({.*})/)
							if (match && match[1]) {
								const eventData = JSON.parse(match[1])
								this.emit('message', eventData)

								// 检查是否是工具调用响应
								if (eventData.result && eventData.result.content) {
									const content = eventData.result.content
									// 查找URL
									const urlContent = content.find(
										(item) =>
											item.type === 'text' && item.text.startsWith('http')
									)
									if (urlContent) {
										this.emit('chart', {
											id: eventData.id,
											url: urlContent.text,
										})
									}
								}
							}

							// 清空消息缓冲区，准备接收下一条消息
							message = ''
						}
					})

					res.on('end', () => {
						console.log('SSE连接已关闭')
						this.sseConnection = null
						this.emit('disconnect')
					})

					// 立即解析promise，但保持连接开放
					resolve()
				}
			)

			req.end()
		})
	}

	// 发送请求到MCP服务器
	async _sendRequest(data) {
		if (!this.sessionId) {
			throw new Error('会话未初始化')
		}

		return new Promise((resolve, reject) => {
			const req = http.request(
				this.serviceUrl,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json, text/event-stream',
						'mcp-session-id': this.sessionId,
					},
				},
				(res) => {
					let respData = ''
					res.on('data', (chunk) => (respData += chunk))
					res.on('end', () => {
						// 尝试提取JSON响应
						const match = respData.match(/data: ({.*})/)
						if (match && match[1]) {
							const jsonData = JSON.parse(match[1])

							// 检查错误
							if (jsonData.error) {
								return
							}

							resolve(jsonData)
						}
					})
				}
			)

			req.write(typeof data === 'string' ? data : JSON.stringify(data))
			req.end()
		})
	}

	// 获取可用工具列表
	async getToolsList() {
		const request = {
			jsonrpc: '2.0',
			id: 'tools-list-1',
			method: 'tools/list',
			params: {},
		}

		console.log('获取可用工具列表...')

		const response = await this._sendRequest(request)
		if (response.result && response.result.tools) {
			const tools = response.result.tools
			console.log(`获取到 ${tools.length} 个工具`)

			// 输出工具名称
			const toolNames = tools.map((tool) => tool.name)
			console.log('可用工具:', toolNames.join(', '))

			return tools
		}
	}

	// 生成图表
	async generateChart(chartType, params = {}) {
		// 确保chartType是有效的
		if (!chartType) {
			throw new Error('未指定图表类型')
		}

		// 验证工具是否存在
		if (this.tools && !this.tools.some((tool) => tool.name === chartType)) {
			throw new Error(`不支持的图表类型: ${chartType}`)
		}

		// 合并默认参数和自定义参数
		const mergedParams = {
			...(this.chartDefaults[chartType] || {}),
			...params,
		}

		const request = {
			jsonrpc: '2.0',
			id: `${chartType}-${Date.now()}`,
			method: 'tools/call',
			params: {
				name: chartType,
				arguments: mergedParams,
			},
		}

		const response = await this._sendRequest(request)
		if (
			response.result &&
			response.result.content &&
			response.result.content[0]
		) {
			const url = response.result.content[0].text
			return url
		}
		throw new Error('响应中没有图表URL')
	}

	// 关闭客户端连接
	close() {
		if (this.sseConnection) {
			this.sseConnection.destroy()
			this.sseConnection = null
		}

		this.sessionId = null
		console.log('客户端已关闭')
	}
}

// 封装chart生成逻辑
async function generateChart(type, data) {
	// 创建客户端实例
	const client = new McpChartClient()

	try {
		// 初始化客户端
		await client.initialize()

		// 生成图表
		const chartUrl = await client.generateChart(type, data)
		return chartUrl
	} finally {
		// 确保关闭客户端连接
		client.close()
	}
}

// 创建HTTP服务
const server = http.createServer(async (req, res) => {
	// 设置CORS头
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

	// 处理预检请求
	if (req.method === 'OPTIONS') {
		res.statusCode = 200
		res.end()
		return
	}

	const parsedUrl = url.parse(req.url, true)
	const pathname = parsedUrl.pathname

	// 健康检查路由
	if (
		req.method === 'GET' &&
		(pathname === '/health' || pathname === '/mcp-chart-service/health')
	) {
		res.statusCode = 200
		res.setHeader('Content-Type', 'application/json')
		res.end(
			JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })
		)
		return
	}

	// 处理图表生成API请求 - 支持两种路径模式
	// 1. /chart - 直接访问
	// 2. /mcp-chart-service/chart - 通过Nginx转发
	// 3. /service/chart - 原始路径（兼容）
	if (
		req.method === 'POST' &&
		(pathname === '/chart' ||
			pathname === '/mcp-chart-service/chart' ||
			pathname === '/service/chart')
	) {
		let body = ''

		req.on('data', (chunk) => {
			body += chunk.toString()
		})

		req.on('end', async () => {
			try {
				// 解析请求体
				const { type, data } = JSON.parse(body)

				if (!type || !data) {
					res.statusCode = 400
					res.setHeader('Content-Type', 'application/json')
					res.end(JSON.stringify({ error: '缺少必要参数: type 或 data' }))
					return
				}

				// 调用图表生成函数
				console.log(`接收到图表生成请求 - 类型: ${type}, 路径: ${pathname}`)
				const chartUrl = await generateChart(type, data)

				// 返回结果
				res.statusCode = 200
				res.setHeader('Content-Type', 'application/json')
				res.end(JSON.stringify({ success: true, url: chartUrl }))
			} catch (error) {
				console.error('处理请求时出错:', error)
				res.statusCode = 500
				res.setHeader('Content-Type', 'application/json')
				res.end(JSON.stringify({ error: error.message || '服务器内部错误' }))
			}
		})
	} else if (
		pathname !== '/health' &&
		pathname !== '/mcp-chart-service/health'
	) {
		// 不支持的路径或方法
		res.statusCode = 404
		res.setHeader('Content-Type', 'application/json')
		res.end(
			JSON.stringify({
				error: '未找到请求的资源',
				path: pathname,
				supportedPaths: [
					'/chart',
					'/mcp-chart-service/chart',
					'/service/chart',
				],
			})
		)
	}
})

// 启动服务器
server.listen(PORT, () => {
	console.log(`MCP图表服务API已启动，监听端口 ${PORT}`)
	console.log(`端口设置：使用端口 ${PORT} (来自命令行参数、环境变量或默认值)`)
	console.log(`健康检查路径: /health 或 /mcp-chart-service/health`)
	console.log(`API路径: /chart 或 /mcp-chart-service/chart 或 /service/chart`)
})

// 处理进程终止信号，优雅地关闭服务器
process.on('SIGTERM', () => {
	console.log('收到SIGTERM信号，关闭服务...')
	server.close(() => {
		console.log('HTTP服务器已关闭')
		process.exit(0)
	})
})

process.on('SIGINT', () => {
	console.log('收到SIGINT信号，关闭服务...')
	server.close(() => {
		console.log('HTTP服务器已关闭')
		process.exit(0)
	})
})
