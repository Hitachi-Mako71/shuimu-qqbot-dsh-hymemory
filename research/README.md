# 对话研究工作区

研究代码和笔记与正常安装入口分开保存。当前回复优化已由用户暂停；整理这些文件不会运行模型调用或恢复优化。

- [notes/](notes/)：论文、方法及局限。
- [tools/](tools/)：显式运行的研究探针与试验工具；不是安装步骤。
- 应用的可插拔对话引擎在[app/dsh-hymemory-plugin/dialogue-engine/](../app/dsh-hymemory-plugin/dialogue-engine/)。
- 实际语料、原始调用、标注及私人资料均留本机忽略目录，不随仓库发布。

多数研究CLI保留以app/为工作目录的约定，示例：

```powershell
Set-Location <仓库目录>/app
node ../research/tools/probe-dialogue-positive.mjs
```

上面的示例会调用模型，只有明确恢复研究任务后才运行。仅检查结构时使用仓库根目录的scripts/check-repository.mjs。原创场景只作故障回归，真人语料验收记录应保留真实来源与原始标签；不以程序通过或助手自评分数代替内容验收。

历史方法记录：[原始中文语料](notes/REAL_CORPUS_EVALUATION_20261101.md)、[真人示例对照](notes/HUMAN_CORPUS_ICL_20261101.md)、[IRC回复边基线](notes/IRC_REAL_REPLY_LINK_BASELINE_20261101.md)。这些是暂停前的记录，不是继续优化或部署放行。
