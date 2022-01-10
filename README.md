# KFEngine   后台

这是工作流引擎的服务后台，对外提供 API，基于 HAPI，数据库使用 MongoDB，消息使用 ZeroMQ

## 运行

node server.js

## 确保运行时打包正常

## 安装配置

1. 安装 Docker：
   1. 如果不用 Docker, 可以单独安装 MongoDB 和 Redis
2. 修改 docker_mac_lkh.sh 中的 Docker 虚拟目录
3. 配置 MongoDB 用户，参考 mongodbsetup/user 文件中的最后面一段
   1. admin 用户的密码请谨慎
   2. 配置一个普通用户，如 raindrop
4. 检出源文件
   1. 在项目目录里，执行 npm install
5. 配置 src/config/emp.js 中最下面的 hapi 运行端口 PORT
6. 配置 src/config/emp.js 中 mongodb 的访问用户名和密码与第 3.2.中的配置相同
7. 安装 pm2
8. 运行 pm2 start serbver.js --name raindrop_server, 注意看 pm2 的输出
9. 监控 server 运行情况
   1. 输出： tail -f ~/.pm2/logs/raindrop*server_out*[NUMBER]\*.log
   2. 错误： tail -f ~/.pm2/logs/raindrop*server_err*[NUMBER].log
10. 访问 http://SERVER:PORT/ 应能看到本说明文档
11. 访问http://SERVER.PORT/documentation应能看到Talent Share 的 OpenAPI
