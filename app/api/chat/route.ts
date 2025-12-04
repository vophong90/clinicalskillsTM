// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn(
    'OPENAI_API_KEY chưa được cấu hình. API /api/chat sẽ trả lỗi.'
  );
}

const openai = new OpenAI({ apiKey: apiKey || '' });

type ClientMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ClientAttachment =
  | {
      kind: 'text';
      name: string;
      mimeType: string;
      textContent: string;
    }
  | {
      kind: 'image';
      name: string;
      mimeType: string;
      dataUrl: string; // data:image/...;base64,...
    };

type ChatBody = {
  model: 'gpt-4.1' | 'gpt-5.1';
  messages: ClientMessage[];
  attachments?: ClientAttachment[];
};

export async function POST(req: NextRequest) {
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY chưa được cấu hình.' },
      { status: 500 }
    );
  }

  // Lấy user hiện tại để map vào profile_id (bảng profiles.id = auth.users.id)
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Bạn cần đăng nhập trước khi dùng GPT.' },
      { status: 401 }
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json(
      { error: 'Payload không hợp lệ.' },
      { status: 400 }
    );
  }

  const { model, messages, attachments = [] } = body;

  if (!model || !['gpt-4.1', 'gpt-5.1'].includes(model)) {
    return NextResponse.json(
      { error: 'Model không được phép.' },
      { status: 400 }
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'Cần ít nhất một message.' },
      { status: 400 }
    );
  }

  try {
    // System prompt chung
    const systemMessage = {
      role: 'system' as const,
      content:
        'Bạn là trợ lý AI nội bộ hỗ trợ chuyên gia trong các khảo sát Delphi và công việc nghiên cứu y khoa. Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt trừ khi được yêu cầu khác. Nếu có file được đính kèm, hãy đọc kỹ nội dung file trước khi trả lời.',
    };

    // Chuyển messages text thuần từ client
    const baseMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let finalMessages: any[] = [systemMessage];

    if (attachments.length === 0) {
      // Không có file → giữ nguyên logic cũ
      finalMessages = [...finalMessages, ...baseMessages];
    } else {
      const msgs = [...baseMessages];

      // Tìm message user cuối cùng
      let lastUserIndex = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          lastUserIndex = i;
          break;
        }
      }

      if (lastUserIndex === -1) {
        // Không tìm thấy user message → thêm 1 message user riêng chứa file
        finalMessages = [...finalMessages, ...msgs];
        const contentParts: any[] = [];

        contentParts.push({
          type: 'text',
          text: 'Dưới đây là các file tôi gửi, hãy đọc và hỗ trợ phân tích.',
        });

        for (const att of attachments) {
          if (att.kind === 'text') {
            const truncated =
              att.textContent.length > 8000
                ? att.textContent.slice(0, 8000) +
                  '\n\n[Đã cắt bớt nội dung file do quá dài...]'
                : att.textContent;

            contentParts.push({
              type: 'text',
              text:
                `\n\n===== Nội dung file: ${att.name} (${att.mimeType}) =====\n` +
                truncated,
            });
          } else if (att.kind === 'image') {
            contentParts.push({
              type: 'input_image',
              image_url: {
                url: att.dataUrl,
              },
            });
          }
        }

        finalMessages.push({
          role: 'user',
          content: contentParts,
        });
      } else {
        // Gắn file vào message user cuối cùng
        const lastUser = msgs[lastUserIndex];
        const otherMessages = msgs.filter((_, idx) => idx !== lastUserIndex);

        const contentParts: any[] = [];

        if (lastUser.content && lastUser.content.trim()) {
          contentParts.push({
            type: 'text',
            text: lastUser.content,
          });
        } else {
          contentParts.push({
            type: 'text',
            text: 'Tôi gửi kèm một số file, hãy đọc và hỗ trợ phân tích.',
          });
        }

        for (const att of attachments) {
          if (att.kind === 'text') {
            const truncated =
              att.textContent.length > 8000
                ? att.textContent.slice(0, 8000) +
                  '\n\n[Đã cắt bớt nội dung file do quá dài...]'
                : att.textContent;

            contentParts.push({
              type: 'text',
              text:
                `\n\n===== Nội dung file: ${att.name} (${att.mimeType}) =====\n` +
                truncated,
            });
          } else if (att.kind === 'image') {
            contentParts.push({
              type: 'input_image',
              image_url: {
                url: att.dataUrl,
              },
            });
          }
        }

        finalMessages = [...finalMessages, ...otherMessages];
        finalMessages.push({
          role: 'user',
          content: contentParts,
        });
      }
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: finalMessages,
      temperature: 0.2,
    });

    const reply =
      completion.choices[0]?.message?.content ?? '(Không có nội dung trả về)';

    // ===== GHI LOG GPT USAGE VÀO gpt_usage_logs =====
    const usage = completion.usage;
    const prompt_tokens = usage?.prompt_tokens ?? null;
    const completion_tokens = usage?.completion_tokens ?? null;
    const total_tokens = usage?.total_tokens ?? null;

    // Ước lượng số ký tự request/response
    const request_chars = JSON.stringify({ model, messages, attachments }).length;
    const response_chars = reply.length;

    const admin = getAdminClient();
    void admin
      .from('gpt_usage_logs')
      .insert({
        profile_id: user.id, // profiles.id = auth.users.id
        model,
        provider: 'openai',
        endpoint: '/api/chat',
        prompt_tokens,
        completion_tokens,
        total_tokens,
        request_chars,
        response_chars,
        context: {
          attachmentsCount: attachments.length,
          hasImages: attachments.some((a) => a.kind === 'image'),
        },
      })
      .then(({ error }) => {
        if (error) {
          console.error('Ghi log GPT (/api/chat) thất bại:', error);
        }
      });
    // ===== HẾT PHẦN LOGGING =====

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('OpenAI error:', err?.message || err);
    return NextResponse.json(
      { error: 'Lỗi khi gọi OpenAI.' },
      { status: 500 }
    );
  }
}
