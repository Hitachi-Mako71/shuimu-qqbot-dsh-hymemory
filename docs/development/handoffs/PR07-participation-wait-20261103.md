# PR07 有界 WAIT 与候选生命周期

- 版本：0.22.31；本机参与模式保持 off。
- WAIT 经原 enqueue/schedule/consider 重判；同一候选最多两次，间隔 1 秒，严格早于原 expiresAt 及队列 120 秒期限。保留 messageId、receivedAt、createdAt 和候选对象。
- 同候选重判沿用已完成的初始消息数/判断间隔资格，仍检查发送间隔、小时限额、暂停、隐私及候选有效性。
- 新群消息（重复目标事件除外）、直接回复、epoch/cancelEpoch/revision 变化、模式回退和卸载生命周期会使旧 WAIT 失效。A 或生成结果迟到时，再检查有效性，不能恢复已取消候选。
- 每群独立记录，原调度器继续拥有定时器；无第二套后台循环。
- 离线合成核验：participation-wait、participation-routing、group-activity 共 51 项通过。首次运行中 fake clock 夹具只有 setter，缺少 getter；补齐 getter 后同组核验全通过。此修正未改变业务源码。
- 这些结果不是真实 QQ 收发测试；本版未触发群发言或调用真实模型。真实 WAIT 行为仍待显式模式下的真实 QQ 验收。
- 回滚：participation.mode=off；保留上一版包与 profile 清单备份。源码、包和安装文件检查与服务健康另行记录在本机 .run。
