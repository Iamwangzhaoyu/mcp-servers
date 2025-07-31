#!/usr/bin/env node

import { glob } from 'glob'
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// 查找所有src目录下的服务
async function findAllServices() {
	const services = []
	const serviceDirs = await glob('src/*/', { cwd: rootDir })

	for (const serviceDir of serviceDirs) {
		const packageJsonPath = join(rootDir, serviceDir, 'package.json')

		if (existsSync(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

				if (packageJson.scripts && packageJson.scripts.start) {
					services.push({
						name: packageJson.name || serviceDir.replace(/^src\/|\/$/g, ''),
						dir: join(rootDir, serviceDir),
						command: 'pnpm',
						args: ['start'],
					})
				}
			} catch (error) {
				console.error(`Error processing ${packageJsonPath}:`, error)
			}
		}
	}

	return services
}

// 使用concurrently风格的颜色
const colors = [
	'blue',
	'green',
	'magenta',
	'cyan',
	'red',
	'yellow',
	'gray',
	'bgBlue',
	'bgGreen',
	'bgMagenta',
]

// 启动所有服务
async function startAllServices() {
	const services = await findAllServices()

	if (services.length === 0) {
		console.log('没有找到可启动的服务')
		return
	}

	console.log(`找到 ${services.length} 个服务:`)
	services.forEach((service, index) => {
		console.log(`${index + 1}. ${service.name} (目录: ${service.dir})`)
	})

	// 启动所有服务
	const processes = services.map((service, index) => {
		const color = colors[index % colors.length]
		const prefix = `[${service.name}]`.padEnd(15)

		const proc = spawn(service.command, service.args, {
			cwd: service.dir,
			shell: true,
			stdio: 'pipe',
		})

		// 为每个服务指定颜色和前缀
		proc.stdout.on('data', (data) => {
			const lines = data.toString().trim().split('\n')
			lines.forEach((line) => {
				console.log(`\x1b[${getColorCode(color)}m${prefix}\x1b[0m ${line}`)
			})
		})

		proc.stderr.on('data', (data) => {
			const lines = data.toString().trim().split('\n')
			lines.forEach((line) => {
				console.error(
					`\x1b[${getColorCode(color)}m${prefix}\x1b[0m \x1b[31m${line}\x1b[0m`
				)
			})
		})

		proc.on('error', (error) => {
			console.error(
				`\x1b[31m启动 ${service.name} 失败: ${error.message}\x1b[0m`
			)
		})

		proc.on('exit', (code) => {
			console.log(
				`\x1b[${getColorCode(color)}m${prefix}\x1b[0m 服务退出，状态码: ${code}`
			)
		})

		return proc
	})

	// 处理进程终止
	process.on('SIGINT', () => {
		console.log('\n正在停止所有服务...')
		processes.forEach((proc) => {
			proc.kill('SIGINT')
		})
		process.exit(0)
	})
}

// 获取颜色代码
function getColorCode(color) {
	const colorCodes = {
		blue: '34',
		green: '32',
		magenta: '35',
		cyan: '36',
		red: '31',
		yellow: '33',
		gray: '90',
		bgBlue: '44',
		bgGreen: '42',
		bgMagenta: '45',
	}
	return colorCodes[color] || '37' // 默认白色
}

startAllServices().catch((error) => {
	console.error('启动服务时出错:', error)
	process.exit(1)
})
