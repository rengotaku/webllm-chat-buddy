import { describe, it, expect } from 'vitest';
import { addMessage, appendToken } from './chatReducer';
import type { Message } from './chatReducer';

describe('chatReducer', () => {
  describe('Case 2-1: ユーザーメッセージ追加', () => {
    it('adds a user message to an empty state and preserves role and content', () => {
      const initialState: Message[] = [];
      const newMessage: Message = { id: 'u1', role: 'user', content: 'こんにちは' };

      const newState = addMessage(initialState, newMessage);

      expect(newState).toHaveLength(1);
      expect(newState[0]).toEqual({ id: 'u1', role: 'user', content: 'こんにちは' });
      expect(newState).not.toBe(initialState);
    });
  });

  describe('Case 2-2: ストリーミング中のアシスタントメッセージへのトークン追記', () => {
    it('appends token to target assistant message and keeps other messages unchanged immutably', () => {
      const userMsg: Message = { id: 'u1', role: 'user', content: 'こんにちは' };
      const assistantMsg: Message = { id: 'a1', role: 'assistant', content: 'こん' };
      const initialState: Message[] = [userMsg, assistantMsg];

      const newState = appendToken(initialState, 'a1', 'にちは');

      expect(newState).toHaveLength(2);
      expect(newState[0]).toBe(userMsg); // Unchanged message reference preserved
      expect(newState[1]).not.toBe(assistantMsg); // Immutable update for target message
      expect(newState[1]).toEqual({ id: 'a1', role: 'assistant', content: 'こんにちは' });
    });
  });

  describe('Case 2-3: 存在しないIDへの追記は no-op', () => {
    it('does not modify state when appending token to non-existent message ID', () => {
      const assistantMsg: Message = { id: 'a1', role: 'assistant', content: 'hello' };
      const initialState: Message[] = [assistantMsg];

      const newState = appendToken(initialState, 'a2', 'text');

      expect(newState).toEqual(initialState);
      expect(newState[0]).toEqual({ id: 'a1', role: 'assistant', content: 'hello' });
    });
  });
});
