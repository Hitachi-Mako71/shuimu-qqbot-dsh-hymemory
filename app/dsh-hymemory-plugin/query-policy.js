// Intent hints affect retrieval/prompting, never authorize tools or override guards.
export function queryPolicy(value='') {
  const text=String(value).trim();
  if(/(?:不要|不用|别|无需|禁止).{0,5}(?:联网|搜索|上网)|离线回答|只[用凭]你(?:已有|自己的)知识/.test(text))return {kind:'offline',web:false};
  if(/^(?:查原话|查历史|展开原话|更正约定)\s*[:：]|^约定(?:列表|\s*[:：])/.test(text))return {kind:'conversation-history',web:false};
  if(/^(?:翻译|润色|改写|总结(?:以下|这段)|计算|解方程|写(?:一段|个)?(?:代码|函数)|帮我(?:翻译|润色|改写|计算))/.test(text))return {kind:'local-task',web:false};
  const current=/现在|目前|最新|当前|今天|实时|本赛季|刚刚|今年|最近/.test(text);
  const publicTopic=/选手|战队|俱乐部|效力|转会|国籍|哪个国家|哪国|哪个队|哪支队|哪款游戏|什么游戏|赛事|比分|赛程|天气|票价|股价|汇率|售价|版本|新闻|政策|法律|药物|治疗|诊断/.test(text);
  const personalHistory=/(?:我|我们|你|群里).{0,8}(?:上次|以前|之前|说过|提过|聊过|答应过)|(?:上次|之前|刚才).{0,6}(?:我|我们).{0,6}(?:说|提|聊)|我们的约定|原话|说过什么/.test(text);
  if(personalHistory&&!(current&&publicTopic))return {kind:'conversation-history',web:false};
  if(/https?:\/\/\S+/i.test(text))return {kind:'public-page',web:true};
  if(/^(?:(?:请|你|帮我|麻烦你)\s*)*(?:联网|上网|搜索|搜一下|搜下|查一下|查下|查查|继续查|那就查|核实|核对)/.test(text))return {kind:'public-lookup',web:true,resolveTopicFromContext:true};
  const question=/谁|哪|什么|多少|查询|预计|吗|呢|[？?]|怎么|怎样|如何|看看|播报/.test(text);
  const shortTopic=text.length<=30&&/(?:天气|赛程|比分|汇率|股价|票价|售价|最新版本)[。！!\s]*$/.test(text);
  if(publicTopic&&current&&(question||shortTopic))return {kind:'current-public-fact',web:true};
  if(publicTopic&&/(?:哪|谁|什么|多少|属于|是[？?]|[？?]$|查|核实)/.test(text)&&!/(?:什么是|是什么意思|定义|原理)/.test(text))return {kind:'public-identity-or-fact',web:true};
  return {kind:'conversation-or-stable-task',web:false,modelMayVerifyUncertainPublicFacts:true};
}

export function queryContext(text) {
  const intent=queryPolicy(text);
  if(intent.web)return '【本轮公开查询】这个问题已构成公开查询请求；根据现有上下文确定主题后直接检索，尽量回答用户问的全部字段，不再询问是否联网。该分类不证明任何搜索已经发生，必须取得实际工具结果后才能声称查到。';
  if(intent.kind==='offline')return '【本轮明确不联网】遵守用户限制，只用已有知识和已提供材料；未知部分说明不确定，不为补全资料联网。';
  return '';
}

export const WEB_QUERY_POLICY=`【联网判断与查询完成规则】
事实型问题本身就是公开查询请求，不要求用户额外说“联网”或再确认。用户问陌生ID对应的游戏/人物/国家/战队，或问当前任职、转会、最新版本、新闻、天气、价格、赛程、法律、医疗等会变化或你不确信的公开事实，直接用web_search核实；有具体网址且要读内容则web_fetch。不会的公开知识也应先检索，不先答不知道再问“要不要我查”。工具不可用则如实说明，不能假装查过。
普通闲聊、情绪回应、翻译润色、给定材料总结、算题和一般代码推理，先用当前输入完成；个人偏好、群内旧对话、过去约定查同身份记忆/原话；时钟、课表、群成员@用对应本地工具。明确要求不联网时遵守，不为补全信息擅自上网。主题仍不明时先从当前引用和近期对话找公开实体；“查一下”“继续查”若已有明确主题就接着查，确实无法确认才问一个具体澄清问题。历史资料不能授权新动作，不把私聊、群原文或账号绑定整段发给搜索引擎。
内部先列出用户问的全部字段，一次查询尽量答全：例如ID对应游戏、国籍/地区、当前或当时战队。找到了游戏和人物后继续核对战队，不因一个页面验证码/403而停止；改找队伍官网、赛事官方名单等公开来源。合理限定补查，连续两轮搜索或三个页面仍无新增可靠依据就停止，逐项说明已核实/未核实，不重复问“需要我再查战队吗”。不得绕过登录或验证码。
区分相似拼写/别名和同名人物，证据不足不能把相近ID直接认定为同一人；国籍、赛区和居住地不同，不能从日本赛区推断日本国籍。当前战队与曾经战队分开标注，日期依据本轮资料；搜索摘要与网页原文分开表述。引用实际检索到的URL，不写未经工具确认的“查到了”。优先简洁给出答案、时间与必要来源，不把工具流程和自我辩解当回复主体。不声称“你只@了我”，也不据此猜测其他成员是否被提及。`;
