
# Clinical Skills Delphi — MVP (Next.js + Supabase)

## 1) Cấu hình môi trường
Tạo file `.env.local` (đã có sẵn trong gói này) với:
```
NEXT_PUBLIC_SUPABASE_URL=YOUR_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

## 2) Chạy local
```
npm install
npm run dev
```
Mở http://localhost:3000 → đăng nhập bằng email/password đã tạo trong Supabase.

## 3) Deploy Vercel
- Import project từ GitHub hoặc upload zip.
- Set Environment Variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Build command: `npm run build`
- Output: `.next` (default)

## 4) Quyền & RLS
Ứng dụng dùng Supabase RLS để bảo vệ dữ liệu. Client chỉ dùng `anon key`.
