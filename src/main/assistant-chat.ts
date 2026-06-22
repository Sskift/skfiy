export function createAssistantChatReply(userInput: string): string {
  if (isShortGreeting(userInput)) {
    return "你好，我在。你可以直接说要我观察或操作哪个应用。";
  }

  return "我是 skfiy 的后台助手。聊天会在这里处理，只有明确的桌面控制意图才会进入 Computer Use。";
}

function isShortGreeting(userInput: string): boolean {
  const normalized = userInput
    .trim()
    .toLowerCase()
    .replace(/^[\s,，。.!！?？、]+|[\s,，。.!！?？、]+$/g, "")
    .replace(/\s+/g, " ");

  return /^(hello|hi|hey|yo|你好|哈喽|哈啰|嗨)(\s+(skfiy|assistant|bot))?$/.test(normalized);
}
