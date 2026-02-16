import React, { useState, useEffect, useCallback, useRef } from 'react';
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

  // Track current user ID to prevent stale data
  const currentUserIdRef = useRef<string | null>(null);

  // Fetch courses on mount (public endpoint)
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
          currentUserIdRef.current = userData._id;
          setUser(userData);
          setView(userData.role);
        } else {
          localStorage.removeItem("token");
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  // ========================
  // Fetch all data for current user
  // ========================
  const fetchData = useCallback(async (forUser?: User) => {
    const activeUser = forUser || user;
    if (!activeUser) return;

    // Prevent fetching data for a stale user
    if (currentUserIdRef.current !== activeUser._id) return;

    try {
      const promises: Promise<any>[] = [
        api("tests"),
        api("materials"),
        api("attempts"),
        api("courses"),
      ];

      if (activeUser.role === 'admin') {
        promises.push(api("users"));
      }

      const results = await Promise.allSettled(promises);

      // Only update state if this is still the current user
      if (currentUserIdRef.current !== activeUser._id) return;

      const getValue = (result: PromiseSettledResult<any>, fallback: any = []) =>
        result.status === 'fulfilled' ? result.value : fallback;

      setTests(getValue(results[0]));
      setMaterials(getValue(results[1]));

      const attemptsData = getValue(results[2]);
      setAttempts(Array.isArray(attemptsData) ? attemptsData : []);

      setCourses(getValue(results[3]));

      if (activeUser.role === 'admin' && results[4]) {
        setUsers(getValue(results[4]));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [user]);

  // Fetch data when user changes
  useEffect(() => {
    if (user) {
      fetchData(user);
    }
  }, [user?._id]);

  // ========================
  // Login handler
  // ========================
  const handleLogin = useCallback((_token: string, userData: any) => {
    const normalizedUser: User = {
      ...userData,
      _id: userData._id || userData.id,
    };

    // Clear all previous user's data first
    setUsers([]);
    setTests([]);
    setAttempts([]);
    setMaterials([]);
    setStudentActiveTab('tests');

    // Set new user
    currentUserIdRef.current = normalizedUser._id;
    setUser(normalizedUser);
    setView(normalizedUser.role);
  }, []);

  // ========================
  // Submit test
  // ========================
  const handleTestSubmit = async (testAnswers: Record<string, number>) => {
    if (!currentTest || !user) return;

    try {
      const res = await api("attempts", "POST", {
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

      // Refresh data
      fetchData();
    } catch (error: any) {
      alert(error.message || "Failed to submit test");
    }
  };

  // ========================
  // Logout
  // ========================
  const logout = useCallback(() => {
    localStorage.removeItem("token");
    currentUserIdRef.current = null;
    setUser(null);
    setUsers([]);
    setTests([]);
    setAttempts([]);
    setMaterials([]);
    setView('login');
    setCurrentTest(null);
    setStudentActiveTab('tests');

    // Re-fetch courses for login page
    api("courses").then(setCourses).catch(console.error);
  }, []);

  // ========================
  // Start test
  // ========================
  const startTest = useCallback((test: Test) => {
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
  }, []);

  // ========================
  // Stable update callbacks
  // ========================
  const handleTestsUpdate = useCallback((t: Test[]) => setTests(t), []);
  const handleUsersUpdate = useCallback((u: User[]) => setUsers(u), []);
  const handleMaterialsUpdate = useCallback((m: Material[]) => setMaterials(m), []);
  const handleCoursesUpdate = useCallback((c: Course[]) => setCourses(c), []);

  // ========================
  // Loading
  // ========================
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <img 
            src="/loader.jpg" 
            alt="Loading" 
            className="w-16 h-16 mx-auto mb-4 animate-pulse object-contain"
          />
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
          onLoginSuccess={handleLogin}
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
          onUsersUpdate={handleUsersUpdate}
          onTestsUpdate={handleTestsUpdate}
          onCoursesUpdate={handleCoursesUpdate}
        />
      )}

      {user && view === 'teacher' && (
        <TeacherView
          user={user}
          tests={tests}
          courses={courses}
          materials={materials}
          onLogout={logout}
          onTestsUpdate={handleTestsUpdate}
          onMaterialsUpdate={handleMaterialsUpdate}
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