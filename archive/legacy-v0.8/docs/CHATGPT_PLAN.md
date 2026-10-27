> 历史资料：正文属于原版本快照，当前部署见[归档导航](../../README.md)。

# ChatGPT账号提供方

柚柚通过DSH原生模型适配器 `chatgpt-plan` 使用主人明确授权的ChatGPT账号。账号登录、令牌续期与模型目录都保存在本机 `data/chatgpt-plan`，不进入Git或配置导出包。

**计量说明：该官方账号授权使用Work/Codex共享用量。** 当前用户已选择此路线的Luna模型；工作目录与最新验收见 [Work / Luna](WORK_LUNA.md)。官方依据：[Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)。

## 首次登录和切换

1. 启动“柚柚机器人控制台”，打开“对话模型”。
2. 点击“使用ChatGPT账号授权”，只在OpenAI官方页面登录并允许账号使用。不要把密码、验证码或回调网址发给他人。
3. 返回控制台，刷新模型目录，选择账号列出的模型。
4. 点击“验证所选模型”。确认短回复验证成功后，点击“切换对话模型”。
5. 控制台会备份原qqbot profile配置、写入模型路由并提示重启。重新启动后概览应显示QQ与记忆均就绪；“对话模型”页应显示当前路由。

当前本机使用 `gpt-6-luna`，low。账号目录也列出 `gpt-5.6-luna`。模型名称和可用范围由已授权账号返回，不应硬编码到其他部署中。

## 请求与记忆范围

- QQ私聊、群聊、主动消息和Hy Memory的自动提炼请求都使用同一模型路由。Hy Memory向量仍由本机 `BAAI/bge-small-zh-v1.5` 生成。
- 私聊和群聊的会话、长期记忆仍按既有QQ身份边界隔离；换模型不会合并记忆。
- 恢复DeepSeek时，在控制台选择DeepSeek并保存。原DeepSeek模型和提供方作为本地回退值保存在 `data/model-routing.json`；模型修改后需要重启QQ Bot。
- 账号失效、限额或网络中断会显示本机错误状态。不能连接ChatGPT时，控制台可以切回DeepSeek；记忆服务故障时仍按既有降级逻辑处理。

## 边界与故障排查

- 此连接使用账号授权路线，不要求单独OpenAI API Key；可用模型、套餐额度和速率由账号与服务端决定。
- 它不会读取或同步ChatGPT网页端历史，也不会把QQ对话写入ChatGPT网页历史。需要带给模型的上下文由DSH会话与Hy Memory提供。
- 本机状态检查：在“对话模型”页确认账号已连接、所选模型已验证；概览中的QQ和长期记忆应为就绪。状态异常时打开“运行日志”，先检查错误码和网络，再刷新账号模型并重新验证。
- 图片输入依账号模型的输入能力；QQ日常配图仍走独立的Codex内置生图链路，不由ChatGPT模型插件代替。

## 官方资料

- [Sign in with ChatGPT快速入门](https://developers.openai.com/siwc/quickstart)
- [开源客户端登录流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [模型列表和推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [预览期限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
