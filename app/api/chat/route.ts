// app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

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

type ChatBody = {
  model: 'gpt-4.1' | 'gpt-5.1';
  messages: ClientMessage[];
};

export async function POST(req: NextRequest) {
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY chưa được cấu hình.' },
      { status: 500 }
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

  const { model, messages } = body;

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
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Bạn là trợ lý AI nội bộ hỗ trợ chuyên gia trong các khảo sát Delphi và công việc nghiên cứu y khoa. Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt trừ khi được yêu cầu khác.',
        },
        ...messages,
      ],
      temperature: 0.2,
    });

    const reply =
      completion.choices[0]?.message?.content ?? '(Không có nội dung trả về)';

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('OpenAI error:', err?.message || err);
    return NextResponse.json(
      { error: 'Lỗi khi gọi OpenAI.' },
      { status: 500 }
    );
  }
}
