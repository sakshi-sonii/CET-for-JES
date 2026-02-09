import React, { useState, useEffect, useCallback } from 'react';
import { Award } from 'lucide-react';
import type { User, Test, Course, Material, Attempt } from './types';
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
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [view, setView] = useState<string>('login');
  const [currentTest, setCurrentTest] = useState<Test | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [loading, setLoading] = useState(true); // Changed to true initially
  const [studentActiveTab, setStudentActiveTab] = useState<string>('tests');

  useEffect(() => {
    api("courses").then(setCourses).catch(console.error);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false); // No token, stop loading
      return;
    }

    setLoading(true);
    api("auth/me", "GET")
      .then(res => {
        if (res?.user) {
          const userData = { ...res.user, id: res.user._id || res.user.id };
          setUser(userData);
          setView(userData.role);
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [testsData, attemptsData, materialsData] = await Promise.all([
        api("tests"),
        api("attempts"),
        api("materials"),
      ]);
      
      setTests(testsData);
      setAttempts(attemptsData);
      setMaterials(materialsData);

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

  const submitTest = useCallback(async () => {
    if (!currentTest || !user) return;

    let score = 0;
    shuffledOrder.forEach((originalIdx, shuffledIdx) => {
      const q = currentTest.questions[originalIdx];
      if (answers[shuffledIdx] === q.correct) score++;
    });

    try {
      await api("attempts", "POST", {
        testId: currentTest.id,
        studentId: user.id,
        score,
        total: currentTest.questions.length,
        answers,
        shuffledOrder,
      });

      alert(`Test submitted! Score: ${score}/${currentTest.questions.length}`);
      
      setCurrentTest(null);
      setAnswers({});
      setMarkedForReview(new Set());
      setShuffledOrder([]);
      setCurrentQuestionIndex(0);
      setStudentActiveTab('results');
      setView("student");
      
      const attemptsData = await api("attempts");
      setAttempts(attemptsData);
    } catch (error: any) {
      alert(error.message || "Failed to submit test");
    }
  }, [currentTest, user, answers, shuffledOrder]);

  useEffect(() => {
    if (currentTest && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            submitTest();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentTest, timeLeft, submitTest]);

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setUsers([]);
    setTests([]);
    setAttempts([]);
    setMaterials([]);
    setView('login');
    setCurrentTest(null);
    setAnswers({});
    setMarkedForReview(new Set());
    setShuffledOrder([]);
    setCurrentQuestionIndex(0);
  };

  const startTest = (test: Test) => {
    const order = test.questions.map((_, idx) => idx);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    
    setCurrentTest(test);
    setAnswers({});
    setMarkedForReview(new Set());
    setShuffledOrder(order);
    setCurrentQuestionIndex(0);
    setTimeLeft(test.duration * 60);
    setView('taking-test');
  };

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

  return (
    <>
      {!user && view === 'login' && (
        <LoginView 
          onLoginSuccess={(token, userData) => {
            setUser(userData);
            setView(userData.role);
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
          answers={answers} 
          markedForReview={markedForReview} 
          shuffledOrder={shuffledOrder} 
          currentQuestionIndex={currentQuestionIndex} 
          timeLeft={timeLeft} 
          onAnswerChange={(idx, ans) => setAnswers({...answers, [idx]: ans})} 
          onMarkReview={() => {
            const newReview = new Set(markedForReview);
            if (newReview.has(currentQuestionIndex)) {
              newReview.delete(currentQuestionIndex);
            } else {
              newReview.add(currentQuestionIndex);
            }
            setMarkedForReview(newReview);
          }} 
          onClearAnswer={() => {
            const newAnswers = {...answers};
            delete newAnswers[currentQuestionIndex];
            setAnswers(newAnswers);
          }} 
          onPrevious={() => {
            if (currentQuestionIndex > 0) setCurrentQuestionIndex(currentQuestionIndex - 1);
          }} 
          onNext={() => {
            if (currentQuestionIndex < currentTest.questions.length - 1) setCurrentQuestionIndex(currentQuestionIndex + 1);
          }} 
          onSubmit={submitTest} 
          onGoToQuestion={setCurrentQuestionIndex} 
        />
      )}
    </>
  );
};

export default QuizPlatform;