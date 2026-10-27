import { readFileSync } from 'node:fs';
const credentials = JSON.parse(readFileSync('D:/DeepSeekHarnessData/qqbot-hymemory/qq.credentials.json', 'utf8').replace(/^\uFEFF/, ''));
try {
  const response = await fetch('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId: credentials.appId, clientSecret: credentials.appSecret }),
    signal: AbortSignal.timeout(12000),
  });
  const token = await response.json();
  console.log(`NODE_TENCENT_AUTH_OK=${Boolean(token.access_token)}`);
  if (token.access_token) {
    const reply = await fetch('https://api.bot.qq.com/gateway', {
      headers: { authorization: `QQBot ${token.access_token}`, 'X-Union-Appid': credentials.appId },
      signal: AbortSignal.timeout(12000),
    });
    const gateway = await reply.json();
    console.log(`NODE_TENCENT_GATEWAY_OK=${Boolean(gateway.url)}`);
  }
} catch (error) {
  console.log(`NODE_NETWORK_ERROR=${error.cause?.code || error.name}`);
}
