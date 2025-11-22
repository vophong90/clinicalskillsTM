export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const BUCKET_NAME = 'reward_resources';

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx']);

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot).toLowerCase();
}

/**
 * GET /api/rewards/resources
 * Trả danh sách toàn bộ tài nguyên đang active.
 * Có thể dùng cho cả UI user và UI admin.
 */
export async function GET(_req: NextRequest) {
  const s = getAdminClient();

  const { data, error } = await s
    .from('reward_resources')
    .select('id, title, description, file_url, required_points, is_active, created_at')
    .eq('is_active', true)
    .order('required_points', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('GET /rewards/resources error', error);
    return NextResponse.json({ error: 'Không lấy được danh sách tài nguyên.' }, { status: 500 });
  }

  return NextResponse.json({ resources: data ?? [] });
}

/**
 * POST /api/rewards/resources
 * Dùng cho ADMIN:
 *  - Upload file vào bucket reward_resources
 *  - Tạo record trong bảng reward_resources
 *
 * Expect: multipart/form-data
 *  - file: File (bắt buộc)
 *  - title: string (bắt buộc)
 *  - description: string (optional)
 *  - required_points: number (bắt buộc)
 *  - created_by: uuid profile_id của admin (bắt buộc – tạm thời truyền từ client)
 *  - project_id: uuid (optional – để dành cho tương lai)
 *  - round_id: uuid (optional – để dành cho tương lai)
 */
export async function POST(req: NextRequest) {
  const s = getAdminClient();

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: 'Yêu cầu phải là multipart/form-data.' },
      { status: 400 }
    );
  }

  const file = form.get('file') as File | null;
  const title = (form.get('title') as string | null)?.trim();
  const description = (form.get('description') as string | null)?.trim() || null;
  const requiredPointsStr = (form.get('required_points') as string | null)?.trim();
  const createdBy = (form.get('created_by') as string | null)?.trim() || null;
  const projectId = (form.get('project_id') as string | null)?.trim() || null;
  const roundId = (form.get('round_id') as string | null)?.trim() || null;

  if (!file) {
    return NextResponse.json({ error: 'Thiếu file upload.' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'Thiếu tiêu đề (title).' }, { status: 400 });
  }
  if (!requiredPointsStr || Number.isNaN(Number(requiredPointsStr))) {
    return NextResponse.json(
      { error: 'required_points phải là số nguyên.' },
      { status: 400 }
    );
  }
  if (!createdBy) {
    return NextResponse.json(
      { error: 'Thiếu created_by (profile_id của admin tạo tài nguyên).' },
      { status: 400 }
    );
  }

  const requiredPoints = parseInt(requiredPointsStr, 10);
  if (requiredPoints < 0) {
    return NextResponse.json(
      { error: 'required_points phải ≥ 0.' },
      { status: 400 }
    );
  }

  // Kiểm tra kích thước file
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File quá lớn (>100MB). Vui lòng chọn file nhỏ hơn.' },
      { status: 400 }
    );
  }

  // Kiểm tra định dạng
  const ext = getFileExt(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: `Định dạng file không được hỗ trợ (${ext}). Chỉ cho phép: pdf, doc, docx, ppt, pptx.` },
      { status: 400 }
    );
  }

  // Tạo path lưu trong bucket
  const unique = randomUUID();
  const timestamp = Date.now();
  // Đặt theo convention: <created_by>/<timestamp>_<uuid><ext>
  const filePath = `${createdBy}/${timestamp}_${unique}${ext}`;

  try {
    // Chuyển File -> Buffer để upload từ Node
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload lên Supabase Storage
    const { error: uploadError } = await s.storage
      .from(BUCKET_NAME)
      .upload(filePath, buffer, {
        contentType: file.type || undefined,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload to Storage error', uploadError);
      return NextResponse.json(
        { error: 'Upload file lên Storage thất bại.' },
        { status: 500 }
      );
    }

    // Lấy public URL
    const {
      data: { publicUrl },
    } = s.storage.from(BUCKET_NAME).getPublicUrl(filePath);

    // Insert bản ghi vào bảng reward_resources
    const { data, error: insertError } = await s
      .from('reward_resources')
      .insert({
        title,
        description,
        file_url: publicUrl,
        required_points: requiredPoints,
        is_active: true,
        created_by: createdBy,
        project_id: projectId || null,
        round_id: roundId || null,
      })
      .select('id, title, description, file_url, required_points, is_active, created_at')
      .single();

    if (insertError) {
      console.error('Insert reward_resources error', insertError);
      // Nếu insert thất bại, nên xoá file vừa upload để đỡ rác
      await s.storage.from(BUCKET_NAME).remove([filePath]).catch(() => {});
      return NextResponse.json(
        { error: 'Lưu thông tin tài nguyên vào database thất bại.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ resource: data }, { status: 201 });
  } catch (e) {
    console.error('POST /rewards/resources unexpected error', e);
    return NextResponse.json(
      { error: 'Lỗi không xác định khi xử lý file.' },
      { status: 500 }
    );
  }
}
