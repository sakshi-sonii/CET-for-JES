import React, { useState } from 'react'
import { Award, LogOut } from 'lucide-react'
import type { User, Test, Course, TestSubmission } from '../types'
import { api } from '../api'

interface AdminViewProps {
  user: User
  users: User[]
  tests: Test[]
  courses: Course[]
  attempts: TestSubmission[]
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
  const [expandedTest, setExpandedTest] = useState<string | null>(null)
  const [rankingsTestFilter, setRankingsTestFilter] = useState<string>('all')
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'student' as 'student' | 'teacher' | 'admin',
    course: '',
    approved: false,
  })

  const pendingUsers = users.filter((u) => u && !u.approved && u.role === 'teacher')
  const pendingTests = tests.filter((t) => t && !t.approved)

  // Filter out any null/broken submissions
  const validAttempts = (attempts || []).filter(a =>
    a && a._id && a.totalScore !== undefined && a.totalMaxScore !== undefined
  )

  const getTotalQuestions = (test: Test): number => {
    if (!test?.sections) return 0
    return test.sections.reduce((sum, s) => sum + (s?.questions?.length || 0), 0)
  }

  const getTotalMarks = (test: Test): number => {
    if (!test?.sections) return 0
    return test.sections.reduce((sum, s) => {
      if (!s) return sum
      const marks = s.marksPerQuestion || (s.subject === 'maths' ? 2 : 1)
      return sum + (s.questions?.length || 0) * marks
    }, 0)
  }

  // ========================
  // SAFE ACCESSOR HELPERS
  // ========================
  const safeGetId = (ref: any): string => {
    if (!ref) return ''
    if (typeof ref === 'string') return ref
    return ref._id?.toString?.() || ref.id?.toString?.() || String(ref)
  }

  const getStudentName = (submission: TestSubmission): string => {
    if (!submission) return 'Unknown'
    const student = submission.studentId as any
    if (!student) return 'Deleted User'
    if (typeof student === 'object' && student?.name) return student.name
    const found = users.find(u => u && u._id === String(student))
    return found?.name || 'Unknown'
  }

  const getStudentEmail = (submission: TestSubmission): string => {
    if (!submission) return ''
    const student = submission.studentId as any
    if (!student) return ''
    if (typeof student === 'object' && student?.email) return student.email
    const found = users.find(u => u && u._id === String(student))
    return found?.email || ''
  }

  const getTestTitle = (submission: TestSubmission): string => {
    if (!submission) return 'Unknown Test'
    const test = submission.testId as any
    if (!test) return 'Deleted Test'
    if (typeof test === 'object' && test?.title) return test.title
    const found = tests.find(t => t && t._id === String(test))
    return found?.title || 'Unknown Test'
  }

  const getTestId = (submission: TestSubmission): string => {
    if (!submission) return ''
    return safeGetId(submission.testId)
  }

  const getStudentId = (submission: TestSubmission): string => {
    if (!submission) return ''
    return safeGetId(submission.studentId)
  }

  // ========================
  // ACTIONS
  // ========================
  const approveTeacher = async (id: string) => {
    if (!id) return
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
    if (!id) return
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
    if (!id) return
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
    if (!id) return
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

  const getSectionBadgeColor = (subject: string) => {
    switch (subject) {
      case 'physics': return 'bg-blue-100 text-blue-800'
      case 'chemistry': return 'bg-green-100 text-green-800'
      case 'maths': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  const getScoreColor = (pct: number) => {
    if (pct >= 80) return 'text-green-600'
    if (pct >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  // ========================
  // RANKINGS COMPUTATION (with null safety)
  // ========================
  const filteredSubmissions = rankingsTestFilter === 'all'
    ? validAttempts
    : validAttempts.filter(a => getTestId(a) === rankingsTestFilter)

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    const pctA = a?.percentage || 0
    const pctB = b?.percentage || 0
    if (pctB !== pctA) return pctB - pctA
    const scoreA = a?.totalScore || 0
    const scoreB = b?.totalScore || 0
    if (scoreB !== scoreA) return scoreB - scoreA
    return new Date(a?.submittedAt || 0).getTime() - new Date(b?.submittedAt || 0).getTime()
  })

  const getOverallRankings = () => {
    const studentMap: Record<string, {
      name: string
      email: string
      totalScore: number
      totalMaxScore: number
      testsAttempted: number
    }> = {}

    validAttempts.forEach(a => {
      if (!a) return

      const studentId = getStudentId(a)
      if (!studentId) return

      if (!studentMap[studentId]) {
        studentMap[studentId] = {
          name: getStudentName(a),
          email: getStudentEmail(a),
          totalScore: 0,
          totalMaxScore: 0,
          testsAttempted: 0,
        }
      }

      studentMap[studentId].totalScore += (a.totalScore || 0)
      studentMap[studentId].totalMaxScore += (a.totalMaxScore || 0)
      studentMap[studentId].testsAttempted += 1
    })

    return Object.entries(studentMap)
      .map(([id, data]) => ({
        studentId: id,
        ...data,
        percentage: data.totalMaxScore > 0
          ? Math.round((data.totalScore / data.totalMaxScore) * 100)
          : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage || b.totalScore - a.totalScore)
  }

  const overallRankings = getOverallRankings()

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
          {['users', 'tests', 'courses', 'rankings', 'analytics'].map((tab) => (
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
              {tab === 'users' && pendingUsers.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingUsers.length}
                </span>
              )}
              {tab === 'tests' && pendingTests.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingTests.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ======================== USERS TAB ======================== */}
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
                    <div key={u._id} className="flex justify-between items-center p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-gray-600">{u.email} – {u.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <button disabled={actionLoading === u._id} onClick={() => approveTeacher(u._id)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                          {actionLoading === u._id ? '...' : 'Approve'}
                        </button>
                        <button disabled={actionLoading === u._id} onClick={() => rejectTeacher(u._id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">All Users ({users.length})</h2>

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
                    {courses.map(c => c && <option key={c._id} value={c._id}>{c.name}</option>)}
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
                  }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
                    {actionLoading === 'create-user' ? '...' : 'Create User'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {users.filter(u => u).map((u) => (
                  <div key={u._id} className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-sm text-gray-600">{u.email} – {u.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded text-sm ${u.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {u.approved ? 'Active' : 'Pending'}
                      </span>
                      {!u.approved && u.role !== 'admin' && (
                        <button disabled={actionLoading === u._id} onClick={() => approveTeacher(u._id)} className="px-3 py-1 bg-green-600 text-white rounded">Approve</button>
                      )}
                      <button disabled={actionLoading === u._id} onClick={async () => {
                        if (!confirm('Delete user?')) return;
                        setActionLoading(u._id);
                        try { await api(`users/${u._id}`, 'DELETE'); const usersData = await api('users'); onUsersUpdate(usersData); } catch (error: any) { alert(error.message || 'Failed'); }
                        setActionLoading(null);
                      }} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================== TESTS TAB ======================== */}
        {activeTab === 'tests' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Pending Test Approvals ({pendingTests.length})</h2>
              {pendingTests.length === 0 ? (
                <p className="text-gray-500">No pending tests</p>
              ) : (
                <div className="space-y-3">
                  {pendingTests.map((t) => {
                    if (!t) return null
                    const teacher = users.find((u) => u && u._id === t.teacherId)
                    const isExpanded = expandedTest === t._id
                    return (
                      <div key={t._id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="font-bold text-lg">{t.title}</p>
                            <p className="text-sm text-gray-600 mb-2">By: {teacher?.name || 'Unknown'} | Total: {t.totalDuration || 180} min</p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {t.sections?.map((section) => section && (
                                <span key={section.subject} className={`px-3 py-1 rounded-full text-xs font-medium ${getSectionBadgeColor(section.subject)}`}>
                                  {section.subject.charAt(0).toUpperCase() + section.subject.slice(1)}: {section.questions?.length || 0}Q × {section.marksPerQuestion || (section.subject === 'maths' ? 2 : 1)}m
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-gray-500">
                              ⏱ Phy+Chem: {t.sectionTimings?.physicsChemistry || 90} min | Maths: {t.sectionTimings?.maths || 90} min | 📊 {getTotalQuestions(t)}Q, {getTotalMarks(t)} marks
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button onClick={() => setExpandedTest(isExpanded ? null : t._id)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                              {isExpanded ? 'Hide' : 'Preview'}
                            </button>
                            <button disabled={actionLoading === t._id} onClick={() => approveTest(t._id)} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                              {actionLoading === t._id ? '...' : 'Approve'}
                            </button>
                            <button disabled={actionLoading === t._id} onClick={() => rejectTest(t._id)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                              Reject
                            </button>
                          </div>
                        </div>
                        {isExpanded && t.sections && (
                          <div className="mt-4 border-t pt-4">
                            {t.sections.map((section) => section && (
                              <div key={section.subject} className="mb-4">
                                <h4 className={`font-semibold text-sm uppercase tracking-wide mb-2 ${section.subject === 'physics' ? 'text-blue-700' : section.subject === 'chemistry' ? 'text-green-700' : 'text-purple-700'}`}>
                                  {section.subject} ({section.questions?.length || 0}Q)
                                </h4>
                                <div className="space-y-2 pl-4">
                                  {section.questions?.map((q, qIdx) => q && (
                                    <div key={qIdx} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                                      <p className="font-medium text-gray-800">Q{qIdx + 1}. {q.question}</p>
                                      <div className="flex flex-wrap gap-3 mt-1 text-gray-600">
                                        {q.options?.map((opt, optIdx) => (
                                          <span key={optIdx} className={optIdx === q.correct ? 'text-green-700 font-semibold' : ''}>
                                            {String.fromCharCode(65 + optIdx)}. {opt}{optIdx === q.correct && ' ✓'}
                                          </span>
                                        ))}
                                      </div>
                                      {q.explanation && <p className="text-xs text-blue-600 mt-1">💡 {q.explanation}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">All Tests ({tests.length})</h2>
              <div className="space-y-2">
                {tests.filter(t => t).map((t) => {
                  const teacher = users.find((u) => u && u._id === t.teacherId)
                  return (
                    <div key={t._id} className="flex justify-between items-center p-3 border rounded">
                      <div>
                        <p className="font-medium">{t.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {t.sections?.map((s) => s && (
                            <span key={s.subject} className={`text-xs px-2 py-0.5 rounded ${getSectionBadgeColor(s.subject)}`}>
                              {s.subject}: {s.questions?.length || 0}Q
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">By: {teacher?.name || 'Unknown'} | {getTotalMarks(t)} marks</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded text-xs font-medium ${t.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {t.approved ? 'Approved' : 'Pending'}
                        </span>
                        <span className={`px-3 py-1 rounded text-xs font-medium ${t.active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                          {t.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================== COURSES TAB ======================== */}
        {activeTab === 'courses' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Manage Courses</h2>
            <div className="mb-6 space-y-3">
              <input type="text" placeholder="Course Name" value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg" />
              <textarea placeholder="Description" value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} className="w-full px-4 py-2 border rounded-lg" rows={3} />
              <button onClick={() => { if (courseForm.name) { addCourse(courseForm.name, courseForm.description); setCourseForm({ name: '', description: '' }); } }} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Add Course
              </button>
            </div>
            <div className="space-y-2">
              {courses.filter(c => c).map((c) => (
                <div key={c._id} className="p-4 border rounded-lg flex justify-between items-center">
                  <div><p className="font-bold">{c.name}</p></div>
                  <span className="text-sm text-gray-500">{tests.filter((t) => t && t.course === c._id).length} tests</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================== RANKINGS TAB ======================== */}
        {activeTab === 'rankings' && (
          <div className="space-y-6">
            {/* Overall Rankings */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">🏆 Overall Student Rankings</h2>
              {overallRankings.length === 0 ? (
                <p className="text-gray-500">No test submissions yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200 text-left">
                        <th className="pb-3 pr-4 font-semibold text-gray-600">Rank</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600">Student</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600">Email</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Tests</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Score</th>
                        <th className="pb-3 font-semibold text-gray-600 text-center">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overallRankings.map((student, idx) => (
                        <tr key={student.studentId || idx} className={`border-b hover:bg-gray-50 ${idx < 3 ? 'bg-yellow-50' : ''}`}>
                          <td className="py-3 pr-4"><span className="text-lg font-bold">{getRankBadge(idx + 1)}</span></td>
                          <td className="py-3 pr-4 font-medium">{student.name}</td>
                          <td className="py-3 pr-4 text-gray-500">{student.email}</td>
                          <td className="py-3 pr-4 text-center">{student.testsAttempted}</td>
                          <td className="py-3 pr-4 text-center font-semibold">{student.totalScore}/{student.totalMaxScore}</td>
                          <td className={`py-3 text-center font-bold ${getScoreColor(student.percentage)}`}>{student.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Per-Test Rankings */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">📊 Test-wise Rankings</h2>
                <select value={rankingsTestFilter} onChange={(e) => setRankingsTestFilter(e.target.value)} className="px-4 py-2 border rounded-lg text-sm">
                  <option value="all">All Tests</option>
                  {tests.filter(t => t && t.approved).map(t => (
                    <option key={t._id} value={t._id}>{t.title}</option>
                  ))}
                </select>
              </div>

              {sortedSubmissions.length === 0 ? (
                <p className="text-gray-500">No submissions for selected filter</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200 text-left">
                        <th className="pb-3 pr-4 font-semibold text-gray-600">Rank</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600">Student</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600">Test</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Physics</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Chemistry</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Maths</th>
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Total</th>
                        <th className="pb-3 font-semibold text-gray-600 text-center">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSubmissions.map((sub, idx) => {
                        if (!sub) return null
                        const sectionResults = sub.sectionResults || []
                        const phySr = sectionResults.find(s => s?.subject === 'physics')
                        const chemSr = sectionResults.find(s => s?.subject === 'chemistry')
                        const mathSr = sectionResults.find(s => s?.subject === 'maths')

                        return (
                          <tr key={sub._id || idx} className={`border-b hover:bg-gray-50 ${idx < 3 ? 'bg-yellow-50' : ''}`}>
                            <td className="py-3 pr-4"><span className="text-lg font-bold">{getRankBadge(idx + 1)}</span></td>
                            <td className="py-3 pr-4">
                              <p className="font-medium">{getStudentName(sub)}</p>
                              <p className="text-xs text-gray-400">{getStudentEmail(sub)}</p>
                            </td>
                            <td className="py-3 pr-4 text-gray-600">{getTestTitle(sub)}</td>
                            <td className="py-3 pr-4 text-center">
                              {phySr ? (
                                <span className={getScoreColor(phySr.maxScore > 0 ? Math.round((phySr.score / phySr.maxScore) * 100) : 0)}>
                                  {phySr.score}/{phySr.maxScore}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-3 pr-4 text-center">
                              {chemSr ? (
                                <span className={getScoreColor(chemSr.maxScore > 0 ? Math.round((chemSr.score / chemSr.maxScore) * 100) : 0)}>
                                  {chemSr.score}/{chemSr.maxScore}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-3 pr-4 text-center">
                              {mathSr ? (
                                <span className={getScoreColor(mathSr.maxScore > 0 ? Math.round((mathSr.score / mathSr.maxScore) * 100) : 0)}>
                                  {mathSr.score}/{mathSr.maxScore}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="py-3 pr-4 text-center font-semibold">{sub.totalScore || 0}/{sub.totalMaxScore || 0}</td>
                            <td className={`py-3 text-center font-bold ${getScoreColor(sub.percentage || 0)}`}>{sub.percentage || 0}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section Top Performers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {['physics', 'chemistry', 'maths'].map(subject => {
                const subjectScores = validAttempts
                  .map(a => {
                    if (!a?.sectionResults) return null
                    const sr = a.sectionResults.find(s => s?.subject === subject)
                    if (!sr || !sr.maxScore || sr.maxScore === 0) return null
                    return {
                      name: getStudentName(a),
                      score: sr.score || 0,
                      maxScore: sr.maxScore,
                      pct: Math.round(((sr.score || 0) / sr.maxScore) * 100),
                    }
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null)
                  .sort((a, b) => b.pct - a.pct)
                  .slice(0, 5)

                return (
                  <div key={subject} className={`bg-white rounded-lg shadow p-4 border-t-4 ${subject === 'physics' ? 'border-blue-500' : subject === 'chemistry' ? 'border-green-500' : 'border-purple-500'}`}>
                    <h3 className="font-bold capitalize mb-3">🏅 Top {subject}</h3>
                    {subjectScores.length === 0 ? (
                      <p className="text-gray-400 text-sm">No data</p>
                    ) : (
                      <div className="space-y-2">
                        {subjectScores.map((s, i) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span><span className="font-medium mr-1">{getRankBadge(i + 1)}</span> {s.name}</span>
                            <span className={`font-bold ${getScoreColor(s.pct)}`}>{s.score}/{s.maxScore}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ======================== ANALYTICS TAB ======================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl mb-3">👥</div>
                <p className="text-3xl font-bold">{users.length}</p>
                <p className="text-gray-600">Total Users</p>
                <div className="mt-2 text-xs text-gray-500">
                  {users.filter(u => u?.role === 'student').length} students | {users.filter(u => u?.role === 'teacher').length} teachers
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl mb-3">📝</div>
                <p className="text-3xl font-bold">{tests.length}</p>
                <p className="text-gray-600">Total Tests</p>
                <div className="mt-2 text-xs text-gray-500">
                  {tests.filter(t => t?.approved).length} approved | {pendingTests.length} pending
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl mb-3">📚</div>
                <p className="text-3xl font-bold">{validAttempts.length}</p>
                <p className="text-gray-600">Submissions</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl mb-3">🎓</div>
                <p className="text-3xl font-bold">{courses.length}</p>
                <p className="text-gray-600">Courses</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold mb-4">Test Statistics</h3>
              {tests.filter(t => t?.approved).length === 0 ? (
                <p className="text-gray-500">No approved tests yet</p>
              ) : (
                <div className="space-y-3">
                  {tests.filter(t => t?.approved).map(t => {
                    if (!t) return null
                    const testAttempts = validAttempts.filter(a => {
                      const tid = safeGetId(a?.testId)
                      return tid === t._id
                    })
                    const avgScore = testAttempts.length > 0
                      ? Math.round(testAttempts.reduce((sum, a) => sum + (a?.percentage || 0), 0) / testAttempts.length)
                      : 0

                    return (
                      <div key={t._id} className="p-3 border rounded flex justify-between items-center">
                        <div>
                          <p className="font-medium">{t.title}</p>
                          <div className="flex gap-1 mt-1">
                            {t.sections?.map(s => s && (
                              <span key={s.subject} className={`text-xs px-2 py-0.5 rounded ${getSectionBadgeColor(s.subject)}`}>
                                {s.subject}: {s.questions?.length || 0}Q
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{testAttempts.length} attempt{testAttempts.length !== 1 ? 's' : ''}</p>
                          {testAttempts.length > 0 && <p className="text-xs text-gray-500">Avg: {avgScore}%</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminView