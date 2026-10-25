# Tutorial Hub

一个教程导航站：访客可浏览教程、注册登录并收藏；管理员可管理教程、推广标识、发布状态及点击数。

## 启动

```powershell
npm start
```

打开 <http://localhost:3000>。

首次启动会根据 `data/tutorials.example.json` 建立本地数据。管理员账号由环境变量设置：

```powershell
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_PASSWORD='replace-with-a-long-password'
npm start
```

未设置时会生成仅供本地演示的管理员账号，并在控制台显示一次随机密码。部署前务必设置以上两个变量，并使用持久化磁盘保存 `data/`。

## 部署到 Render

仓库内的 `render.yaml` 会创建一个新加坡区域的 Node.js Web Service，并把 1 GB 持久化磁盘挂载到 `/var/data`。首次创建 Blueprint 时，Render 会提示填写 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`。磁盘与付费计算方案会产生费用，请在 Render 确认页面核对当前价格后再应用。

## 合规说明

- 推广内容会以“推广链接 / 合作链接”显示。
- 不收集第三方服务账号与密码。
- 仅发布合法、原创或获授权的内容；运营者应按所在地法规和目标平台规则审核网络工具类教程。
- 价格、步骤与第三方政策可能变化；本站与第三方品牌均无官方关联，除非另有明确说明。
