import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getTextExtractor } from 'office-text-extractor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const extractor = getTextExtractor();

export async function POST(req: NextRequest) {
  if (!openai || !apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY chưa được cấu hình.' },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const instruction =
    (formData.get('instruction') as string | null)?.trim() ||
    'Hãy tóm tắt nội dung chính của các tài liệu đính kèm.';

  const fileEntries = formData.getAll('files');
  const files = fileEntries.filter((f): f is File => f instanceof File);

  if (!files.length) {
    return NextResponse.json(
      { error: 'Chưa có file nào được gửi lên.' },
      { status: 400 }
    );
  }

  // Giới hạn số file & kích thước để tránh quá tải
  const MAX_FILES = 5;
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB / file

  const limitedFiles = files.slice(0, MAX_FILES);

  const contents: string[] = [];

  for (const file of limitedFiles) {
    if (file.size > MAX_SIZE) {
      contents.push(
        `===== ${file.name} =====\n[File quá lớn (>10MB), hãy tải bản nhỏ hơn.]`
      );
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // office-text-extractor tự nhận diện: pdf/docx/pptx/xlsx...
      const text = await extractor.extractText({
        input: buffer,
        type: 'buffer',
      });

      const trimmed =
        text.length > 15000
          ? text.slice(0, 15000) +
            '\n\n[Đã cắt bớt nội dung vì quá dài...]'
          : text;

      contents.push(
        `===== Bắt đầu nội dung file: ${file.name} (${file.type || 'unknown'}) =====\n` +
          trimmed +
          '\n===== Kết thúc nội dung file: ' +
          file.name +
          ' ====='
      );
    } catch (err: any) {
      console.error('Parse lỗi cho file', file.name, err);
      contents.push(
        `===== ${file.name} =====\n[Không đọc được file này, lỗi parse trên server.]`
      );
    }
  }

  const joined = contents.join('\n\n');

  const messages = [
    {
      role: 'system' as const,
      content:
        'Bạn là trợ lý AI nội bộ, hỗ trợ đọc và tóm tắt tài liệu (PDF, Word, Excel, PowerPoint) cho hội đồng Delphi và nghiên cứu y khoa. Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt, có cấu trúc.',
    },
    {
      role: 'user' as const,
      content:
        `${instruction}\n\n` +
        'Dưới đây là nội dung văn bản trích từ các file người dùng gửi lên:\n\n' +
        joined,
    },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1', // hoặc cho phép client chọn model nếu muốn
      messages,
      temperature: 0.2,
    });

    const reply =
      completion.choices[0]?.message?.content ?? '(Không có nội dung trả về)';

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('OpenAI error (file route):', err?.message || err);
    return NextResponse.json(
      { error: 'Lỗi khi gọi OpenAI với tài liệu.' },
      { status: 500 }
    );
  }
}
