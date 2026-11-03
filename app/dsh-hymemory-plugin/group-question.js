// Classify the member's own question, excluding examples quoted in prose/code.
export function isGroupQuestion(value) {
  const text=String(value||'').replace(/https?:\/\/[^\s]+/gu,'链接').replace(/```[\s\S]*?```|`[^`\n]*`|“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’/gu,' ').trim();
  if(!text||text.startsWith('/'))return false;
  if(/^(?:我|他|她|我们|他们|她们)(?:已经|终于|都)?(?:知道|明白|懂得|清楚)(?:了)?(?:怎么|如何|为什么)/u.test(text)&&!/[？?]/u.test(text))return false;
  return /[？?]/u.test(text)
    || /^(?:请问|想问(?:一下)?|问一下|什么是|怎么|怎样|如何|为什么|为啥|谁|哪里|哪个|哪些|哪种|哪位|多少|能不能|可不可以|是不是|是否|能否|可否|有没有)/u.test(text)
    || /(?:怎么|怎样|如何|为什么|为啥|哪里|哪个|哪些|哪种|多少).{0,80}$/u.test(text)
    || /(?:吗|么|呢|是什么|是指什么|什么意思|是什么意思|怎么解决|怎么办|怎么回事|怎么配置|怎么用|等于几|等于多少|行不行|可不可以|能不能)[呀啊呢。！!～~\s]*$/u.test(text);
}
