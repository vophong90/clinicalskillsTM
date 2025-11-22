'use client';

import { useState } from 'react';

import AdminUserManager from './AdminUserManager';
import AdminProjectManager from './AdminProjectManager';
import AdminRoundManager from './AdminRoundManager';
import AdminItemManager from './AdminItemManager';
import AdminSurveyInviteManager from './AdminSurveyInviteManager';
import AdminRewardResourceManager from './AdminRewardResourceManager';
import AdminPasswordManager from './AdminPasswordManager';

export default function AdminPage() {
  const [tab, setTab] = useState<
    'users' | 'projects' | 'rounds' | 'items' | 'invites' | 'rewards' | 'passwords'
  >('users');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-100 border-r px-4 py-8">
        <nav>
          <ul className="space-y-3">
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'users'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('users')}
              >
                👤 Người dùng
              </button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'projects'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('projects')}
              >
                📁 Project
              </button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'rounds'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('rounds')}
              >
                🔄 Round
              </button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'items'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('items')}
              >
                📝 Item
              </button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'invites'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('invites')}
              >
                ✉️ Mời khảo sát
              </button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'rewards'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('rewards')}
              >
                🎁 Tài nguyên thưởng
              </button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${
                  tab === 'passwords'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'hover:bg-blue-100'
                }`}
                onClick={() => setTab('passwords')}
              >
                🔒 Quản lý mật khẩu
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 bg-white">
        {tab === 'users' && <AdminUserManager />}
        {tab === 'projects' && <AdminProjectManager />}
        {tab === 'rounds' && <AdminRoundManager />}
        {tab === 'items' && <AdminItemManager />}
        {tab === 'invites' && <AdminSurveyInviteManager />}
        {tab === 'rewards' && <AdminRewardResourceManager />}
        {tab === 'passwords' && <AdminPasswordManager />}
      </main>
    </div>
  );
}
