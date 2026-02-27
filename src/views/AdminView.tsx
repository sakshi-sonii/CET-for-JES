import React, { useState, useEffect } from 'react'
import { Award, LogOut, Eye, EyeOff, Clock, Download } from 'lucide-react'
import { writeFile, utils as XLSXUtils } from 'xlsx'
import type { User, Test, Course, TestSubmission, SubjectKey, Subject } from '../types'
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

const ALL_SUBJECTS: { key: SubjectKey; label: string; color: string; borderTop: string; badge: string }[] = [
  { key: 'physics', label: 'Physics', color: 'text-blue-700', borderTop: 'border-blue-500', badge: 'bg-blue-100 text-blue-800' },
  { key: 'chemistry', label: 'Chemistry', color: 'text-green-700', borderTop: 'border-green-500', badge: 'bg-green-100 text-green-800' },
  { key: 'maths', label: 'Mathematics', color: 'text-purple-700', borderTop: 'border-purple-500', badge: 'bg-purple-100 text-purple-800' },
  { key: 'biology', label: 'Biology', color: 'text-orange-700', borderTop: 'border-orange-500', badge: 'bg-orange-100 text-orange-800' },
]

const getSubjectInfo = (key: string) => ALL_SUBJECTS.find(s => s.key === key) || ALL_SUBJECTS[0]
const getSubjectLabel = (key: string) => getSubjectInfo(key).label

const getMarksPerQuestion = (subject: string, section?: any): number => {
  if (section?.marksPerQuestion) return section.marksPerQuestion
  return subject === 'maths' ? 2 : 1
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
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectForm, setSubjectForm] = useState({ courseId: '', subjectKey: '' as SubjectKey })
  const [assignTeacherForm, setAssignTeacherForm] = useState({ subjectId: '', teacherId: '' })

  // Fetch subjects on mount
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const data = await api('subjects')
        setSubjects(data || [])
      } catch (error) {
        console.error('Failed to fetch subjects:', error)
      }
    }
    fetchSubjects()
  }, [])

  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'student' as 'student' | 'teacher' | 'coordinator' | 'admin',
    course: '',
    approved: false,
  })

  const pendingUsers = users.filter((u) =>
    u && !u.approved && (u.role === 'teacher' || u.role === 'coordinator')
  )
  const pendingTests = tests.filter((t) => t && !t.approved && !!t.coordinatorId && !t.teacherId)

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
      const marks = getMarksPerQuestion(s.subject, s)
      return sum + (s.questions?.length || 0) * marks
    }, 0)
  }

  const getTotalDuration = (test: Test): number => {
    if (test.testType === 'mock') {
      const pc = test.sectionTimings?.physicsChemistry ?? 90
      const mb = test.sectionTimings?.mathsOrBiology ?? 90
      return pc + mb
    }
    if (test.testType === 'custom') {
      return test.customDuration ?? 60
    }
    return 180
  }

  const getTimingDescription = (test: Test): string => {
    if (test.testType === 'mock') {
      const pc = test.sectionTimings?.physicsChemistry ?? 90
      const mb = test.sectionTimings?.mathsOrBiology ?? 90
      const phase2Label = test.stream === 'PCB' ? 'Bio' : 'Maths'
      return `Phy+Chem: ${pc}min → ${phase2Label}: ${mb}min`
    }
    if (test.testType === 'custom') {
      return `Custom: ${test.customDuration ?? 60}min`
    }
    return ''
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

  const getTestFromSubmission = (submission: TestSubmission): Test | undefined => {
    const rawTestId: any = submission.testId
    if (typeof rawTestId === 'object' && rawTestId?._id) return rawTestId as Test
    const testIdStr = typeof rawTestId === 'string' ? rawTestId : rawTestId?._id
    return tests.find(t => t && t._id === testIdStr)
  }

  // Get all unique subjects present in a list of submissions
  const getUniqueSubjects = (submissions: TestSubmission[]): SubjectKey[] => {
    const subjectSet = new Set<SubjectKey>()
    submissions.forEach(sub => {
      sub.sectionResults?.forEach(sr => {
        if (sr?.subject) subjectSet.add(sr.subject as SubjectKey)
      })
    })
    // Return in canonical order
    return ALL_SUBJECTS
      .map(s => s.key)
      .filter(k => subjectSet.has(k))
  }

  // ========================
  // ACTIONS
  // ========================
  const approveTeacher = async (id: string) => {
    if (!id) return
    setActionLoading(id)
    try {
      await api(`users?userId=${encodeURIComponent(id)}&action=approve`, 'PATCH')
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
      await api(`users?userId=${encodeURIComponent(id)}`, 'DELETE')
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
      await api(`tests?testId=${encodeURIComponent(id)}&action=approve`, 'PATCH')
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
      await api(`tests?testId=${encodeURIComponent(id)}`, 'DELETE')
      const testsData = await api('tests')
      onTestsUpdate(testsData)
    } catch (error: any) {
      alert(error.message || 'Failed to reject test')
    }
    setActionLoading(null)
  }

  const handleToggleAnswerKey = async (testId: string, currentShowAnswerKey: boolean) => {
    setActionLoading(`answerkey-${testId}`)
    try {
      await api(`tests?testId=${encodeURIComponent(testId)}`, 'PATCH', { showAnswerKey: !currentShowAnswerKey })
      const testsData = await api('tests')
      onTestsUpdate(testsData)
    } catch (error: any) {
      alert(error.message || 'Failed to update answer key visibility')
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

  const createSubject = async (courseId: string, subjectKey: SubjectKey) => {
    if (!courseId || !subjectKey) {
      alert('Please select a course and subject')
      return
    }
    try {
      setActionLoading('create-subject')
      await api('subjects', 'POST', { courseId, name: subjectKey, label: getSubjectLabel(subjectKey) })
      const subjectsData = await api('subjects')
      setSubjects(subjectsData || [])
      setSubjectForm({ courseId: '', subjectKey: '' as SubjectKey })
      alert('Subject created')
    } catch (error: any) {
      alert(error.message || 'Failed to create subject')
    }
    setActionLoading(null)
  }

  const assignTeacherToSubject = async (subjectId: string, teacherId: string) => {
    if (!subjectId || !teacherId) {
      alert('Please select a subject and teacher')
      return
    }
    try {
      setActionLoading(`assign-${subjectId}`)
      await api('subjects', 'PUT', { subjectId, teacherId })
      const subjectsData = await api('subjects')
      setSubjects(subjectsData || [])
      setAssignTeacherForm({ subjectId: '', teacherId: '' })
      alert('Teacher assigned')
    } catch (error: any) {
      alert(error.message || 'Failed to assign teacher')
    }
    setActionLoading(null)
  }

  const deleteSubject = async (subjectId: string) => {
    if (!confirm('Delete this subject?')) return
    try {
      setActionLoading(`delete-${subjectId}`)
      await api(`subjects?subjectId=${encodeURIComponent(subjectId)}`, 'DELETE')
      const subjectsData = await api('subjects')
      setSubjects(subjectsData || [])
    } catch (error: any) {
      alert(error.message || 'Failed to delete subject')
    }
    setActionLoading(null)
  }

  const getSectionBadgeColor = (subject: string) => {
    return getSubjectInfo(subject).badge
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

  const getTestTypeBadge = (test: Test) => {
    if (test.testType === 'mock') {
      return (
        <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
          Mock {test.stream && `(${test.stream})`}
        </span>
      )
    }
    if (test.testType === 'custom') {
      return (
        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
          Custom
        </span>
      )
    }
    if (test.sections && test.sections.length === 1) {
      return (
        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
          Subject
        </span>
      )
    }
    return null
  }

  // ========================
  // RANKINGS COMPUTATION
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

  // Get unique subjects in filtered submissions for dynamic columns
  const rankingSubjects = getUniqueSubjects(sortedSubmissions)

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

  // Get unique subjects present across all valid attempts for top performers
  const allSubjectsInAttempts = getUniqueSubjects(validAttempts)

  // ========================
  // EXCEL EXPORT FUNCTION
  // ========================
  const exportRankingsToExcel = () => {
    const wb = XLSXUtils.book_new()

    // Sheet 1: Overall Rankings
    const overallData = [
      ['Rank', 'Student Name', 'Email', 'Tests Attempted', 'Total Score', 'Total Max Score', 'Percentage'],
      ...overallRankings.map((student, idx) => [
        idx + 1,
        student.name,
        student.email,
        student.testsAttempted,
        student.totalScore,
        student.totalMaxScore,
        `${student.percentage}%`,
      ]),
    ]
    const overallSheet = XLSXUtils.aoa_to_sheet(overallData)
    overallSheet['!cols'] = [
      { wch: 8 },
      { wch: 25 },
      { wch: 30 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
      { wch: 12 },
    ]
    XLSXUtils.book_append_sheet(wb, overallSheet, 'Overall Rankings')

    // Sheet 2: Test-wise Rankings
    if (sortedSubmissions.length > 0) {
      const headers = [
        'Rank',
        'Student Name',
        'Email',
        'Test',
        ...rankingSubjects.map(s => getSubjectLabel(s)),
        'Total Score',
        'Percentage',
      ]
      const testData = [
        headers,
        ...sortedSubmissions.map((sub, idx) => {
          const sectionResults = sub.sectionResults || []
          const subjectScores = rankingSubjects.map(subject => {
            const sr = sectionResults.find(s => s?.subject === subject)
            return sr ? `${sr.score}/${sr.maxScore}` : '—'
          })
          return [
            idx + 1,
            getStudentName(sub),
            getStudentEmail(sub),
            getTestTitle(sub),
            ...subjectScores,
            `${sub.totalScore || 0}/${sub.totalMaxScore || 0}`,
            `${sub.percentage || 0}%`,
          ]
        }),
      ]
      const testSheet = XLSXUtils.aoa_to_sheet(testData)
      const colWidths = [
        { wch: 8 },
        { wch: 25 },
        { wch: 30 },
        { wch: 25 },
        ...rankingSubjects.map(() => ({ wch: 15 })),
        { wch: 18 },
        { wch: 12 },
      ]
      testSheet['!cols'] = colWidths
      XLSXUtils.book_append_sheet(wb, testSheet, 'Test-wise Rankings')
    }

    // Sheet 3: Subject-wise Top Performers
    const subjectTopData: any[] = []
    allSubjectsInAttempts.forEach(subject => {
      const subInfo = getSubjectInfo(subject)
      const subjectScores = validAttempts
        .map(a => {
          if (!a?.sectionResults) return null
          const sr = a.sectionResults.find(s => s?.subject === subject)
          if (!sr || !sr.maxScore || sr.maxScore === 0) return null
          return {
            name: getStudentName(a),
            email: getStudentEmail(a),
            score: sr.score || 0,
            maxScore: sr.maxScore,
            pct: Math.round(((sr.score || 0) / sr.maxScore) * 100),
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5)

      if (subjectScores.length > 0) {
        subjectTopData.push(
          [`${subInfo.label} - Top Performers`],
          ['Rank', 'Student Name', 'Email', 'Score', 'Max Score', 'Percentage'],
          ...subjectScores.map((s, i) => [
            i + 1,
            s.name,
            s.email,
            s.score,
            s.maxScore,
            `${s.pct}%`,
          ]),
          [''],
        )
      }
    })

    if (subjectTopData.length > 0) {
      const subjectSheet = XLSXUtils.aoa_to_sheet(subjectTopData)
      subjectSheet['!cols'] = [
        { wch: 8 },
        { wch: 25 },
        { wch: 30 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
      ]
      XLSXUtils.book_append_sheet(wb, subjectSheet, 'Top Performers')
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]
    writeFile(wb, `Test-Results-${timestamp}.xlsx`)
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
            <span className="text-gray-600">Welcome, <b>{user?.name}</b></span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <LogOut size={20} /> Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-4 mb-6 overflow-x-auto">
          {['users', 'tests', 'courses', 'subjects', 'rankings', 'analytics'].map((tab) => (
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
                    <option value="coordinator">Coordinator</option>
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
                      const payload: any = { email: newUserForm.email, password: newUserForm.password, name: newUserForm.name, role: newUserForm.role }
                      if (newUserForm.course) payload.course = newUserForm.course
                      payload.approved = newUserForm.approved
                      setActionLoading('create-user')
                      await api('users', 'POST', payload)
                      const usersData = await api('users')
                      onUsersUpdate(usersData)
                      setNewUserForm({ email: '', password: '', name: '', role: 'student', course: '', approved: false })
                      alert('User created')
                    } catch (error: any) {
                      alert(error.message || 'Failed to create user')
                    } finally { setActionLoading(null) }
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
                        if (!confirm('Delete user?')) return
                        setActionLoading(u._id)
                        try { await api(`users?userId=${encodeURIComponent(u._id)}`, 'DELETE'); const usersData = await api('users'); onUsersUpdate(usersData) } catch (error: any) { alert(error.message || 'Failed') }
                        setActionLoading(null)
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
                    const teacher = users.find((u) => u && safeGetId(u) === safeGetId(t.teacherId))
                    const isExpanded = expandedTest === t._id
                    return (
                      <div key={t._id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="font-bold text-lg">{t.title}</p>
                              {getTestTypeBadge(t)}
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              By: {teacher?.name || 'Unknown'} | {getTotalDuration(t)} min total
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {t.sections?.map((section) => section && (
                                <span key={section.subject} className={`px-3 py-1 rounded-full text-xs font-medium ${getSectionBadgeColor(section.subject)}`}>
                                  {getSubjectLabel(section.subject)}: {section.questions?.length || 0}Q × {getMarksPerQuestion(section.subject, section)}m
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getTimingDescription(t)} | 📊 {getTotalQuestions(t)}Q, {getTotalMarks(t)} marks
                            </div>

                            {/* Answer key status */}
                            <div className="mt-2 flex items-center gap-1 text-xs">
                              {t.showAnswerKey ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  <Eye className="w-3 h-3" /> Answer key visible to students
                                </span>
                              ) : (
                                <span className="text-red-500 flex items-center gap-1">
                                  <EyeOff className="w-3 h-3" /> Answer key hidden
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4 shrink-0">
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
                                <h4 className={`font-semibold text-sm uppercase tracking-wide mb-2 ${getSubjectInfo(section.subject).color}`}>
                                  {getSubjectLabel(section.subject)} ({section.questions?.length || 0}Q × {getMarksPerQuestion(section.subject, section)}m)
                                </h4>
                                <div className="space-y-2 pl-4">
                                  {section.questions?.map((q, qIdx) => q && (
                                    <div key={qIdx} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                                      <p className="font-medium text-gray-800">
                                        Q{qIdx + 1}. {q.question}
                                        {!q.question && q.questionImage && <span className="text-gray-400 italic">(Image question)</span>}
                                      </p>
                                      {q.questionImage && (
                                        <img src={q.questionImage} alt="Question" className="mt-1 max-h-24 rounded border" />
                                      )}
                                      <div className="flex flex-wrap gap-3 mt-1 text-gray-600">
                                        {q.options?.map((opt, optIdx) => (
                                          <span key={optIdx} className={optIdx === q.correct ? 'text-green-700 font-semibold' : ''}>
                                            {String.fromCharCode(65 + optIdx)}. {opt || (q.optionImages?.[optIdx] ? '(image)' : '(empty)')}{optIdx === q.correct && ' ✓'}
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
              <h2 className="text-xl font-bold mb-4">All Coordinator Tests ({tests.filter(t => t && !t.teacherId).length})</h2>
              <div className="space-y-2">
                {tests.filter(t => t && !t.teacherId).map((t) => {
                  const coordinator = users.find((u) => u && safeGetId(u) === safeGetId(t.coordinatorId))
                  return (
                    <div key={t._id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{t.title}</p>
                            {getTestTypeBadge(t)}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {t.sections?.map((s) => s && (
                              <span key={s.subject} className={`text-xs px-2 py-0.5 rounded ${getSectionBadgeColor(s.subject)}`}>
                                {getSubjectLabel(s.subject)}: {s.questions?.length || 0}Q
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            By: {coordinator?.name || 'Unknown'} | {getTotalMarks(t)} marks | {getTotalDuration(t)} min
                          </p>
                          {(t.testType === 'mock' || t.testType === 'custom') && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getTimingDescription(t)}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end ml-4 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded text-xs font-medium ${t.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {t.approved ? 'Approved' : 'Pending'}
                            </span>
                            <span className={`px-3 py-1 rounded text-xs font-medium ${t.active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                              {t.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          {/* Answer key toggle */}
                          <button
                            disabled={actionLoading === `answerkey-${t._id}`}
                            onClick={() => handleToggleAnswerKey(t._id, t.showAnswerKey)}
                            className={`px-3 py-1 rounded text-xs font-medium inline-flex items-center gap-1 disabled:opacity-60 ${
                              t.showAnswerKey
                                ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {actionLoading === `answerkey-${t._id}` ? (
                              '...'
                            ) : t.showAnswerKey ? (
                              <>
                                <EyeOff className="w-3 h-3" />
                                Hide Answers
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3" />
                                Show Answers
                              </>
                            )}
                          </button>
                        </div>
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
              <button onClick={() => { if (courseForm.name) { addCourse(courseForm.name, courseForm.description); setCourseForm({ name: '', description: '' }) } }} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
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

        {/* ======================== SUBJECTS TAB ======================== */}
        {activeTab === 'subjects' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Create Subject</h2>
              <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select value={subjectForm.courseId} onChange={e => setSubjectForm({...subjectForm, courseId: e.target.value})} className="px-3 py-2 border rounded">
                    <option value="">Select Course</option>
                    {courses.map(c => c && <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                  <select value={subjectForm.subjectKey} onChange={e => setSubjectForm({...subjectForm, subjectKey: e.target.value as SubjectKey})} className="px-3 py-2 border rounded">
                    <option value="" disabled>Select Subject</option>
                    {ALL_SUBJECTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button 
                    disabled={actionLoading === 'create-subject' || !subjectForm.courseId || !subjectForm.subjectKey}
                    onClick={() => createSubject(subjectForm.courseId, subjectForm.subjectKey)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {actionLoading === 'create-subject' ? '...' : 'Create Subject'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Assign Teachers to Subjects</h2>
              <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select value={assignTeacherForm.subjectId} onChange={e => setAssignTeacherForm({...assignTeacherForm, subjectId: e.target.value})} className="px-3 py-2 border rounded">
                    <option value="">Select Subject</option>
                    {subjects.map(s => s && <option key={s._id} value={s._id}>
                      {(courses.find(c => c._id === s.course)?.name || 'Unknown Course')} - {(s.label || getSubjectLabel(s.name))}
                    </option>)}
                  </select>
                  <select value={assignTeacherForm.teacherId} onChange={e => setAssignTeacherForm({...assignTeacherForm, teacherId: e.target.value})} className="px-3 py-2 border rounded">
                    <option value="">Select Teacher</option>
                    {users.filter(u => u?.role === 'teacher' && u?.approved).map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                  </select>
                  <button 
                    disabled={actionLoading?.startsWith('assign-') || !assignTeacherForm.subjectId || !assignTeacherForm.teacherId}
                    onClick={() => assignTeacherToSubject(assignTeacherForm.subjectId, assignTeacherForm.teacherId)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {actionLoading?.startsWith('assign-') ? '...' : 'Assign Teacher'}
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-bold mb-4">Subject-Teacher Assignments</h3>
              <div className="space-y-3">
                {subjects.map(s => s && (
                  <div key={s._id} className="p-4 border rounded-lg flex justify-between items-center">
                    <div className="flex-1">
                      <p className="font-medium">{s.label || getSubjectLabel(s.name)}</p>
                      <p className="text-sm text-gray-600">
                        Course: {courses.find(c => c._id === s.course)?.name}
                      </p>
                      {s.teacherId ? (
                        <p className="text-sm text-indigo-600 font-semibold">
                          Teacher: {typeof s.teacherId === 'string' 
                            ? users.find(u => u._id === s.teacherId)?.name || 'Unknown'
                            : (s.teacherId as any).name || 'Unknown'
                          }
                        </p>
                      ) : (
                        <p className="text-sm text-red-500">No teacher assigned</p>
                      )}
                    </div>
                    <button 
                      disabled={actionLoading?.startsWith('delete-')}
                      onClick={() => deleteSubject(s._id)}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
                    >
                      {actionLoading === `delete-${s._id}` ? '...' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================== RANKINGS TAB ======================== */}
        {activeTab === 'rankings' && (
          <div className="space-y-6">
            {/* Export Button */}
            <div className="flex gap-3">
              <button
                onClick={exportRankingsToExcel}
                disabled={validAttempts.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <Download size={20} />
                Download Results (Excel)
              </button>
            </div>

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

            {/* Per-Test Rankings with Dynamic Subject Columns */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                <h2 className="text-xl font-bold">📊 Test-wise Rankings</h2>
                <select value={rankingsTestFilter} onChange={(e) => setRankingsTestFilter(e.target.value)} className="px-4 py-2 border rounded-lg text-sm">
                  <option value="all">All Tests</option>
                  {tests.filter(t => t && t.approved).map(t => (
                    <option key={t._id} value={t._id}>
                      {t.title}
                      {t.testType === 'mock' && t.stream ? ` (${t.stream})` : ''}
                      {t.testType === 'custom' ? ' (Custom)' : ''}
                    </option>
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
                        {rankingSubjects.map(subject => (
                          <th key={subject} className={`pb-3 pr-4 font-semibold text-center ${getSubjectInfo(subject).color}`}>
                            {getSubjectLabel(subject)}
                          </th>
                        ))}
                        <th className="pb-3 pr-4 font-semibold text-gray-600 text-center">Total</th>
                        <th className="pb-3 font-semibold text-gray-600 text-center">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSubmissions.map((sub, idx) => {
                        if (!sub) return null
                        const sectionResults = sub.sectionResults || []

                        return (
                          <tr key={sub._id || idx} className={`border-b hover:bg-gray-50 ${idx < 3 ? 'bg-yellow-50' : ''}`}>
                            <td className="py-3 pr-4"><span className="text-lg font-bold">{getRankBadge(idx + 1)}</span></td>
                            <td className="py-3 pr-4">
                              <p className="font-medium">{getStudentName(sub)}</p>
                              <p className="text-xs text-gray-400">{getStudentEmail(sub)}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <p className="text-gray-600">{getTestTitle(sub)}</p>
                              {(() => {
                                const testObj = getTestFromSubmission(sub)
                                if (testObj?.testType === 'mock') return <span className="text-xs text-violet-500">Mock {testObj.stream && `(${testObj.stream})`}</span>
                                if (testObj?.testType === 'custom') return <span className="text-xs text-indigo-500">Custom</span>
                                return null
                              })()}
                            </td>
                            {rankingSubjects.map(subject => {
                              const sr = sectionResults.find(s => s?.subject === subject)
                              return (
                                <td key={subject} className="py-3 pr-4 text-center">
                                  {sr ? (
                                    <span className={getScoreColor(sr.maxScore > 0 ? Math.round((sr.score / sr.maxScore) * 100) : 0)}>
                                      {sr.score}/{sr.maxScore}
                                    </span>
                                  ) : '—'}
                                </td>
                              )
                            })}
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

            {/* Section Top Performers - Dynamic subjects */}
            <div className={`grid gap-6 ${
              allSubjectsInAttempts.length <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
            }`}>
              {allSubjectsInAttempts.map(subject => {
                const subInfo = getSubjectInfo(subject)
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
                  <div key={subject} className={`bg-white rounded-lg shadow p-4 border-t-4 ${subInfo.borderTop}`}>
                    <h3 className="font-bold mb-3">🏅 Top {subInfo.label}</h3>
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
                  {tests.filter(t => t?.approved && !t?.teacherId).length} approved | {pendingTests.length} pending
                  <br />
                  {tests.filter(t => t?.testType === 'mock').length} mock | {tests.filter(t => t?.testType === 'custom').length} custom
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl mb-3">📚</div>
                <p className="text-3xl font-bold">{validAttempts.length}</p>
                <p className="text-gray-600">Submissions</p>
                {validAttempts.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    Avg: {Math.round(validAttempts.reduce((sum, a) => sum + (a.percentage || 0), 0) / validAttempts.length)}%
                  </div>
                )}
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-2xl mb-3">🎓</div>
                <p className="text-3xl font-bold">{courses.length}</p>
                <p className="text-gray-600">Courses</p>
              </div>
            </div>

            {/* Answer Key Status Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                Answer Key Visibility
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-700">
                    {tests.filter(t => t?.showAnswerKey).length}
                  </p>
                  <p className="text-sm text-emerald-600">Tests with answer key visible</p>
                </div>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-2xl font-bold text-red-700">
                    {tests.filter(t => t && !t.showAnswerKey).length}
                  </p>
                  <p className="text-sm text-red-600">Tests with answer key hidden</p>
                </div>
              </div>
              <div className="space-y-2">
                {tests.filter(t => t?.approved).map(t => (
                  <div key={t._id} className="flex justify-between items-center p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {t.showAnswerKey ? (
                        <Eye className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-red-500" />
                      )}
                      <span className="font-medium text-sm">{t.title}</span>
                      {getTestTypeBadge(t)}
                    </div>
                    <button
                      disabled={actionLoading === `answerkey-${t._id}`}
                      onClick={() => handleToggleAnswerKey(t._id, t.showAnswerKey)}
                      className={`px-3 py-1 rounded text-xs font-medium inline-flex items-center gap-1 disabled:opacity-60 ${
                        t.showAnswerKey
                          ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      {actionLoading === `answerkey-${t._id}` ? '...' : t.showAnswerKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                ))}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{t.title}</p>
                            {getTestTypeBadge(t)}
                            {t.showAnswerKey ? (
                              <Eye className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-red-400" />
                            )}
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {t.sections?.map(s => s && (
                              <span key={s.subject} className={`text-xs px-2 py-0.5 rounded ${getSectionBadgeColor(s.subject)}`}>
                                {getSubjectLabel(s.subject)}: {s.questions?.length || 0}Q
                              </span>
                            ))}
                          </div>
                          {(t.testType === 'mock' || t.testType === 'custom') && (
                            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {getTimingDescription(t)}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-sm font-medium">{testAttempts.length} attempt{testAttempts.length !== 1 ? 's' : ''}</p>
                          {testAttempts.length > 0 && (
                            <p className={`text-xs font-semibold ${getScoreColor(avgScore)}`}>Avg: {avgScore}%</p>
                          )}
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
