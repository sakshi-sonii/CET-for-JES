import React, { useState, useEffect, useCallback } from 'react';
import { Award } from 'lucide-react';
import type { User, Test, Course, Material, TestSubmission } from './types';
import { api } from './api';
import LoginView from './views/LoginView';
import AdminView from './views/AdminView';
import TeacherView from './views/TeacherView';
import StudentView from './views/StudentView';
import TakingTestView from './views/TakingTestView';

const getSubjectLabel = (subject: string): string => {
  switch (subject) {
    case 'physics': return 'Physics';
    case 'chemistry': return 'Chemistry';
    case 'maths': return 'Mathematics';
    case 'biology': return 'Biology';
    default: return subject;
  }
};

const QuizPlatform: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [attempts, setAttempts] = useState<TestSubmission[]>([]);
  const [view, setView] = useState<string>('login');
  const [currentTest, setCurrentTest] = useState<Test | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentActiveTab, setStudentActiveTab] = useState<string>('tests');

  // Fetch courses on mount
  useEffect(() => {
    api("courses").then(setCourses).catch(console.error);
  }, []);

  // Auto-login from stored token
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    api("auth/me", "GET")
      .then(res => {
        if (res?.user) {
          const userData: User = {
            ...res.user,
            _id: res.user._id || res.user.id,
          };
          setUser(userData);
          setView(userData.role);
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch data when user is set
  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [testsData, materialsData, attemptsData] = await Promise.all([
        api("tests"),
        api("materials"),
        api("submissions"),
      ]);

      setTests(testsData);
      setMaterials(materialsData);
      setAttempts(Array.isArray(attemptsData) ? attemptsData : []);

      // Admin also needs users list
      if (user.role === 'admin') {
        const usersData = await api("users");
        setUsers(usersData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ========================
  // Submit test — called by TakingTestView
  // ========================
  const handleTestSubmit = async (testAnswers: Record<string, number>) => {
    if (!currentTest || !user) return;

    try {
      const res = await api("submissions", "POST", {
        testId: currentTest._id,
        answers: testAnswers,
      });

      const totalScore = res.totalScore ?? 0;
      const totalMaxScore = res.totalMaxScore ?? 0;
      const percentage = res.percentage ?? 0;

      // Build section-wise score summary
      const sectionSummary = res.sectionResults
        ?.map((sr: any) =>
          `${getSubjectLabel(sr.subject)}: ${sr.score}/${sr.maxScore}`
        )
        .join(' | ') || '';

      const canViewAnswerKey = res.canViewAnswerKey ?? false;

      let message = `✅ Test submitted!\n\n`;
      message += `📊 Total Score: ${totalScore}/${totalMaxScore} (${percentage}%)\n`;
      if (sectionSummary) {
        message += `\n📋 Section Scores:\n${sectionSummary}\n`;
      }
      if (!canViewAnswerKey) {
        message += `\n🔒 Answer key and explanations will be available once your teacher releases them.`;
      } else {
        message += `\n✅ You can view correct answers and explanations in the Results tab.`;
      }

      alert(message);

      // Clear test state and redirect to results
      setCurrentTest(null);
      setStudentActiveTab('results');
      setView('student');

      // Refresh submissions
      try {
        const attemptsData = await api("submissions");
        setAttempts(Array.isArray(attemptsData) ? attemptsData : []);
      } catch {
        console.warn("Could not refresh submissions");
      }
    } catch (error: any) {
      alert(error.message || "Failed to submit test");
    }
  };

  // ========================
  // Logout
  // ========================
  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setUsers([]);
    setTests([]);
    setAttempts([]);
    setMaterials([]);
    setCourses([]);
    setView('login');
    setCurrentTest(null);
    setStudentActiveTab('tests');

    // Re-fetch courses for login page
    api("courses").then(setCourses).catch(console.error);
  };

  // ========================
  // Start test
  // ========================
  const startTest = (test: Test) => {
    // Confirm before starting
    const testType = test.testType || 'custom';
    let confirmMsg = `Are you sure you want to start "${test.title}"?\n\n`;

    if (testType === 'mock') {
      const pc = test.sectionTimings?.physicsChemistry ?? 90;
      const mb = test.sectionTimings?.mathsOrBiology ?? 90;
      const phase2Label = test.stream === 'PCB' ? 'Biology' : 'Mathematics';

      confirmMsg += `📋 Mock Test (${test.stream || 'PCM'})\n`;
      confirmMsg += `⏱ Phase 1: Physics + Chemistry — ${pc} minutes\n`;
      confirmMsg += `⏱ Phase 2: ${phase2Label} — ${mb} minutes\n`;
      confirmMsg += `⏱ Total: ${pc + mb} minutes\n\n`;
      confirmMsg += `⚠️ Important:\n`;
      confirmMsg += `• Physics & Chemistry will auto-submit when their time expires\n`;
      confirmMsg += `• You can submit Phase 1 early to move to ${phase2Label}\n`;
      confirmMsg += `• Once you move to ${phase2Label}, you CANNOT go back\n`;
    } else {
      const duration = test.customDuration ?? 60;
      const subjects = test.sections?.map(s => getSubjectLabel(s.subject)).join(', ') || '';

      confirmMsg += `⚡ Custom Test\n`;
      confirmMsg += `📚 Subjects: ${subjects}\n`;
      confirmMsg += `⏱ Duration: ${duration} minutes\n\n`;
      confirmMsg += `You can switch between subjects freely during the test.\n`;
    }

    confirmMsg += `\nOnce started, the timer cannot be paused.`;

    if (!confirm(confirmMsg)) return;

    setCurrentTest(test);
    setView('taking-test');
  };

  // ========================
  // Loading
  // ========================
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Award className="w-16 h-16 text-indigo-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // ========================
  // Render
  // ========================
  return (
    <>
      {!user && view === 'login' && (
        <LoginView
          onLoginSuccess={(_, userData) => {
            const normalizedUser: User = {
              ...userData,
              _id: userData._id || userData.id,
            };
            setUser(normalizedUser);
            setView(normalizedUser.role);
          }}
          courses={courses}
        />
      )}

      {user && view === 'admin' && (
        <AdminView
          user={user}
          users={users}
          tests={tests}
          courses={courses}
          attempts={attempts}
          onLogout={logout}
          onUsersUpdate={setUsers}
          onTestsUpdate={setTests}
          onCoursesUpdate={setCourses}
        />
      )}

      {user && view === 'teacher' && (
        <TeacherView
          user={user}
          tests={tests}
          courses={courses}
          materials={materials}
          onLogout={logout}
          onTestsUpdate={setTests}
          onMaterialsUpdate={setMaterials}
        />
      )}

      {user && view === 'student' && (
        <StudentView
          user={user}
          tests={tests}
          courses={courses}
          materials={materials}
          attempts={attempts}
          activeTab={studentActiveTab}
          onTabChange={setStudentActiveTab}
          onStartTest={startTest}
          onLogout={logout}
        />
      )}

      {user && view === 'taking-test' && currentTest && (
        <TakingTestView
          test={currentTest}
          onSubmit={handleTestSubmit}
          onBack={() => {
            if (confirm('Are you sure you want to leave? Your progress will be lost.')) {
              setCurrentTest(null);
              setView('student');
            }
          }}
        />
      )}
    </>
  );
};

export default QuizPlatform;