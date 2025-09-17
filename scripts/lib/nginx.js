// Nginx配置生成模块
import fs from 'fs'
import path from 'path'

// 生成Nginx配置文件
export function generateNginxConfig(
	services, // 服务列表
	nginxConfigPath // nginx配置文件路径
) {
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
		} else if (service.name === 'mcp-chart-service') {
			// 为图表服务增加更长的超时设置
			return `    # ${service.name}服务
    location /${service.name} {
        proxy_pass http://${service.name}:${service.port};
        
        # 增加超时设置
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s; 
        proxy_read_timeout 300s;
        send_timeout 300s;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
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
