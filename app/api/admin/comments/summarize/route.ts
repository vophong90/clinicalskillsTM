// app/api/admin/comments/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Thiếu OPENAI_API_KEY trong biến môi trường.' },
      { status: 500 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Body phải là JSON' },
      { status: 400 }
    );
  }

  const project_title = body.project_title || '';
  const round_label = body.round_label || '';
  const comments: string[] = Array.isArray(body.comments)
    ? body.comments.map((c) => String(c))
    : [];
  const base_prompt: string =
    typeof body.base_prompt === 'string' ? body.base_prompt : '';
  const custom_prompt: string =
    typeof body.custom_prompt === 'string' ? body.custom_prompt : '';

  if (!comments.length) {
    return NextResponse.json(
      { error: 'Không có ý kiến nào để tổng hợp.' },
      { status: 400 }
    );
  }

  // Prompt mặc định của bạn – tập trung vào quyết định giữ/bỏ/bổ sung vấn đề thiết yếu
  const defaultInstruction =
    'Đây là khảo sát nhằm xây dựng các vấn đề lâm sàng thiết yếu cho bác sĩ YHCT khi tốt nghiệp phải làm được. ' +
    'Hãy chỉ tập trung tóm tắt những ý kiến có ảnh hưởng đến quyết định: ' +
    '(1) Giữ lại một vấn đề lâm sàng thiết yếu; (2) Bỏ bớt hoặc gộp vấn đề; ' +
    '(3) Bổ sung thêm vấn đề lâm sàng thiết yếu mới liên quan đến hành nghề của bác sĩ YHCT. ' +
    'Bỏ qua những bình luận mang tính xã giao hoặc không liên quan đến 3 quyết định trên. ' +
    'Kết quả trả về dạng gạch đầu dòng, rõ ràng, súc tích, bằng tiếng Việt.';

  const instruction =
    [defaultInstruction, base_prompt, custom_prompt]
      .map((x) => x?.trim())
      .filter(Boolean)
      .join('\n\n');

  const commentsText =
    comments
      .map((c, idx) => `${idx + 1}. ${c}`)
      .join('\n') || '(Không có ý kiến)';

  const messages = [
    {
      role: 'system',
      content:
        'Bạn là trợ lý chuyên nghiệp hỗ trợ nhóm xây dựng chuẩn đầu ra và năng lực thiết yếu cho bác sĩ Y học cổ truyền. ' +
        'Bạn có nhiệm vụ tổng hợp ý kiến chuyên gia để hỗ trợ quyết định giữ, bỏ, hoặc bổ sung các vấn đề lâm sàng thiết yếu.',
    },
    {
      role: 'user',
      content:
        `Project: ${project_title || '(không rõ)'}\n` +
        `Vòng: ${round_label || '(không rõ)'}\n\n` +
        `Dưới đây là danh sách các ý kiến góp ý (mỗi dòng là 1 ý):\n` +
        `${commentsText}\n\n` +
        `Yêu cầu tóm tắt:\n${instruction}`,
    },
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // bạn có thể đổi sang model khác nếu muốn
        messages,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('OpenAI API error:', text);
      return NextResponse.json(
        { error: 'OpenAI API error', detail: text },
        { status: 500 }
      );
    }

    const data = await res.json();
    const summary =
      data.choices?.[0]?.message?.content?.trim() ||
      'Không nhận được nội dung tóm tắt từ GPT.';

    return NextResponse.json({ summary });
  } catch (e: any) {
    console.error('Error in /api/admin/comments/summarize:', e);
    return NextResponse.json(
      { error: e.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
