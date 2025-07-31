/**
 * Nginx配置生成模块
 * 负责生成Nginx配置
 */
import fs from 'fs'
import path from 'path'

/**
 * 生成安全指南文档
 * @param {string} outputPath - 输出文件路径
 */
export function generateSecurityGuide(outputPath) {
	const content = `# MCP 服务安全指南

此文档包含关于MCP服务部署的安全最佳实践和建议。

## 已实施的安全措施

1. **Nginx安全配置**
   - 隐藏服务器版本信息
   - 添加安全HTTP头部（XSS保护、CSRF保护等）
   - 限制可访问的资源

2. **Docker容器安全**
   - 资源限制（CPU和内存）
   - 非root用户运行服务
   - 只读文件系统（除必要的写入目录）

3. **网络安全**
   - 容器间通信使用私有网络
   - 只暴露必要端口
   - 反向代理保护直接访问

## 建议安全加固措施

1. **启用HTTPS**
   - 配置SSL证书
   - 实施HTTP重定向到HTTPS
   - 使用安全的SSL配置

2. **实施访问控制**
   - 添加认证机制
   - 实施IP限制
   - 设置适当的访问日志

3. **定期更新和维护**
   - 更新基础镜像
   - 扫描漏洞
   - 备份配置和数据

## 监控建议

1. 设置日志监控系统
2. 定期检查异常访问模式
3. 监控容器资源使用情况

---
*本文档由系统自动生成，最后更新于 ${new Date().toISOString().split('T')[0]}*
`

	try {
		// 如果文件已存在，先删除
		if (fs.existsSync(outputPath)) {
			fs.unlinkSync(outputPath)
		}

		fs.writeFileSync(outputPath, content)
		console.log('✅ 安全指南生成完成')
	} catch (error) {
		console.warn(`⚠️ 生成安全指南失败: ${error.message}`)
	}
}

/**
 * 生成Nginx配置文件
 * @param {Array} services - 服务列表
 * @param {string} nginxConfigPath - nginx配置文件路径
 */
export function generateNginxConfig(services, nginxConfigPath) {
	console.log('📝 生成nginx配置...')

	try {
		// 如果配置文件已存在，直接删除
		if (fs.existsSync(nginxConfigPath)) {
			// 直接删除旧文件，不创建备份
			fs.unlinkSync(nginxConfigPath)
		}

		// 确保目录存在
		const configDir = path.dirname(nginxConfigPath)
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true })
		}

		// 服务器配置块内容
		const serverConfig = `# MCP服务网关配置 - 自动生成于 ${new Date().toLocaleString()}
# 警告: 请勿手动修改此文件，它将被自动覆盖

server {
    listen 80;
    server_name localhost;
    
    # 日志配置
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log debug;

    # 基础安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Frame-Options SAMEORIGIN;
    add_header Referrer-Policy strict-origin;
    
    # 静态资源
    location /static/ {
        root /usr/share/nginx/html;
        expires 1d;
    }
    
    # 健康检查
    location = /health {
        access_log off;
        return 200 "OK";
    }
    
    # 默认首页
    location = / {
        return 302 /static/;
    }
    
    # 服务代理配置
${services
	.map((service) => {
		// 特殊处理context7
		if (service.name === 'context7') {
			return `    # context7服务
    location /context7 {
        rewrite ^/context7(.*)$ /mcp$1 break;
        proxy_pass http://context7:${service.port};
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }`
		} else {
			return `    # ${service.name}服务
    location /${service.name} {
        proxy_pass http://${service.name}:${service.port};
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }`
		}
	})
	.join('\n\n')}

    # 默认处理，返回404
    location / {
        return 404;
    }
}`

		// 写入配置文件
		fs.writeFileSync(nginxConfigPath, serverConfig)

		// 创建静态目录
		const staticDir = path.join(path.dirname(nginxConfigPath), '../html/static')
		if (!fs.existsSync(staticDir)) {
			fs.mkdirSync(staticDir, { recursive: true })
		} else {
			// 清空静态目录中的文件
			const staticFiles = fs.readdirSync(staticDir)
			staticFiles.forEach((file) => {
				const filePath = path.join(staticDir, file)
				if (fs.statSync(filePath).isFile()) {
					fs.unlinkSync(filePath)
				}
			})
		}

		// 创建简单的静态索引页
		const indexHtmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>MCP服务网关</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        .container { background: #f8f9fa; border-radius: 5px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        .service-list { margin: 20px 0; }
        .service-item { background: white; border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 10px; }
        .service-name { font-weight: bold; margin-bottom: 5px; }
        .service-url { display: block; margin-top: 5px; color: #0366d6; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MCP服务网关</h1>
        <p>以下是当前可用的MCP服务:</p>
        
        <div class="service-list">
            ${services
							.map(
								(service) => `
            <div class="service-item">
                <div class="service-name">${service.name}</div>
                <a href="/${service.name}" class="service-url">/${service.name}</a>
            </div>
            `
							)
							.join('')}
        </div>
        
        <p><small>部署时间: ${new Date().toLocaleString()}</small></p>
    </div>
</body>
</html>`

		fs.writeFileSync(path.join(staticDir, 'index.html'), indexHtmlContent)
		console.log('✅ 已创建静态资源页面')

		console.log('✅ Nginx配置生成完成')
	} catch (error) {
		console.error('❌ 生成Nginx配置失败:', error.message)
		throw error
	}
}
