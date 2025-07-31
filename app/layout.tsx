export const metadata = {
  title: 'Clinical Skills Delphi',
  description: 'MVP khảo sát kỹ năng lâm sàng',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}>
          {children}
        </div>
      </body>
    </html>
  );
}