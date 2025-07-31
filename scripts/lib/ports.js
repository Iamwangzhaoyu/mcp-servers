/**
 * 端口管理模块
 * 负责端口检测和分配
 */
import { createServer } from 'net'

// 端口配置
const BASE_PORT = 3000
const PORT_RANGE = 1000 // 端口范围，从BASE_PORT到BASE_PORT+PORT_RANGE

/**
 * 检查端口是否可用
 * @param {number} port 要检查的端口
 * @returns {Promise<boolean>} 端口是否可用
 */
export async function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = createServer()
		let resolved = false

		// 添加超时处理
		const timeout = setTimeout(() => {
			if (!resolved) {
				resolved = true
				try {
					server.close()
				} catch (e) {
					// 忽略关闭错误
				}
				console.warn(`检查端口 ${port} 超时，假定端口不可用`)
				resolve(false)
			}
		}, 3000) // 3秒超时

		server.once('error', (err) => {
			if (!resolved) {
				resolved = true
				clearTimeout(timeout)
				if (err.code === 'EADDRINUSE') {
					resolve(false) // 端口被占用
				} else {
					// 其他错误也视为不可用
					console.warn(`检查端口 ${port} 时发生错误:`, err.message)
					resolve(false)
				}
			}
		})

		server.once('listening', () => {
			// 关闭测试服务器
			if (!resolved) {
				resolved = true
				clearTimeout(timeout)
				server.close(() => {
					resolve(true) // 端口可用
				})
			}
		})

		// 尝试监听端口
		try {
			server.listen(port, '127.0.0.1')
		} catch (err) {
			if (!resolved) {
				resolved = true
				clearTimeout(timeout)
				console.warn(`尝试监听端口 ${port} 失败:`, err.message)
				resolve(false)
			}
		}
	})
}

/**
 * 查找可用端口
 * @param {number} startPort 起始端口
 * @returns {Promise<number>} 返回可用端口
 */
export async function findAvailablePort(startPort) {
	let port = startPort
	const maxPort = BASE_PORT + PORT_RANGE

	while (port < maxPort) {
		if (await isPortAvailable(port)) {
			return port
		}
		port++
	}

	// 如果在范围内没有找到可用端口，返回-1表示失败
	console.error(`❌ 错误: 在端口范围 ${BASE_PORT}-${maxPort} 内未找到可用端口`)
	return -1
}

export { BASE_PORT, PORT_RANGE }
