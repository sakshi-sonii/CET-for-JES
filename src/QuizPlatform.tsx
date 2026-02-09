import React, { useState, useEffect, useCallback } from 'react';
import { Award } from 'lucide-react';
import type { User, Test, Course, Material, TestSubmission } from './types';
import { api } from './api';
import LoginView from './views/LoginView';
import AdminView from './views/AdminView';
import TeacherView from './views/TeacherView';
import StudentView from './views/StudentView';
import TakingTestView from './views/TakingTestView';

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

  // Fetch courses on mount (needed for login/register)
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
      const [testsData, materialsData] = await Promise.all([
        api("tests"),
        api("materials"),
      ]);

      setTests(testsData);
      setMaterials(materialsData);

      // Fetch attempts/submissions
      try {
        const attemptsData = await api("test-submissions");
        setAttempts(attemptsData);
      } catch {
        // Fallback: try old endpoint
        try {
          const attemptsData = await api("attempts");
          setAttempts(attemptsData);
        } catch {
          console.warn("Could not fetch attempts");
          setAttempts([]);
        }
      }

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
  // Submit test (called by TakingTestView)
  // ========================
  const handleTestSubmit = async (testAnswers: Record<string, number>) => {
    if (!currentTest || !user) return;

    try {
      const res = await api("test-submissions", "POST", {
        testId: currentTest._id,
        answers: testAnswers,
      });

      const totalScore = res.totalScore ?? 0;
      const totalMaxScore = res.totalMaxScore ?? 0;
      const percentage = res.percentage ?? 0;

      alert(`Test submitted! Score: ${totalScore}/${totalMaxScore} (${percentage}%)`);

      setCurrentTest(null);
      setStudentActiveTab('results');
      setView("student");

      // Refresh attempts
      try {
        const attemptsData = await api("test-submissions");
        setAttempts(attemptsData);
      } catch {
        try {
          const attemptsData = await api("attempts");
          setAttempts(attemptsData);
        } catch {
          console.warn("Could not refresh attempts");
        }
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
    setView('login');
    setCurrentTest(null);
  };

  // ========================
  // Start test
  // ========================
  const startTest = (test: Test) => {
    setCurrentTest(test);
    setView('taking-test');
  };

  // ========================
  // Loading screen
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
  // Render views
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
            if (confirm('Are you sure? Your progress will be lost.')) {
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