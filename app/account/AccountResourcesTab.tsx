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
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Tài nguyên đã mở khoá
        </h2>
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
                className="border rounded-lg px-3 py-2 flex items-center justify-between gap-3 bg-gray-50"
              >
                <div>
                  <p className="font-semibold text-gray-900">{r.title}</p>
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

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Lịch sử điểm thưởng (gần đây)
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có lịch sử điểm.</p>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm bg-white">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">
                    Thời gian
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">
                    Điểm
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">
                    Lý do
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2">
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
                    <td className="px-3 py-2">{log.reason}</td>
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
