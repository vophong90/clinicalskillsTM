type PointLog = {
  id: string;
  project_id: string | null;
  round_id: string | null;
  points: number;
  reason: string;
  created_at: string;
};

type Resource = {
  id: string;
  title: string;
  required_points: number;
  file_url: string;
};

type Props = {
  totalPoints: number;
  resources: Resource[];
  logs: PointLog[];
};

export default function AccountResourcesTab({
  totalPoints,
  resources,
  logs,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="text-lg font-semibold">Tài nguyên đã mở khoá</h2>
        {resources.length === 0 ? (
          <p className="text-sm text-gray-600">
            Bạn chưa đủ điểm để mở khoá bất kỳ tài nguyên nào. Hoàn thành thêm
            khảo sát để tích điểm nhé.
          </p>
        ) : (
          <ul className="space-y-2">
            {resources.map((r) => (
              <li
                key={r.id}
                className="border rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-xs text-gray-500">
                    Yêu cầu ≥ {r.required_points} điểm &nbsp;•&nbsp; Bạn đã đạt{' '}
                    {totalPoints} điểm
                  </p>
                </div>
                <a
                  href={r.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 underline"
                >
                  Tải / xem
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="text-lg font-semibold">Lịch sử điểm thưởng (gần đây)</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có lịch sử điểm.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-2 py-1">Thời gian</th>
                  <th className="text-left px-2 py-1">Điểm</th>
                  <th className="text-left px-2 py-1">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-2 py-1">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={
                          'font-semibold ' +
                          (log.points >= 0
                            ? 'text-green-700'
                            : 'text-red-700')
                        }
                      >
                        {log.points >= 0 ? `+${log.points}` : log.points}
                      </span>
                    </td>
                    <td className="px-2 py-1">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
