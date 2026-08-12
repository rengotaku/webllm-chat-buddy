export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export function addMessage(messages: Message[], msg: Message): Message[] {
  return [...messages, msg];
}

export function appendToken(messages: Message[], id: string, token: string): Message[] {
  const targetIndex = messages.findIndex((m) => m.id === id);
  if (targetIndex === -1) {
    return messages;
  }

  return messages.map((m, index) => {
    if (index === targetIndex) {
      return {
        ...m,
        content: m.content + token,
      };
    }
    return m;
  });
}
