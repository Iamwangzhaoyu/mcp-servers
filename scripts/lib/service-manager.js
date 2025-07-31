/**
 * 服务管理模块
 * 负责服务发现和管理
 */
import fs from 'fs'
import path from 'path'
import {
	isNodeMcpService,
	isPythonMcpService,
	isJavaMcpService,
	dockerfileContainsMcpFeatures,
	determineServiceRunCommand,
} from './discovery.js'
import {
	sanitizeServiceName,
	sanitizePath,
	isValidServiceName,
} from './utils.js'
import { BASE_PORT, findAvailablePort } from './ports.js'

/**
 * 发现服务
 * @param {string} srcDir 源码目录
 * @param {number} startPort 起始端口号，默认从BASE_PORT开始
 * @returns {Promise<Array<Object>>} 服务列表
 */
export async function discoverServices(srcDir, startPort = BASE_PORT) {
	console.log('🔍 开始发现MCP服务...')
	const services = []
	const portMap = {} // 用于跟踪端口分配

	// 读取src目录下的所有文件夹
	try {
		const dirs = fs.readdirSync(srcDir).filter((dir) => {
			try {
				const stats = fs.statSync(path.join(srcDir, dir))
				return stats.isDirectory()
			} catch (error) {
				console.warn(`警告: 无法访问目录 ${dir}: ${error.message}`)
				return false
			}
		})

		// 检查每个目录是否是MCP服务
		for (let i = 0; i < dirs.length; i++) {
			const dir = dirs[i]
			const servicePath = path.join(srcDir, dir)
			const dockerfilePath = path.join(servicePath, 'Dockerfile')

			try {
				if (fs.existsSync(dockerfilePath)) {
					// 识别服务类型
					let serviceType = null
					let isMcpService = false

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
					} else if (dockerfileContainsMcpFeatures(servicePath)) {
						serviceType = 'docker'
						isMcpService = true
					}

					if (isMcpService) {
						// 查找可用端口
						let port = await findAvailablePort(startPort + i)

						if (port === -1) {
							console.error(`❌ 服务 ${dir} 无法分配端口，跳过`)
							continue
						}

						// 记录端口分配
						portMap[dir] = port

						const command = determineServiceRunCommand(
							servicePath,
							dir,
							serviceType
						)

						// 使用sanitizeServiceName处理服务名称
						const sanitizedName = sanitizeServiceName(dir)

						// 添加到服务列表
						const serviceInfo = {
							name: sanitizedName,
							originalName: dir,
							type: serviceType,
							port,
							path: `/${sanitizedName}`, // 使用服务名而不是原始目录名
							command: command.replace('{{PORT}}', port),
						}

						console.log(
							`✅ 发现MCP服务: ${dir} (${serviceType}), 将使用端口: ${port}`
						)
						services.push(serviceInfo)
					}
				}
			} catch (error) {
				console.warn(`警告: 处理服务 ${dir} 时出错: ${error.message}`)
			}
		}
	} catch (error) {
		console.error(`❌ 错误: 读取服务目录失败: ${error.message}`)
		throw error
	}

	return services
}

/**
 * 生成服务的健康检查配置
 * @param {Object} service 服务对象
 * @returns {Object} 健康检查配置
 */
export function generateHealthCheck(service) {
	const healthCheck = {
		interval: '30s',
		timeout: '10s',
		retries: 3,
		start_period: '60s', // 增加启动期间以给服务足够时间初始化
	}

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

	return healthCheck
}

/**
 * 验证服务配置
 * @param {Array<Object>} services 服务列表
 * @returns {Array<Object>} 验证后的服务列表
 */
export function validateServices(services) {
	// 检查服务名称冲突
	const serviceNames = new Set()
	const duplicates = []

	services.forEach((service) => {
		if (serviceNames.has(service.name)) {
			duplicates.push(service.name)
		} else {
			serviceNames.add(service.name)
		}
	})

	if (duplicates.length > 0) {
		console.warn(`⚠️ 警告: 发现重复的服务名称: ${duplicates.join(', ')}`)
	}

	// 检查端口冲突
	const ports = new Set()
	const duplicatePorts = []

	services.forEach((service) => {
		if (ports.has(service.port)) {
			duplicatePorts.push(service.port)
		} else {
			ports.add(service.port)
		}
	})

	if (duplicatePorts.length > 0) {
		console.error(`❌ 错误: 发现重复的端口分配: ${duplicatePorts.join(', ')}`)
		throw new Error('端口冲突')
	}

	// 检查名称合法性
	const invalidNames = services.filter(
		(service) => !isValidServiceName(service.name)
	)

	if (invalidNames.length > 0) {
		console.warn(
			`⚠️ 警告: 服务名称包含非法字符: ${invalidNames
				.map((s) => s.name)
				.join(', ')}`
		)
		console.warn(
			'这可能导致Docker Compose配置问题。建议使用小写字母、数字和连字符。'
		)
	}

	return services
}

/**
 * 生成部署清单
 * @param {Array<Object>} services 服务列表
 * @param {string} manifestPath 清单文件路径
 */
export function generateDeploymentManifest(services, manifestPath) {
	console.log('📄 生成部署清单...')

	try {
		// 如果清单文件已存在，先删除它
		if (fs.existsSync(manifestPath)) {
			fs.unlinkSync(manifestPath)
		}

		// 创建清单对象
		const manifest = {
			generated_at: new Date().toISOString(),
			services: services.map((service) => ({
				name: service.originalName,
				type: service.type,
				port: service.port,
				endpoint: `/${service.name}`, // 使用与环境变量一致的路径格式
				container_name: `mcp-${service.name}`,
				health_check: {
					type: 'process',
					process_name: service.type === 'node' ? 'node' : service.type,
					interval: '30s',
				},
			})),
		}

		// 写入清单文件
		fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
		console.log('✅ 部署清单生成完成')
	} catch (error) {
		console.error('❌ 生成部署清单失败:', error.message)
		throw error
	}
}
