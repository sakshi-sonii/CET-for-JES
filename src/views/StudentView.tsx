import React from 'react';
import { Award, LogOut, FileText, BookOpen, ChevronDown } from 'lucide-react';
import type { User, Test, Course, Material, Attempt } from '../types';

interface StudentViewProps {
  user: User;
  tests: Test[];
  courses: Course[];
  materials: Material[];
  attempts: Attempt[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onStartTest: (test: Test) => void;
  onLogout: () => void;
}

const StudentView: React.FC<StudentViewProps> = ({
  user,
  tests,
  courses,
  materials,
  attempts,
  activeTab,
  onTabChange,
  onStartTest,
  onLogout,
}) => {
  const studentCourse = courses.find(c => c.id === user!.course);
  const availableTests = tests.filter(t => t.approved && t.active && t.course === user!.course);
  const myAttempts = attempts.filter(a => {
    const sid: any = (a as any).studentId;
    const sidStr = typeof sid === 'string' ? sid : (sid?._id || sid?.id);
    return String(sidStr) === String(user!.id);
  });
  const availableMaterials = materials.filter(m => m.course === user!.course);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-8 h-8 text-indigo-600" />
              <span className="text-xl font-bold">Student Portal</span>
            </div>
            <p className="text-sm text-gray-600">{studentCourse?.name || 'No course assigned'}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Welcome, {user?.name}</span>
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5" />Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-4 mb-6 overflow-x-auto">
          {['tests', 'results', 'materials'].map(tab => (
            <button 
              key={tab} 
              onClick={() => onTabChange(tab)} 
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap transition ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'tests' && (
          <div className="space-y-4">
            {availableTests.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No active tests available</p>
              </div>
            ) : (
              availableTests.map(t => {
                const alreadyAttempted = myAttempts.some(a => a.testId === t.id);
                return (
                  <div key={t.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-bold">{t.title}</h3>
                        <p className="text-gray-600">{t.subject}</p>
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            ⏱️ {t.duration} min
                          </span>
                          <span className="flex items-center gap-1">
                            📝 {t.questions.length} questions
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => onStartTest(t)} 
                        disabled={alreadyAttempted}
                        className={`px-6 py-2 rounded-lg font-medium ${
                          alreadyAttempted 
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {alreadyAttempted ? 'Already Attempted' : 'Start Test'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-4">
            {myAttempts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No test attempts yet</p>
              </div>
            ) : (
              myAttempts.map(a => {
                const rawTestId: any = (a as any).testId;
                const testIdStr = typeof rawTestId === 'string' ? rawTestId : (rawTestId?._id || rawTestId?.id);
                const test = tests.find(t => t.id === testIdStr);
                if (!test) return null;
                
                const percentage = ((a.score / a.total) * 100).toFixed(1);
                const order = a.shuffledOrder || [];
                
                return (
                  <div key={a.id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-xl font-bold">{test.title}</h3>
                        <p className="text-gray-600">{test.subject}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          Submitted: {new Date(a.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${
                          parseFloat(percentage) >= 70 ? 'text-green-600' : 
                          parseFloat(percentage) >= 40 ? 'text-yellow-600' : 'text-red-600'
                        }`}>{percentage}%</p>
                        <p className="text-gray-600">{a.score}/{a.total} correct</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                        <button 
                          type="button"
                          className="w-full text-left font-medium text-blue-900 flex items-center justify-between hover:text-blue-700"
                          onClick={(e) => {
                            const parent = (e.target as HTMLElement).closest('.answer-section');
                            if (parent) {
                              const details = parent.querySelector('.answer-details');
                              if (details) {
                                details.classList.toggle('hidden');
                              }
                            }
                          }}
                        >
                          <span>📋 View Answers & Explanations ({order.length} questions)</span>
                          <ChevronDown className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="answer-section">
                        <div className="answer-details hidden space-y-4 max-h-96 overflow-y-auto">
                          {order.map((originalIdx, shuffledIdx) => {
                            const q = test.questions[originalIdx];
                            const userAnswer = a.answers[shuffledIdx];
                            const isCorrect = userAnswer === q.correct;

                            return (
                              <div 
                                key={shuffledIdx} 
                                className={`p-4 rounded-lg border-2 ${
                                  isCorrect 
                                    ? 'border-green-300 bg-green-50' 
                                    : 'border-red-300 bg-red-50'
                                }`}
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <p className="font-bold text-gray-900">Q{shuffledIdx + 1}. {q.question}</p>
                                  <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ml-2 ${
                                    isCorrect ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                                  }`}>
                                    {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                                  </span>
                                </div>

                                {q.questionImage && (
                                  <img 
                                    src={q.questionImage} 
                                    alt="Question" 
                                    className="h-40 mb-3 rounded border border-gray-300" 
                                  />
                                )}
                                
                                <div className="space-y-2 mb-3">
                                  <p className="text-xs font-semibold text-gray-700 uppercase">Answer Options:</p>
                                  {q.options.map((opt, idx) => {
                                    const isUserAnswer = idx === userAnswer;
                                    const isCorrectAnswer = idx === q.correct;

                                    return (
                                      <div 
                                        key={idx} 
                                        className={`p-3 rounded border-l-4 ${
                                          isCorrectAnswer
                                            ? 'border-l-green-600 bg-green-100 border border-green-300'
                                            : isUserAnswer && !isCorrectAnswer
                                            ? 'border-l-red-600 bg-red-100 border border-red-300'
                                            : 'border-l-gray-400 bg-gray-100 border border-gray-300'
                                        }`}
                                      >
                                        <div className="flex items-start gap-3">
                                          <span className="font-bold text-gray-700 w-6">{String.fromCharCode(65 + idx)})</span>
                                          <div className="flex-1">
                                            <p className="text-gray-800">{opt}</p>
                                            {q.optionImages?.[idx] && (
                                              <img 
                                                src={q.optionImages[idx]} 
                                                alt={`Option ${String.fromCharCode(65 + idx)}`} 
                                                className="h-24 mt-2 rounded border border-gray-400" 
                                              />
                                            )}
                                          </div>
                                          <div className="flex gap-1">
                                            {isCorrectAnswer && (
                                              <span className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold">
                                                Correct
                                              </span>
                                            )}
                                            {isUserAnswer && !isCorrectAnswer && (
                                              <span className="px-2 py-1 bg-red-600 text-white rounded text-xs font-bold">
                                                Your Answer
                                              </span>
                                            )}
                                            {isUserAnswer && isCorrectAnswer && (
                                              <span className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold">
                                                Your Answer ✓
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {q.explanation && (
                                  <div className="mt-3 p-3 bg-blue-100 rounded-lg border border-blue-300">
                                    <p className="text-sm font-bold text-blue-900 mb-1">💡 Explanation:</p>
                                    <p className="text-sm text-blue-900">{q.explanation}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="space-y-4">
            {availableMaterials.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No study materials available</p>
              </div>
            ) : (
              availableMaterials.map(m => (
                <div key={m.id} className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-bold mb-2">{m.title}</h3>
                  <p className="text-gray-600 mb-2">{m.subject} | {m.type}</p>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {m.type === 'notes' ? (
                      <p className="text-gray-700 whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <a 
                        href={m.content} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-indigo-600 hover:underline"
                      >
                        Open {m.type}
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentView;
