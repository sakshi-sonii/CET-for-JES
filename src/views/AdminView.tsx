import React, { useState } from 'react'
import { Award, LogOut } from 'lucide-react'
import type { User, Test, Course, Attempt } from '../types'
import { api } from '../api'

interface AdminViewProps {
  user: User
  users: User[]
  tests: Test[]
  courses: Course[]
  attempts: Attempt[]
  onLogout: () => void
  onUsersUpdate: (users: User[]) => void
  onTestsUpdate: (tests: Test[]) => void
  onCoursesUpdate: (courses: Course[]) => void
}

const AdminView: React.FC<AdminViewProps> = ({
  user,
  users,
  tests,
  courses,
  attempts,
  onLogout,
  onUsersUpdate,
  onTestsUpdate,
  onCoursesUpdate,
}) => {
  const [activeTab, setActiveTab] = useState('users')
  const [courseForm, setCourseForm] = useState({ name: '', description: '' })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'student' as 'student' | 'teacher' | 'admin',
    course: '',
    approved: false,
  })

  const pendingUsers = users.filter((u) => !u.approved && u.role === 'teacher')
  const pendingTests = tests.filter((t) => !t.approved)

  const approveTeacher = async (id: string) => {
    setActionLoading(id)
    try {
      await api(`users/${id}/approve`, 'PATCH')
      const usersData = await api('users')
      onUsersUpdate(usersData)
    } catch (error: any) {
      alert(error.message || 'Failed to approve teacher')
    }
    setActionLoading(null)
  }

  const rejectTeacher = async (id: string) => {
    setActionLoading(id)
    try {
      await api(`users/${id}`, 'DELETE')
      const usersData = await api('users')
      onUsersUpdate(usersData)
    } catch (error: any) {
      alert(error.message || 'Failed to reject teacher')
    }
    setActionLoading(null)
  }

  const approveTest = async (id: string) => {
    setActionLoading(id)
    try {
      await api(`tests/${id}/approve`, 'PATCH')
      const testsData = await api('tests')
      onTestsUpdate(testsData)
    } catch (error: any) {
      alert(error.message || 'Failed to approve test')
    }
    setActionLoading(null)
  }

  const rejectTest = async (id: string) => {
    setActionLoading(id)
    try {
      await api(`tests/${id}`, 'DELETE')
      const testsData = await api('tests')
      onTestsUpdate(testsData)
    } catch (error: any) {
      alert(error.message || 'Failed to reject test')
    }
    setActionLoading(null)
  }

  const addCourse = async (name: string, description: string) => {
    try {
      await api('courses', 'POST', { name, description })
      const coursesData = await api('courses')
      onCoursesUpdate(coursesData)
    } catch (error: any) {
      alert(error.message || 'Failed to add course')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Award className="w-8 h-8 text-indigo-600" />
            <span className="text-xl font-bold">Admin Panel</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Welcome, {user?.name}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-4 mb-6 overflow-x-auto">
          {['users', 'tests', 'courses', 'analytics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">
                Pending Approvals ({pendingUsers.length})
              </h2>

              {pendingUsers.length === 0 ? (
                <p className="text-gray-500">No pending approvals</p>
              ) : (
                <div className="space-y-3">
                  {pendingUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex justify-between items-center p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-gray-600">
                          {u.email} – {u.role}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={actionLoading === u.id}
                          onClick={() => approveTeacher(u.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
                        >
                          {actionLoading === u.id ? '...' : 'Approve'}
                        </button>
                        <button
                          disabled={actionLoading === u.id}
                          onClick={() => rejectTeacher(u.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
                <span>All Users ({users.length})</span>
              </h2>

              <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="font-medium mb-2">Add User</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="email" placeholder="Email" value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} className="px-3 py-2 border rounded" />
                  <input type="text" placeholder="Full name" value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} className="px-3 py-2 border rounded" />
                  <input type="password" placeholder="Password" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} className="px-3 py-2 border rounded" />
                  <select value={newUserForm.role} onChange={e => setNewUserForm({...newUserForm, role: e.target.value as any})} className="px-3 py-2 border rounded">
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select value={newUserForm.course} onChange={e => setNewUserForm({...newUserForm, course: e.target.value})} className="px-3 py-2 border rounded">
                    <option value="">Course (optional)</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={newUserForm.approved} onChange={e => setNewUserForm({...newUserForm, approved: e.target.checked})} />
                    <span className="text-sm">Approved</span>
                  </label>
                </div>
                <div className="mt-3">
                  <button onClick={async () => {
                    try {
                      const payload: any = { email: newUserForm.email, password: newUserForm.password, name: newUserForm.name, role: newUserForm.role };
                      if (newUserForm.course) payload.course = newUserForm.course;
                      payload.approved = newUserForm.approved;
                      setActionLoading('create-user');
                      await api('users', 'POST', payload);
                      const usersData = await api('users');
                      onUsersUpdate(usersData);
                      setNewUserForm({ email: '', password: '', name: '', role: 'student', course: '', approved: false });
                      alert('User created');
                    } catch (error: any) {
                      alert(error.message || 'Failed to create user');
                    } finally { setActionLoading(null); }
                  }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">{actionLoading === 'create-user' ? '...' : 'Create User'}</button>
                </div>
              </div>

              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex justify-between items-center p-3 border rounded"
                  >
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-sm text-gray-600">
                        {u.email} – {u.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded text-sm ${
                          u.approved
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {u.approved ? 'Active' : 'Pending'}
                      </span>
                      {!u.approved && u.role !== 'admin' && (
                        <button disabled={actionLoading === u.id} onClick={() => approveTeacher(u.id)} className="px-3 py-1 bg-green-600 text-white rounded">Approve</button>
                      )}
                      <button disabled={actionLoading === u.id} onClick={async () => {
                        if (!confirm('Delete user?')) return;
                        setActionLoading(u.id);
                        try {
                          await api(`users/${u.id}`, 'DELETE');
                          const usersData = await api('users');
                          onUsersUpdate(usersData);
                        } catch (error: any) {
                          alert(error.message || 'Failed to delete user');
                        }
                        setActionLoading(null);
                      }} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tests' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">
              Pending Test Approvals ({pendingTests.length})
            </h2>

            {pendingTests.length === 0 ? (
              <p className="text-gray-500">No pending tests</p>
            ) : (
              <div className="space-y-3">
                {pendingTests.map((t) => {
                  const teacher = users.find((u) => u.id === t.teacherId)

                  return (
                    <div key={t.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-lg">{t.title}</p>
                          <p className="text-sm text-gray-600">
                            By: {teacher?.name || 'Unknown'} | Subject: {t.subject} | Duration:{" "}
                            {t.duration} min
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {t.questions.length} questions
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={actionLoading === t.id}
                            onClick={() => approveTest(t.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
                          >
                            {actionLoading === t.id ? '...' : 'Approve'}
                          </button>
                          <button
                            disabled={actionLoading === t.id}
                            onClick={() => rejectTest(t.id)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'courses' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Manage Courses</h2>

            <div className="mb-6 space-y-3">
              <input
                type="text"
                placeholder="Course Name"
                value={courseForm.name}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, name: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />

              <textarea
                placeholder="Description"
                value={courseForm.description}
                onChange={(e) =>
                  setCourseForm({
                    ...courseForm,
                    description: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
                rows={3}
              />

              <button
                onClick={() => {
                  if (courseForm.name) {
                    addCourse(courseForm.name, courseForm.description)
                    setCourseForm({ name: '', description: '' })
                  }
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Add Course
              </button>
            </div>

            <div className="space-y-2">
              {courses.map((c) => (
                <div key={c.id} className="p-4 border rounded-lg">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-sm text-gray-600">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="w-12 h-12 text-indigo-600 mb-3 text-2xl">👥</div>
              <p className="text-3xl font-bold">{users.length}</p>
              <p className="text-gray-600">Total Users</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="w-12 h-12 text-green-600 mb-3 text-2xl">📝</div>
              <p className="text-3xl font-bold">{tests.length}</p>
              <p className="text-gray-600">Total Tests</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="w-12 h-12 text-blue-600 mb-3 text-2xl">📚</div>
              <p className="text-3xl font-bold">{attempts.length}</p>
              <p className="text-gray-600">Test Attempts</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminView