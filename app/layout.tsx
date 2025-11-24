// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clinical Skills Delphi",
  description: "MVP khảo sát kỹ năng lâm sàng",
  icons: {
    icon: [
      {
        url: "/favicon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
        className="bg-gray-50"
      >
        {/* BỎ maxWidth 980, để từng page tự quyết định layout */}
        {children}
      </body>
    </html>
  );
}
