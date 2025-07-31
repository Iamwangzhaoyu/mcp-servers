#!/usr/bin/env node

/**
 * MCP服务配置生成工具
 * 自动发现和配置MCP服务，生成docker-compose.yml和nginx配置
 */

// 文件系统和路径模块
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// 导入所需函数
import {
	discoverServices,
	validateServices,
	generateDockerCompose,
	generateNginxConfig,
	generateSecurityGuide,
	generateDeploymentManifest,
} from './lib/index.js'

// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 路径定义
const ROOT_DIR = path.join(__dirname, '..')
const SRC_DIR = path.join(ROOT_DIR, 'src')
const DOCKER_COMPOSE_PATH = path.join(ROOT_DIR, 'docker-compose.yml')
const NGINX_CONFIG_PATH = path.join(ROOT_DIR, 'nginx/conf.d/default.conf')
const SECURITY_GUIDE_PATH = path.join(ROOT_DIR, 'SECURITY.md')
const DEPLOYMENT_MANIFEST_PATH = path.join(ROOT_DIR, 'deployment-manifest.json')

// 确保目录存在
function ensureDirectoryExists(dirPath) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true })
	}
}

// 生成配置
async function generateConfig() {
	console.log('🚀 开始生成MCP服务配置...')

	try {
		// 确保nginx配置目录存在
		ensureDirectoryExists(path.dirname(NGINX_CONFIG_PATH))

		// 服务发现
		const services = await discoverServices(SRC_DIR, 3000)

		if (services.length === 0) {
			console.warn('⚠️ 未发现任何MCP服务')
			return
		}

		// 验证服务
		validateServices(services)

		// 生成Docker Compose配置
		console.log('📝 生成Docker Compose配置...')
		await generateDockerCompose(services, DOCKER_COMPOSE_PATH)

		// 生成nginx配置
		console.log('📝 生成nginx配置...')
		await generateNginxConfig(services, NGINX_CONFIG_PATH)

		// 生成安全指南
		console.log('📝 生成安全指南...')
		await generateSecurityGuide(SECURITY_GUIDE_PATH)

		// 生成部署清单
		console.log('📄 生成部署清单...')
		await generateDeploymentManifest(services, DEPLOYMENT_MANIFEST_PATH)

		console.log('✅ 所有配置生成完成!')
		console.log('🔔 提示: 现在可以使用 "./scripts/deploy.sh" 来部署服务')
	} catch (error) {
		console.error('❌ 配置生成失败:', error.message)
		process.exit(1)
	}
}

// 执行配置生成
generateConfig()
