# Human-like Dialogue Engine · 0.2.0

未发布的论文对齐修订（2026-11-01）：重新核对六篇原文后，`postAlign:true`的首轮草稿现在推迟内置人格、显式个人记忆与示例；后置阶段保留原对话背景及经空间/来源过滤的资料。宿主`hostSystem/context`仍原样保留，调用方须分开硬约束与软人格；这属于安全约束下的PPA适配，不是原论文完整复现。规划、样例检索或复核与PPA同时启用会抛`DialogueAlignmentStrategyConflict`，避免混淆实验与增加隐含调用。检索无命中且无预提供事实时返回草稿；仍须验证其风格稳定性。33项引擎契约及379项源码隔离回归通过，尚未开展本修订真实模型内容验收或部署。

2026-11-01：业务插件0.22.22。375项隔离回归通过，29项实际安装引擎检查通过；这些不是回复内容验收。引用自身归属与回应对象校验已修复。候选提示词、额外规划、检索与复核都不在日常聊天里自动启用。完整过程见项目`docs/DIALOGUE_OPTIMIZATION_20261101.md`。

中文社交对话的独立研究模块。ESM、零外部依赖；目录可以单独复制部署。没有 QQ、DSH、数据库、网络或凭证依赖，模型和召回通过回调注入。此版本是研究原型，尚未证明比原版 DeepSeek 更自然。

2026-10-29验证：353项隔离回归通过；80次真实DeepSeek调用生成68条候选的首轮检查发现，普通吐槽追问、引用接话错位及能力自述仍有失败，不能宣布内容验收通过。已修复独立规划未接收共同基础、PPA修订漏传宿主约束和拆分时遗漏的身份/例句边界；记忆场景复测另9次调用，P/D各3条均回答正确。详见项目 `docs/DIALOGUE_ENGINE_VALIDATION_20261029.md`。

五个职责分别位于 `social-understanding.js`、`dialogue-policy.js`、`common-ground.js`、`style-persona.js`、`response-generation.js`。`index.js` 提供组合接口；对外返回 reply / wait / skip，发送和工具执行由宿主决定。

```js
import { generateDialogueReply, compileDialogueTurn } from './index.js';
const result = await generateDialogueReply({
  scope: 'private', speaker: '用户', text: '写了一晚上的代码被覆盖了。',
  turns: [], // { speaker, role: member|assistant|other_bot, text }
}, {
  generate: async ({system,user,maxTokens,signal,stage}) => yourModel({system,user,maxTokens,signal}),
});
// result: {action, text, diagnostics, sourceIds, modelCalls}
```

`compileDialogueTurn` 供原生 Agent 注入每轮社交观察和生成规则，不代替 Agent 的工具过程。`generateDialogueReply` 是独立内容生成入口，支持外部 skip/wait（零模型调用）、取消信号和诊断。经宿主核验的`addressedTo:'other'`群消息避让；`addressedTo:'self'`可直接讨论引用。诊断不是拟人分数，不按关键词剪掉正文或问句。

默认`stylePreset:'stable'`保持此前表达契约。新提示在`candidate-style.js`，需显式`stylePreset:'candidate'`；它尚未通过内容验收。`inputFormat:'dialogue'`是替代输入排版实验，默认`json`。两者不改变来源、身份或发送权限。

可选`retrieveExamples(turn,{signal})`返回封闭原创样例ID，任意文字不会提升为可信样例。`example-retriever.js`提供注入`embed`的选择器，只缓存公开示例向量，不缓存用户查询或关系。通用未规划轮次不附无关任务示例。选例故障使用空示例并继续；取消仍传播。

可选`reviewReply:true`做一次有界条件复核，会增加模型调用。`review.accepted`只表示格式与局部契约通过，不是自然度合格；复核失败保留原稿并返回`review_failed`。该实验曾出现“JSON合法但继续点评心态”的失败，默认关闭。

生产采用一次生成；理解与策略作为内部生成约束，不伪称已经运行独立的语义理解模型。研究时 `separatePlanning:true` 才先生成结构化会话行为，再生成正文，调用次数通常变为两次。`postAlign:true` 是额外的草稿检索与校正实验，需要显式提供 `contextKey` 和 scoped recall，通常再增加一次生成；生产默认关闭。规划失败或取消直接向宿主报错，不启动重试、重发或工具操作。

`contextKey` 只由宿主提供，不把它展示给模型；memories 仅接受同 contextKey、带 sourceIds、未 withdrawn 的项目。宿主仍须执行身份、删除屏障、来源回溯、发送前复核；模块的过滤不能作为授权依据。模块不存储关系、情绪或共同记忆。`context` 为宿主已过滤的有界材料，作为不可信资料传给模型；输入资料不能升级工具权限。

`dialogue-adapter.js` 在父目录连接 QQbot：私聊/直接群聊复用原生 Agent，旁听复用 DeepSeek 回调；所有最终消息继续走原有发送、限流、来源和删除流程。`voice.js` 保留兼容导出，实际表达规则现在由本模块拥有。旧 `skills/yuzu-natural-chat/prompt.md` 是历史参考，不再被运行时读取。

## 研究与验证

`research/scenarios.json` 提供16个原创困难场景，没有复制用户真实聊天或 Galgame 台词，不是假称的真人数据集。补充200–300个授权匿名场景是后续研究工作，不能拿这16个场景报告用户盲测提升。

`research/experiment.js` 的 `runExperiment` 对同一个模型回调运行 A 原始、B 表达规则、C 规划+表达、D 规划+表达+有来源记忆+示例；需要填写固定 modelVersion。seed 仅记录，不保证提供方支持确定性采样。默认示例按规划行为、引用或图片匹配；语义检索需额外显式回调。实验不自动调用生产模型。

盲评由至少3名评价者对随机左右排序的候选比较：自然度、贴题、关系与发言者归属、人物一致、情绪变化、记忆正确、事实可靠。记录 tie / 两者都差。群聊额外统计抢话和过度发言。分开报告自然感与语义偏离，报告模型调用次数、延迟和来源数；不把模型裁判或“AI词命中数”当主要结果。再做10–20轮及跨会话评估。

仅验证接口契约，不调用真实模型、不发 QQ 消息：

```powershell
node --test dsh-hymemory-plugin/dialogue-engine/test/*.test.js
```

研究依据和未采用的技术见项目 `docs/HUMAN_LIKE_DIALOGUE_ENGINE.md`。
