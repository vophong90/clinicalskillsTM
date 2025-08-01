'use client';
import AdminUserManager from './AdminUserManager';
import AdminProjectManager from './AdminProjectManager';
import AdminRoundManager from './AdminRoundManager';
import AdminItemManager from './AdminItemManager';
import { useState } from 'react';

export default function AdminPage() {
  const [tab, setTab] = useState<'users'|'projects'|'rounds'|'items'>('users');
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-100 border-r px-4 py-8">
        <nav>
          <ul className="space-y-3">
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'users' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('users')}
              >👤 Người dùng</button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'projects' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('projects')}
              >📁 Project</button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'rounds' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('rounds')}
              >🔄 Round</button>
            </li>
            <li>
              <button
                className={`block w-full text-left px-3 py-2 rounded ${tab === 'items' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-100'}`}
                onClick={() => setTab('items')}
              >📝 Item</button>
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
      </main>
    </div>
  );
}
