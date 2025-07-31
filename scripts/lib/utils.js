/**
 * 工具函数模块
 * 提供各种通用的工具函数
 */
import fs from 'fs'
import path from 'path'

// 常量
const MAX_SEARCH_DEPTH = 5
const MAX_FILES_TO_SEARCH = 50

/**
 * 在目录中查找具有指定扩展名的文件
 * @param {string} dirPath 目录路径
 * @param {string} extension 文件扩展名
 * @param {number} maxDepth 最大搜索深度
 * @param {number} limit 最大文件数量
 * @param {number} currentDepth 当前搜索深度
 * @param {Set<string>} visitedDirs 已访问的目录集合(防止循环)
 * @returns {string[]} 文件路径列表
 */
export function findFilesWithExtension(
	dirPath,
	extension,
	maxDepth = MAX_SEARCH_DEPTH,
	limit = MAX_FILES_TO_SEARCH,
	currentDepth = 0,
	visitedDirs = new Set()
) {
	const foundFiles = []
	if (currentDepth > maxDepth) return foundFiles
	if (foundFiles.length >= limit) return foundFiles

	// 检测循环
	const realDirPath = fs.realpathSync(dirPath)
	if (visitedDirs.has(realDirPath)) return foundFiles
	visitedDirs.add(realDirPath)

	try {
		const files = fs.readdirSync(dirPath)

		for (const file of files) {
			if (foundFiles.length >= limit) break

			const filePath = path.join(dirPath, file)
			try {
				const stats = fs.statSync(filePath)

				if (stats.isDirectory()) {
					// 跳过一些常见的排除目录
					if (
						file === 'node_modules' ||
						file === '.git' ||
						file === 'dist' ||
						file === 'build'
					) {
						continue
					}

					// 递归搜索子目录
					const subDirFiles = findFilesWithExtension(
						filePath,
						extension,
						maxDepth,
						limit - foundFiles.length,
						currentDepth + 1,
						visitedDirs
					)
					foundFiles.push(...subDirFiles)
				} else if (stats.isFile() && file.endsWith(extension)) {
					foundFiles.push(filePath)
				}
			} catch (error) {
				console.warn(`警告: 无法访问文件 ${filePath}: ${error.message}`)
			}
		}
	} catch (error) {
		console.warn(`警告: 无法读取目录 ${dirPath}: ${error.message}`)
	}

	return foundFiles
}

/**
 * 服务名称清理
 * @param {string} name 原始服务名称
 * @returns {string} 清理后的服务名称
 */
export function sanitizeServiceName(name) {
	// 替换非法字符为连字符
	let sanitized = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

	// 确保不以连字符开头或结尾
	sanitized = sanitized.replace(/^-+|-+$/g, '')

	// 如果名称为空，使用默认名称
	if (!sanitized) {
		sanitized = 'mcp-service'
	}

	return sanitized
}

/**
 * 路径清理
 * @param {string} inputPath 原始路径
 * @returns {string} 清理后的路径
 */
export function sanitizePath(inputPath) {
	// 确保路径以/开头
	let path = inputPath
	if (!path.startsWith('/')) {
		path = '/' + path
	}

	// 移除多余的斜杠
	path = path.replace(/\/+/g, '/')

	// 移除URL不安全的字符
	path = path.replace(/[^a-zA-Z0-9_/.-]/g, '-')

	return path
}

/**
 * 检查服务名称是否合法
 * @param {string} name 服务名称
 * @returns {boolean} 是否合法
 */
export function isValidServiceName(name) {
	return /^[a-z0-9_-]+$/.test(name)
}

export { MAX_SEARCH_DEPTH, MAX_FILES_TO_SEARCH }
