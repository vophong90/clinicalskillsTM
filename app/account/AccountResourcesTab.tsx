// app/account/AccountResourcesTab.tsx

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
    <div className="space-y-4">
      {/* Tài nguyên thưởng */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Tài nguyên đã mở khoá
        </h3>
        <p className="text-[11px] text-gray-500 mb-1">
          Khi hoàn thành khảo sát, bạn sẽ được cộng điểm thưởng và có thể tải
          các tài liệu chuyên môn tương ứng với mốc điểm.
        </p>

        {resources.length === 0 ? (
          <div className="border rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            Bạn chưa đủ điểm để mở khoá bất kỳ tài nguyên nào. Hoàn thành thêm
            các vòng khảo sát để tích điểm nhé.
          </div>
        ) : (
          <ul className="space-y-2">
            {resources.map((r) => (
              <li
                key={r.id}
                className="border rounded-lg bg-white p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {r.title}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Yêu cầu ≥ {r.required_points} điểm • Bạn hiện có{' '}
                    <strong>{totalPoints}</strong> điểm
                  </p>
                </div>
                <a
                  href={r.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  Tải / xem
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Lịch sử điểm thưởng */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Lịch sử điểm thưởng gần đây
        </h3>
        <p className="text-[11px] text-gray-500">
          Hệ thống ghi nhận tối đa 100 lần cộng / trừ điểm gần nhất cho tài
          khoản của bạn.
        </p>

        {logs.length === 0 ? (
          <div className="border rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            Chưa có lịch sử điểm.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 font-medium text-gray-700">
                    Thời gian
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">
                    Điểm
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">
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
                          (log.points >= 0 ? 'text-green-700' : 'text-red-700')
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
      </section>
    </div>
  );
}
