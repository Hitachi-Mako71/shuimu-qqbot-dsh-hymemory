# 按需加载与资源使用

QQ/DSH 及本机记忆接口保持可用，Hindsight 引擎和本地 embedding 在需要召回、提炼或删除时启动。所有相关工作和队列空闲 5 分钟后释放引擎资源。

因此首次请求会比已加载时多出启动开销；健康接口在线也不表示所有模型都常驻内存。后台队列、进行中的请求或删除操作尚未结束时不会提前释放。

在 `app/` 可查看本机健康状态和日志：

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Get-Content .\logs\memory.out.log -Tail 30
```

实际耗用受 QQ 客户端、NapCat、DSH 上下文和当前任务影响。旧版本的少量延迟样本保存在[历史报告](../../archive/reports/response-speed-v0.5.md)，不作为当前硬件和版本的性能承诺。
