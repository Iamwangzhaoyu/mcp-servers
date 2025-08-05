// 服务发现模块
import fs from 'fs'
import path from 'path'
import { findFilesWithExtension } from './utils.js'

// 检查是否为Node.js MCP服务
export function isNodeMcpService(servicePath) {
	const packageJsonPath = path.join(servicePath, 'package.json')

	try {
		if (fs.existsSync(packageJsonPath)) {
			const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

			// 检查package.json中的关键字或依赖
			if (packageData.dependencies) {
				if (packageData.dependencies['@modelcontextprotocol/sdk']) return true
				if (packageData.keywords?.includes('mcp')) return true
				if (packageData.name?.includes('mcp')) return true
			}
		}
	} catch (error) {
		console.warn(`警告: 解析 ${packageJsonPath} 失败: ${error.message}`)
	}

	return false
}

// 检查是否为Python MCP服务
export function isPythonMcpService(servicePath) {
	// 检查requirements.txt
	const requirementsPath = path.join(servicePath, 'requirements.txt')
	try {
		if (fs.existsSync(requirementsPath)) {
			const requirements = fs.readFileSync(requirementsPath, 'utf8')
			if (
				requirements.includes('modelcontextprotocol') ||
				requirements.includes('mcp-') ||
				requirements.includes('mcp_')
			) {
				return true
			}
		}
	} catch (error) {
		console.warn(`警告: 读取 ${requirementsPath} 失败: ${error.message}`)
	}

	// 检查Python文件
	try {
		const pythonFiles = findFilesWithExtension(servicePath, '.py')
		for (const pyFile of pythonFiles) {
			const content = fs.readFileSync(pyFile, 'utf8')
			if (
				content.includes('import mcp') ||
				content.includes('from mcp') ||
				content.includes('import modelcontextprotocol') ||
				content.includes('from modelcontextprotocol')
			) {
				return true
			}
		}
	} catch (error) {
		console.warn(`警告: 查找Python文件失败: ${error.message}`)
	}

	return false
}

// 检查是否为Java MCP服务
export function isJavaMcpService(servicePath) {
	// 检查pom.xml或build.gradle
	const pomPath = path.join(servicePath, 'pom.xml')
	const gradlePath = path.join(servicePath, 'build.gradle')

	try {
		if (fs.existsSync(pomPath)) {
			const pom = fs.readFileSync(pomPath, 'utf8')
			if (
				pom.includes('modelcontextprotocol') ||
				pom.includes('mcp-') ||
				pom.includes('mcp.')
			) {
				return true
			}
		}

		if (fs.existsSync(gradlePath)) {
			const gradle = fs.readFileSync(gradlePath, 'utf8')
			if (
				gradle.includes('modelcontextprotocol') ||
				gradle.includes('mcp-') ||
				gradle.includes('mcp.')
			) {
				return true
			}
		}
	} catch (error) {
		console.warn(`警告: 读取构建文件失败: ${error.message}`)
	}

	// 检查Java文件
	try {
		const javaFiles = findFilesWithExtension(servicePath, '.java')
		for (const javaFile of javaFiles) {
			const content = fs.readFileSync(javaFile, 'utf8')
			if (
				content.includes('import mcp.') ||
				content.includes('import io.modelcontextprotocol') ||
				content.includes('import com.modelcontextprotocol')
			) {
				return true
			}
		}
	} catch (error) {
		console.warn(`警告: 查找Java文件失败: ${error.message}`)
	}

	return false
}

// 检查Dockerfile是否包含MCP特性
export function dockerfileContainsMcpFeatures(servicePath) {
	const dockerfilePath = path.join(servicePath, 'Dockerfile')
	try {
		if (fs.existsSync(dockerfilePath)) {
			const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8')
			if (
				dockerfileContent.includes('mcp') ||
				dockerfileContent.includes('modelcontextprotocol') ||
				dockerfileContent.includes('MCP_') ||
				dockerfileContent.includes('--transport http')
			) {
				return true
			}
		}
	} catch (error) {
		console.warn(`警告: 读取Dockerfile失败: ${error.message}`)
	}
	return false
}

// 从Dockerfile提取运行命令
export function extractDockerCommand(dockerfilePath) {
	try {
		if (fs.existsSync(dockerfilePath)) {
			const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8')
			const lines = dockerfileContent.split('\n')

			// 寻找CMD指令
			let cmdLines = lines.filter((line) =>
				/^\s*(CMD|ENTRYPOINT)\s+/.test(line.trim())
			)

			// 如果没有找到CMD或ENTRYPOINT，返回null
			if (cmdLines.length === 0) {
				return null
			}

			// 使用最后一个CMD或ENTRYPOINT
			const lastCmd = cmdLines[cmdLines.length - 1]

			// 解析CMD格式
			// 支持以下格式:
			// 1. CMD ["executable", "param1", "param2"] (exec form)
			// 2. CMD command param1 param2 (shell form)
			// 3. ENTRYPOINT ["executable", "param1"] (exec form)
			// 4. ENTRYPOINT command param1 param2 (shell form)
			let command = ''
			const jsonRegex = /^\s*(CMD|ENTRYPOINT)\s+(\[.*\])/
			const shellRegex = /^\s*(CMD|ENTRYPOINT)\s+(.*)/

			const jsonMatch = lastCmd.match(jsonRegex)
			if (jsonMatch) {
				try {
					// 处理exec形式
					const cmdArray = JSON.parse(jsonMatch[2])
					command = cmdArray.join(' ')
				} catch (e) {
					console.warn(`警告: 解析Dockerfile命令JSON失败: ${e.message}`)
					return null
				}
			} else {
				// 处理shell形式
				const shellMatch = lastCmd.match(shellRegex)
				if (shellMatch) {
					command = shellMatch[2]
				}
			}

			return command.trim()
		}
	} catch (error) {
		console.warn(`警告: 读取或解析Dockerfile失败: ${error.message}`)
	}
	return null
}

// 确定服务运行命令
export function determineServiceRunCommand(
	servicePath,
	serviceName,
	serviceType
) {
	// 检查是否有Dockerfile，如果有，尝试提取CMD
	const dockerfilePath = path.join(servicePath, 'Dockerfile')
	const dockerCommand = extractDockerCommand(dockerfilePath)

	if (dockerCommand) {
		// 如果找到了Docker命令，检查是否需要添加端口参数
		if (
			dockerCommand.includes('--port') ||
			dockerCommand.includes('-p ') ||
			dockerCommand.includes('-p=')
		) {
			// 命令已经包含端口配置，替换为占位符
			return dockerCommand.replace(/--port[= ]\d+|-p[= ]\d+/, '--port {{PORT}}')
		} else {
			// 命令中没有端口配置，添加端口参数
			return `${dockerCommand} --port {{PORT}}`
		}
	}

	// 如果没有找到Docker命令，根据服务类型提供默认命令
	switch (serviceType) {
		case 'node':
			// 对于Node.js服务，根据package.json查找入口点
			try {
				const packageJsonPath = path.join(servicePath, 'package.json')
				if (fs.existsSync(packageJsonPath)) {
					const packageData = JSON.parse(
						fs.readFileSync(packageJsonPath, 'utf8')
					)
					// 检查是否有start脚本
					if (packageData.scripts && packageData.scripts.start) {
						return `npm run start -- --transport http --port {{PORT}}`
					}
					// 检查main入口点
					if (packageData.main) {
						return `node ${packageData.main} --transport http --port {{PORT}}`
					}
				}
				// 默认Node命令
				return `node src/index.js --transport http --port {{PORT}}`
			} catch (error) {
				console.warn(`警告: 解析package.json失败: ${error.message}`)
				return `node src/index.js --transport http --port {{PORT}}`
			}
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
}
