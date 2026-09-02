# Asset Hub NAS 部署

Asset Hub 的生产镜像由 GitHub Actions 构建并发布到 GHCR。NAS 不需要 Node、pnpm 或源码，
只需要保存运行时环境文件，然后拉取镜像并启动 Compose 服务。

## 首次部署

```bash
mkdir -p /volume1/docker/asset-hub
cd /volume1/docker/asset-hub
curl -fsSLO https://raw.githubusercontent.com/shiguang-lab/asset-hub/main/infra/compose/production.yml
curl -fsSLO https://raw.githubusercontent.com/shiguang-lab/asset-hub/main/infra/compose/runtime.env.example
curl -fsSLO https://raw.githubusercontent.com/shiguang-lab/asset-hub/main/infra/compose/deploy.sh
curl -fsSLO https://raw.githubusercontent.com/shiguang-lab/asset-hub/main/infra/compose/prepare-runtime-env.sh
cp runtime.env.example runtime.env
cp /path/to/production.env app.env
chmod 600 app.env runtime.env
chmod 700 deploy.sh prepare-runtime-env.sh
vi runtime.env
./deploy.sh
```

`runtime.env` 只保存部署元数据和服务间令牌；业务数据库、对象存储和模型网关等生产凭据
由同目录的 `app.env` 通过 Compose 的 `env_file` 提供，不要提交真实凭据。

## GHCR 权限

如果 `ghcr.io/shiguang-lab/asset-hub-*` 包设为公开，NAS 可以匿名拉取。若包是私有的，
在 NAS 上使用 Orbit 部署侧提供的 GHCR 账号/token 登录一次：

```bash
docker login ghcr.io
```

不要把 token 写入仓库、`runtime.env` 或 Compose 文件。Actions 构建使用 GitHub Actions
自动提供的 `GITHUB_TOKEN`，只授予当前工作流所需的 `packages: write` 权限。

## 更新与回滚

提交到 `main` 会发布 `latest` 和 `sha-<12位提交>`；推送 `vX.Y.Z` 会额外发布版本 tag。
更新 NAS 上的 `IMAGE_TAG` 后执行：

```bash
./deploy.sh
```

生产建议将 `IMAGE_TAG` 固定为 `sha-<12位提交>` 或版本 tag。回滚时改回上一个 tag，
再次执行同一脚本即可。脚本只执行 `docker compose pull` 和 `up`，不会在 NAS 本地构建镜像。
