// app/account/AccountGptTab.tsx

import {
  useState,
  KeyboardEvent,
  ChangeEvent,
  useCallback,
  useMemo,
} from 'react';

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

type Attachment =
  | {
      id: string;
      kind: 'text';
      name: string;
      mimeType: string;
      textContent: string;
    }
  | {
      id: string;
      kind: 'image';
      name: string;
      mimeType: string;
      dataUrl: string; // data:image/...;base64,...
    };

type Props = {
  role: ProfileRole | null;
};

export default function AccountGptTab({ role }: Props) {
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState<GptModel>('gpt-4.1');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // File-attachment cho chat
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);

  // Khối phân tích tài liệu (PDF / Word / Excel / PPT)
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docQuestion, setDocQuestion] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const canUseAdvancedModel = useMemo(
    () =>
      role === 'admin' ||
      role === 'viewer' ||
      role === 'core_expert' ||
      role === 'secretary',
    [role]
  );

  // ---------- Upload file cho chat (text + image) ----------

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      setReadingFiles(true);
      setChatError(null);

      try {
        const newAttachments: Attachment[] = [];

        for (const file of fileArray) {
          // Giới hạn kích thước: 3MB / file
          const MAX_SIZE = 3 * 1024 * 1024;
          if (file.size > MAX_SIZE) {
            setChatError(
              `File "${file.name}" lớn hơn 3MB, vui lòng chọn file nhỏ hơn.`
            );
            continue;
          }

          if (file.type.startsWith('image/')) {
            // Ảnh → dataURL để GPT vision đọc được
            const dataUrl = await readFileAsDataURL(file);
            newAttachments.push({
              id: `att-${Date.now()}-${file.name}`,
              kind: 'image',
              name: file.name,
              mimeType: file.type || 'image/*',
              dataUrl,
            });
          } else {
            // Text đơn giản: txt, md, csv, json...
            const text = await readFileAsText(file);
            newAttachments.push({
              id: `att-${Date.now()}-${file.name}`,
              kind: 'text',
              name: file.name,
              mimeType: file.type || 'text/plain',
              textContent: text,
            });
          }
        }

        if (newAttachments.length) {
          setAttachments((prev) => [...prev, ...newAttachments]);
        }
      } catch (err) {
        console.error(err);
        setChatError('Đọc file thất bại, vui lòng thử lại.');
      } finally {
        setReadingFiles(false);
        // reset input để có thể chọn lại cùng file nếu cần
        e.target.value = '';
      }
    },
    []
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ---------- Gửi chat ----------

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() && attachments.length === 0) {
      setChatError('Vui lòng nhập nội dung hoặc đính kèm file.');
      return;
    }
    setChatError(null);

    const newUserMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: chatInput.trim() || '(Chỉ gửi file/ảnh, không có text)',
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
          attachments: attachments.map((a) =>
            a.kind === 'image'
              ? {
                  kind: a.kind,
                  name: a.name,
                  mimeType: a.mimeType,
                  dataUrl: a.dataUrl,
                }
              : {
                  kind: a.kind,
                  name: a.name,
                  mimeType: a.mimeType,
                  textContent: a.textContent,
                }
          ),
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
      // Sau khi GPT xử lý xong thì clear file, để lượt sau user chọn lại
      setAttachments([]);
    } catch (err) {
      console.error(err);
      setChatError('Đã xảy ra lỗi khi gọi GPT.');
    } finally {
      setChatLoading(false);
    }
  }, [attachments, chatInput, chatMessages, chatModel]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!chatLoading && (chatInput.trim() || attachments.length > 0)) {
        void handleSendChat();
      }
    }
  };

  // ---------- Phân tích tài liệu (PDF / Word / Excel / PPT) ----------

  const handleDocFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setDocFiles(Array.from(files));
    setDocError(null);
  };

  const handleAnalyzeDocs = async () => {
    if (!docFiles.length) {
      setDocError('Vui lòng chọn ít nhất một file.');
      return;
    }
    setDocLoading(true);
    setDocError(null);

    try {
      const formData = new FormData();
      formData.append(
        'instruction',
        docQuestion || 'Hãy tóm tắt nội dung chính của các tài liệu này.'
      );
      for (const f of docFiles) {
        formData.append('files', f);
      }

      const res = await fetch('/api/chat/file', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('file chat error:', text);
        setDocError('Không phân tích được tài liệu. Vui lòng thử lại.');
        return;
      }

      const data = await res.json();
      const replyText: string = data.reply ?? data.content ?? '';

      // Đẩy kết quả vào khung chat như 1 lần trao đổi
      const artificialUserMsg: ChatMessage = {
        id: `doc-u-${Date.now()}`,
        role: 'user',
        content:
          (docQuestion || 'Phân tích các tài liệu tôi vừa gửi.') +
          `\n\n[Đính kèm ${docFiles.length} file]`,
      };
      const artificialAssistantMsg: ChatMessage = {
        id: `doc-a-${Date.now()}`,
        role: 'assistant',
        content: replyText || '(Không có nội dung trả về)',
      };

      setChatMessages((prev) => [...prev, artificialUserMsg, artificialAssistantMsg]);
    } catch (err) {
      console.error(err);
      setDocError('Đã xảy ra lỗi khi phân tích tài liệu.');
    } finally {
      setDocLoading(false);
    }
  };

  // ---------- Render ----------

  return (
    <section className="space-y-4">
      {/* Header nhỏ cho tab GPT */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Trợ lý GPT nội bộ
          </h2>
          <p className="text-xs text-gray-500 max-w-xl">
            Hỗ trợ soạn thảo, tóm tắt ý kiến Delphi, đọc file dữ liệu đơn giản
            và phân tích tài liệu. Không nhập thông tin định danh bệnh nhân hoặc
            dữ liệu cực kỳ nhạy cảm.
          </p>
        </div>
        <div className="text-right space-y-1">
          <label className="block text-xs font-medium text-gray-600">
            Mô hình
          </label>
          <select
            className="border rounded-md px-2 py-1 text-xs bg-white"
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value as GptModel)}
          >
            <option value="gpt-4.1">GPT 4.1 (mặc định)</option>
            <option value="gpt-5.1" disabled={!canUseAdvancedModel}>
              GPT 5.1 (nâng cao)
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

      {/* Khung chat chính */}
      <div className="border rounded-lg bg-gray-50 flex flex-col h-[520px]">
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500 gap-2">
              <p>Bắt đầu cuộc trao đổi với trợ lý GPT nội bộ.</p>
              <ul className="list-disc list-inside text-left">
                <li>Hỏi cách diễn giải kết quả Delphi.</li>
                <li>Nhờ GPT đọc một file CSV / txt rồi tóm tắt.</li>
                <li>Gửi một hình ảnh (ví dụ bảng biểu, sơ đồ) để GPT mô tả.</li>
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

        <div className="border-t bg-white p-2 space-y-2">
          {chatError && (
            <p className="text-xs text-red-600" role="alert">
              {chatError}
            </p>
          )}

          {/* Vùng đính kèm file cho chat */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-gray-700">
                Đính kèm file / hình ảnh
              </label>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                disabled={readingFiles || chatLoading}
                className="text-xs"
                accept=".txt,.md,.csv,.json,image/*"
              />
            </div>
            {readingFiles && (
              <p className="text-[11px] text-gray-500">
                Đang đọc file, vui lòng chờ...
              </p>
            )}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 border px-2 py-0.5 text-[11px] text-gray-700"
                  >
                    {a.kind === 'image' ? '🖼️' : '📄'} {a.name}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="ml-1 text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ô nhập + nút gửi */}
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 border rounded-md px-3 py-2 text-sm resize-none h-16 bg-white"
              placeholder="Nhập câu hỏi hoặc yêu cầu của bạn…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={handleSendChat}
              disabled={
                chatLoading || (!chatInput.trim() && attachments.length === 0)
              }
              className={`px-4 py-2 text-sm rounded-md text-white ${
                chatLoading || (!chatInput.trim() && attachments.length === 0)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {chatLoading ? 'Đang gửi…' : 'Gửi'}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            Enter để gửi, Shift + Enter để xuống dòng. Bạn có thể chỉ gửi file
            mà không cần nhập text.
          </p>
        </div>
      </div>

      {/* Khối phân tích tài liệu PDF / Word / Excel / PPT */}
      <div className="border rounded-lg bg-white p-3 space-y-2 mt-2">
        <h3 className="text-sm font-semibold text-gray-800">
          Phân tích tài liệu (PDF / Word / Excel / PowerPoint)
        </h3>
        <p className="text-[11px] text-gray-500">
          Chọn file tài liệu, nhập yêu cầu (ví dụ: tóm tắt, rút ý chính, so sánh
          các phác đồ…) rồi bấm <strong>Phân tích tài liệu</strong>. Kết quả sẽ
          được đưa thẳng vào khung chat ở trên.
        </p>

        <div className="flex flex-col gap-2">
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.xlsx"
            onChange={handleDocFilesChange}
            disabled={docLoading}
            className="text-xs"
          />
          {docFiles.length > 0 && (
            <p className="text-[11px] text-gray-600">
              Đã chọn <strong>{docFiles.length}</strong> file.
            </p>
          )}
          <textarea
            className="border rounded-md px-2 py-1 text-xs resize-none h-16"
            placeholder="Nhập yêu cầu phân tích (ví dụ: Hãy tóm tắt, liệt kê tiêu chí, so sánh các phác đồ điều trị...)"
            value={docQuestion}
            onChange={(e) => setDocQuestion(e.target.value)}
          />
          {docError && (
            <p className="text-[11px] text-red-600" role="alert">
              {docError}
            </p>
          )}
          <button
            type="button"
            onClick={handleAnalyzeDocs}
            disabled={docLoading || !docFiles.length}
            className={`inline-flex items-center px-3 py-1.5 text-xs rounded-md text-white ${
              docLoading || !docFiles.length
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {docLoading ? 'Đang phân tích…' : 'Phân tích tài liệu'}
          </button>
        </div>
      </div>
    </section>
  );
}

// --------- Helpers đọc file trên client ----------

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}
