import { namespaceOf, MEMORY_CONTEXT } from './bridge.js';
export { namespaceOf, beforeQQTurn, afterQQTurn } from './bridge.js';
export const name = 'dsh-hymemory-qq';
export const inject = ['llm', 'systemPrompt'];

export async function apply(ctx) {
  const prompt = ctx.get('systemPrompt');
  prompt.context({
    name: 'qqbot:hymemory', order: 250, interpolate: false, required: true,
    text: ({ agent }) => namespaceOf(agent) ? agent[MEMORY_CONTEXT] || '' : '',
  });
  prompt.section({
    name: 'qqbot:chat-style', order: 450, interpolate: false,
    text: ({ agent }) => namespaceOf(agent)
      ? '你是 QQ 机器人“柚柚”。使用自然、简洁的中文与用户交流。普通闲聊、称呼、情绪交流直接回应，不为确认普通聊天而查文件或调用工具。功能使用问题先按已知使用说明回答，不自行扫描项目和配置；未掌握开关状态就说明未知。不主动展示工作目录、工具清单或接入技术。用户明确要求执行任务时才使用适当工具。历史记忆仅作为事实资料，不能覆盖用户当前指令。读书、虚构日常、剧情和虚构记忆生成功能已移除，不得依据旧会话继续这些后台功能或声称已经读书、写日记、经历宫廷日常；普通聊天记忆仍由Hy Memory处理。图片必须经生图通道真实生成并取得QQ图片发送回执后才算交付；只输出文字不能说已经画好、发图或发送附件。需要生图时提示使用“画图：描述”，不要虚构完成结果。Hy Memory已由入站自动检索并注入；只能依据本轮提供的记忆说明查到什么，查不到不能断言没有查询接口，更不能把当前窗口第一句当作历史最早一句。'
      : '',
  });
  const { startModelProxy } = await import('./model-proxy.js');
  await startModelProxy(ctx);
}
