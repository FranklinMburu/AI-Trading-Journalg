import React, { useState, useEffect } from 'react';
import { collection, collectionGroup, query, onSnapshot, getDocs, updateDoc, doc, where, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Users, Shield, BarChart3, Activity, Search, UserPlus, UserMinus, Clock, TrendingUp } from 'lucide-react';
import { formatCurrency, formatPercent, cn } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastLogin?: string;
}

interface SystemStats {
  totalUsers: number;
  totalTrades: number;
  totalStrategies: number;
  activeUsers24h: number;
}

import { useAccount } from '../contexts/AccountContext';

export default function AdminDashboard() {
  const { isDemoMode } = useAccount();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    totalTrades: 0,
    totalStrategies: 0,
    activeUsers24h: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Fetch all users
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      setUsers(userList);
      
      // Calculate stats
      setStats(prev => ({
        ...prev,
        totalUsers: userList.length,
        activeUsers24h: userList.filter(u => {
          if (!u.lastLogin) return false;
          const lastLogin = new Date(u.lastLogin).getTime();
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
          return lastLogin > oneDayAgo;
        }).length
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Fetch total trades count via collectionGroup for admins
    const fetchCounts = async () => {
      try {
        const tradesQuery = query(collectionGroup(db, 'trades'), where('isDemo', '==', isDemoMode));
        const strategiesQuery = query(collectionGroup(db, 'strategies'), where('isDemo', '==', isDemoMode));
        
        const [tradesSnap, strategiesSnap] = await Promise.all([
          getDocs(tradesQuery),
          getDocs(strategiesQuery)
        ]);

        setStats(prev => ({
          ...prev,
          totalTrades: tradesSnap.size,
          totalStrategies: strategiesSnap.size
        }));
      } catch (error) {
        console.error('Error fetching system counts:', error);
      }
    };
    fetchCounts();

    return () => unsubscribeUsers();
  }, [isDemoMode]);

  const toggleAdmin = async (user: UserProfile) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Are you sure you want to change ${user.displayName}'s role to ${newRole}?`)) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        role: newRole
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Total Trades', value: stats.totalTrades, icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Total Strategies', value: stats.totalStrategies, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
          { label: 'Active (24h)', value: stats.activeUsers24h, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        ].map((stat, i) => (
          <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-400">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold">{stat.value}</p>
              </div>
              <div className={cn("rounded-xl p-3", stat.bg, stat.color)}>
                <stat.icon size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Management */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden backdrop-blur-sm">
        <div className="border-b border-zinc-800 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Shield className="text-emerald-500" size={20} />
              User Management
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 md:w-64"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4">Last Login</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="group hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={user.photoURL} className="h-10 w-10 rounded-full border border-zinc-700" alt="" />
                      <div>
                        <p className="font-medium text-zinc-100">{user.displayName}</p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      user.role === 'admin' 
                        ? "bg-purple-500/10 text-purple-500" 
                        : "bg-zinc-500/10 text-zinc-400"
                    )}>
                      {user.role === 'admin' && <Shield size={12} />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => toggleAdmin(user)}
                      className={cn(
                        "rounded-lg p-2 transition-all",
                        user.role === 'admin' 
                          ? "text-orange-500 hover:bg-orange-500/10" 
                          : "text-emerald-500 hover:bg-emerald-500/10"
                      )}
                      title={user.role === 'admin' ? "Demote to User" : "Promote to Admin"}
                    >
                      {user.role === 'admin' ? <UserMinus size={18} /> : <UserPlus size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
