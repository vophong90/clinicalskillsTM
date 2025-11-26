import { useState, KeyboardEvent } from 'react';

type ProfileRole =
  | 'admin'
  | 'core_expert'
  | 'viewer'
  | 'secretary'
  | 'external_expert'
  | string;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type GptModel = 'gpt-4.1' | 'gpt-5.1';

type Props = {
  role: ProfileRole | null;
};

export default function AccountGptTab({ role }: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState<GptModel>('gpt-4.1');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const canUseAdvancedModel =
    role === 'admin' ||
    role === 'viewer' ||
    role === 'core_expert' ||
    role === 'secretary';

  async function handleSendChat() {
    if (!chatInput.trim()) return;
    setChatError(null);

    const newUserMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
    };

    const newMessages = [...chatMessages, newUserMessage];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chatModel,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Chat API error:', text);
        setChatError('Không gọi được GPT. Vui lòng thử lại sau.');
        return;
      }

      const data = await res.json();
      const replyText: string = data.reply ?? data.content ?? '';

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: replyText || '(Không có nội dung trả về)',
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setChatError('Đã xảy ra lỗi khi gọi GPT.');
    } finally {
      setChatLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!chatLoading && chatInput.trim()) {
        void handleSendChat();
      }
    }
  }

  return (
    <section className="bg-white border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold mb-1">Trợ lý GPT nội bộ</h2>
          <p className="text-xs text-gray-500 max-w-xl">
            Dùng GPT để hỗ trợ trả lời câu hỏi, soạn nội dung và phân tích
            thông tin liên quan đến khảo sát Delphi và công việc chuyên môn.
            Vui lòng không nhập thông tin định danh bệnh nhân hoặc dữ liệu cực
            kỳ nhạy cảm.
          </p>
        </div>
        <div className="text-right space-y-1">
          <label className="block text-xs font-medium text-gray-600">
            Mô hình
          </label>
          <select
            className="border rounded-md px-2 py-1 text-xs"
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value as GptModel)}
          >
            <option value="gpt-4.1">GPT&nbsp;4.1 (mặc định)</option>
            <option value="gpt-5.1" disabled={!canUseAdvancedModel}>
              GPT&nbsp;5.1 (nâng cao)
            </option>
          </select>
          {!canUseAdvancedModel && (
            <p className="text-[10px] text-gray-400">
              GPT 5.1 chỉ dành cho Admin, Thư ký, Chuyên gia nội bộ, Quan sát
              viên.
            </p>
          )}
        </div>
      </div>

      <div className="border rounded-lg h-80 flex flex-col overflow-hidden bg-gray-50">
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500 gap-2">
              <p>Bắt đầu cuộc trao đổi với GPT nội bộ.</p>
              <ul className="list-disc list-inside text-left">
                <li>Hỏi về cách diễn giải kết quả Delphi.</li>
                <li>Nhờ gợi ý chỉnh sửa mô tả item / câu hỏi.</li>
                <li>Hỏi thêm về cách trình bày báo cáo.</li>
              </ul>
            </div>
          ) : (
            chatMessages.map((m) => (
              <div
                key={m.id}
                className={
                  'max-w-[90%] rounded-md px-3 py-2 ' +
                  (m.role === 'user'
                    ? 'ml-auto bg-blue-600 text-white'
                    : 'mr-auto bg-white border')
                }
              >
                <div className="text-[11px] font-semibold mb-0.5 opacity-70">
                  {m.role === 'user' ? 'Bạn' : 'GPT nội bộ'}
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))
          )}
        </div>

        <div className="border-t bg-white p-2 space-y-1">
          {chatError && (
            <p className="text-xs text-red-600" role="alert">
              {chatError}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 border rounded-md px-3 py-2 text-sm resize-none h-16"
              placeholder="Nhập câu hỏi hoặc yêu cầu của bạn…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim()}
              className={`px-4 py-2 text-sm rounded-md text-white ${
                chatLoading || !chatInput.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {chatLoading ? 'Đang gửi…' : 'Gửi'}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            Enter để gửi, Shift + Enter để xuống dòng.
          </p>
        </div>
      </div>
    </section>
  );
}
