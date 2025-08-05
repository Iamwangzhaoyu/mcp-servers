// Docker Compose配置生成模块
import fs from 'fs'
import path from 'path'
import { generateHealthCheck } from './service-manager.js'

// 构建Docker Compose配置
function buildDockerComposeConfig(services) {
	// Nginx配置
	const nginxConfig = {
		image: 'swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/nginx:latest',
		container_name: 'mcp-nginx',
		ports: ['11121:80'], // 修改端口映射为11121:80
		volumes: [
			'./nginx/conf.d:/etc/nginx/conf.d:ro',
			'./nginx/html:/usr/share/nginx/html:ro',
			'nginx-logs:/var/log/nginx',
		],
		networks: ['mcp-network'],
		restart: 'unless-stopped',
		healthcheck: {
			test: ['CMD-SHELL', 'nginx -t || exit 1'],
			interval: '30s',
			timeout: '10s',
			retries: 3,
			start_period: '10s',
		},
		logging: {
			driver: 'json-file',
			options: {
				'max-size': '10m',
				'max-file': '3',
			},
		},
		deploy: {
			resources: {
				limits: {
					cpus: '0.50',
					memory: '256M',
				},
				reservations: {
					cpus: '0.25',
					memory: '128M',
				},
			},
		},
		security_opt: ['no-new-privileges:true'],
		read_only: false, // 禁用只读模式
		tmpfs: [
			'/tmp:size=50M',
			'/var/run:size=50M',
			'/var/cache/nginx:size=100M', // 添加nginx缓存目录作为tmpfs
		],
		// 不设置用户，使用默认的root用户
	}

	// 生成服务配置
	const servicesConfig = {}
	services.forEach((service) => {
		servicesConfig[service.name] = {
			build: {
				context: `./src/${service.originalName}`,
			},
			container_name: `mcp-${service.name}`,
			environment: {
				NODE_ENV: 'production',
				MCP_PATH_PREFIX: `/${service.name}`, // 使用单斜杠开头的路径
			},
			expose: [service.port.toString()],
			command: service.command,
			networks: ['mcp-network'],
			restart: 'unless-stopped',
			healthcheck: generateHealthCheck(service),
			logging: {
				driver: 'json-file',
				options: {
					'max-size': '10m',
					'max-file': '3',
				},
			},
			deploy: {
				resources: {
					limits: {
						cpus: '1.00',
						memory: '512M',
					},
					reservations: {
						cpus: '0.50',
						memory: '256M',
					},
				},
			},
			security_opt: ['no-new-privileges:true'],
			// read_only: service.type === 'node', // 禁用只读模式，避免启动问题
			tmpfs: ['/tmp:size=100M'],
			// user: service.type === 'node' ? 'node' : '', // 禁用用户限制，避免权限问题
		}

		// 为Python服务添加特殊配置
		if (service.type === 'python') {
			servicesConfig[service.name].user = 'nobody'
		}

		// 为Java服务添加特殊配置
		if (service.type === 'java') {
			// Java服务通常需要更多内存
			servicesConfig[service.name].deploy.resources.limits.memory = '1G'
			servicesConfig[service.name].deploy.resources.reservations.memory = '512M'
		}
	})

	// 返回完整的Docker Compose配置
	return {
		services: {
			nginx: nginxConfig,
			...servicesConfig,
		},
		networks: {
			'mcp-network': {
				driver: 'bridge',
				ipam: {
					config: [{ subnet: '172.28.0.0/16' }],
				},
			},
		},
		volumes: {
			'nginx-logs': {},
		},
	}
}

// 生成Docker Compose配置
export function generateDockerCompose(services, configPath) {
	try {
		// 构建Docker Compose配置
		const config = buildDockerComposeConfig(services)

		// 如果配置文件已存在，则先删除
		if (fs.existsSync(configPath)) {
			// 直接删除旧文件，不创建备份
			fs.unlinkSync(configPath)
		}

		// 写入配置文件
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

		console.log('✅ Docker Compose配置生成完成')
	} catch (error) {
		console.error('❌ 生成Docker Compose配置失败:', error.message)
		throw error
	}
}
