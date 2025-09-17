import http from 'node:http'
import { EventEmitter } from 'node:events'

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

async function chart(type, data) {
	// 创建客户端实例
	const client = new McpChartClient()

	// 初始化客户端
	await client.initialize()

	const chart = await client.generateChart(type, data)
	console.log('type', chart)

	// 关闭客户端
	client.close()
	return chart
}

chart('generate_pie_chart', {
	data: [
		{ category: '销售渠道A', value: 63 },
		{ category: '销售渠道B', value: 37 },
	],
	title: '销售渠道分布',
	innerRadius: 0.6,
})
