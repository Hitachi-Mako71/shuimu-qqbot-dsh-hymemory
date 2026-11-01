# 参与维护

源码从本仓库修改，运行命令从 app/ 执行。目录职责见[目录说明](docs/development/repository-layout.md)，本机部署与源码分离见[工程维护](docs/development/engineering.md)。

1. 先定位是业务代码、运行配置、研究实验还是历史记录。
2. 修改前读 AGENTS.md；不要复制 .env、data/、日志、登录态或语料到仓库。
3. 应用行为变更遵循独立验证与版本流程；纯目录整理不切换活动服务。
4. 提交前从仓库根目录执行 node scripts/check-repository.mjs。该检查不启动QQ、不调用模型、不代表功能验收。
5. 检查 git diff 与提交树，再按[发布流程](docs/development/releasing.md)处理版本、包及部署。

模型回复优化和模型调用必须有独立任务授权；目录维护不会自动恢复已暂停的研究。
