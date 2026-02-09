import React, { useState } from 'react';
import { Award, LogOut, FileText, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import type { User, Test, Course, Material, TestSubmission } from '../types';

interface StudentViewProps {
  user: User;
  tests: Test[];
  courses: Course[];
  materials: Material[];
  attempts: TestSubmission[];
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
  const [expandedAttempts, setExpandedAttempts] = useState<Set<string>>(new Set());
  const [expandedSection, setExpandedSection] = useState<string>('physics');

  const toggleAttempt = (attemptId: string) => {
    const newExpanded = new Set(expandedAttempts);
    if (newExpanded.has(attemptId)) {
      newExpanded.delete(attemptId);
    } else {
      newExpanded.add(attemptId);
    }
    setExpandedAttempts(newExpanded);
  };

  const studentCourse = courses.find(c => c._id === user.course);
  const availableTests = tests.filter(t => t.approved && t.active && t.course === user.course);

  const myAttempts = attempts.filter(a => {
    const sid: any = a.studentId;
    const sidStr = typeof sid === 'string' ? sid : (sid?._id);
    return String(sidStr) === String(user._id);
  });

  const availableMaterials = materials.filter(m => {
    const matCourse = typeof m.course === 'string' ? m.course : m.course?._id;
    return matCourse === user.course;
  });

  // Helper to get total questions from sections
  const getTotalQuestions = (test: Test): number => {
    if (!test.sections) return 0;
    return test.sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
  };

  // Helper to get total marks from sections
  const getTotalMarks = (test: Test): number => {
    if (!test.sections) return 0;
    return test.sections.reduce((sum, s) => {
      const marks = s.marksPerQuestion || (s.subject === 'maths' ? 2 : 1);
      return sum + (s.questions?.length || 0) * marks;
    }, 0);
  };

  const getSectionBadgeColor = (subject: string) => {
    switch (subject) {
      case 'physics': return 'bg-blue-100 text-blue-800';
      case 'chemistry': return 'bg-green-100 text-green-800';
      case 'maths': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSectionBorderColor = (subject: string) => {
    switch (subject) {
      case 'physics': return 'border-blue-200 bg-blue-50';
      case 'chemistry': return 'border-green-200 bg-green-50';
      case 'maths': return 'border-purple-200 bg-purple-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getSectionHeaderColor = (subject: string) => {
    switch (subject) {
      case 'physics': return 'text-blue-800';
      case 'chemistry': return 'text-green-800';
      case 'maths': return 'text-purple-800';
      default: return 'text-gray-800';
    }
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 70) return 'text-green-600';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

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
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'results' && myAttempts.length > 0 && (
                <span className="ml-2 bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full">
                  {myAttempts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ======================== TESTS TAB ======================== */}
        {activeTab === 'tests' && (
          <div className="space-y-4">
            {availableTests.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No active tests available</p>
              </div>
            ) : (
              availableTests.map(t => {
                const alreadyAttempted = myAttempts.some(a => {
                  const rawTestId: any = a.testId;
                  const testIdStr = typeof rawTestId === 'string' ? rawTestId : rawTestId?._id;
                  return testIdStr === t._id;
                });

                const totalQuestions = getTotalQuestions(t);
                const totalMarks = getTotalMarks(t);

                return (
                  <div key={t._id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold">{t.title}</h3>

                        {/* Section breakdown */}
                        {t.sections && t.sections.length > 0 && (
                          <div className="mt-3">
                            <div className="flex flex-wrap gap-2 mb-2">
                              {t.sections.map((section) => (
                                <span
                                  key={section.subject}
                                  className={`px-3 py-1 rounded-full text-xs font-medium ${getSectionBadgeColor(
                                    section.subject
                                  )}`}
                                >
                                  {section.subject.charAt(0).toUpperCase() + section.subject.slice(1)}
                                  : {section.questions?.length || 0}Q × {section.marksPerQuestion || (section.subject === 'maths' ? 2 : 1)}m
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Timing and totals */}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            ⏱️ {t.totalDuration || 180} min total
                          </span>
                          <span className="flex items-center gap-1">
                            📝 {totalQuestions} questions
                          </span>
                          <span className="flex items-center gap-1">
                            🏆 {totalMarks} marks
                          </span>
                        </div>

                        {/* Timing breakdown */}
                        <div className="mt-2 text-xs text-gray-400">
                          Part 1: Physics + Chemistry — {t.sectionTimings?.physicsChemistry || 90} min
                          &nbsp;|&nbsp;
                          Part 2: Maths — {t.sectionTimings?.maths || 90} min
                        </div>
                      </div>

                      <button
                        onClick={() => onStartTest(t)}
                        disabled={alreadyAttempted}
                        className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap ml-4 ${
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

        {/* ======================== RESULTS TAB ======================== */}
        {activeTab === 'results' && (
          <div className="space-y-4">
            {myAttempts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No test attempts yet</p>
              </div>
            ) : (
              myAttempts.map(a => {
                const rawTestId: any = a.testId;
                const testIdStr = typeof rawTestId === 'string' ? rawTestId : rawTestId?._id;
                const testTitle = typeof rawTestId === 'object' && rawTestId?.title
                  ? rawTestId.title
                  : tests.find(t => t._id === testIdStr)?.title || 'Test';

                const isExpanded = expandedAttempts.has(a._id);
                const sectionResults = a.sectionResults || [];
                const percentage = a.percentage || 0;

                return (
                  <div key={a._id} className="bg-white rounded-lg shadow p-6">
                    {/* Header with score */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold">{testTitle}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Submitted: {new Date(a.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${getScoreColor(percentage)}`}>
                          {percentage}%
                        </p>
                        <p className="text-gray-600">
                          {a.totalScore}/{a.totalMaxScore} marks
                        </p>
                      </div>
                    </div>

                    {/* Section-wise score summary */}
                    {sectionResults.length > 0 && (
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {sectionResults.map((sr) => {
                          const sectionPct = sr.maxScore > 0
                            ? Math.round((sr.score / sr.maxScore) * 100)
                            : 0;

                          return (
                            <div
                              key={sr.subject}
                              className={`border rounded-lg p-3 ${getSectionBorderColor(sr.subject)}`}
                            >
                              <h4 className={`font-semibold capitalize text-sm ${getSectionHeaderColor(sr.subject)}`}>
                                {sr.subject}
                              </h4>
                              <p className={`text-lg font-bold ${getScoreColor(sectionPct)}`}>
                                {sr.score}/{sr.maxScore}
                              </p>
                              <p className="text-xs text-gray-500">
                                {sr.questions?.length || 0}Q × {sr.marksPerQuestion}m | {sectionPct}%
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* View Answers & Explanations toggle */}
                    <div className="border-t pt-4">
                      <button
                        type="button"
                        onClick={() => toggleAttempt(a._id)}
                        className="w-full p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                      >
                        <div className="flex items-center justify-between text-blue-900 font-medium">
                          <span>📋 View Answers & Explanations</span>
                          {isExpanded
                            ? <ChevronUp className="w-5 h-5" />
                            : <ChevronDown className="w-5 h-5" />
                          }
                        </div>
                      </button>

                      {isExpanded && sectionResults.length > 0 && (
                        <div className="mt-4">
                          {/* Section tabs */}
                          <div className="flex border-b mb-4">
                         {sectionResults.map((sr) => (
  <button
    key={sr.subject}
    onClick={() => setExpandedSection(sr.subject)}
    className={`px-5 py-3 font-medium text-sm transition-colors capitalize ${
      expandedSection === sr.subject
        ? `border-b-2 border-indigo-600 text-indigo-700`
        : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    {sr.subject} ({sr.score}/{sr.maxScore})
  </button>
))}
                          </div>

                          {/* Questions for the active section */}
                          {sectionResults
                            .filter(sr => sr.subject === expandedSection)
                            .map(sr => (
                              <div key={sr.subject} className="space-y-4 max-h-[600px] overflow-y-auto">
                                {/* Section header */}
                                <div className={`p-3 rounded-lg border ${getSectionBorderColor(sr.subject)}`}>
                                  <p className={`font-semibold capitalize ${getSectionHeaderColor(sr.subject)}`}>
                                    {sr.subject} — {sr.score}/{sr.maxScore} marks
                                    <span className="font-normal text-sm ml-2">
                                      ({sr.marksPerQuestion} mark{sr.marksPerQuestion > 1 ? 's' : ''} per question)
                                    </span>
                                  </p>
                                </div>

                                {sr.questions?.map((q, qIdx) => (
                                  <div
                                    key={qIdx}
                                    className={`p-5 rounded-lg border-2 ${
                                      q.isCorrect
                                        ? 'border-green-400 bg-green-50'
                                        : q.studentAnswer === null || q.studentAnswer === undefined
                                        ? 'border-orange-300 bg-orange-50'
                                        : 'border-red-400 bg-red-50'
                                    }`}
                                  >
                                    {/* Question header */}
                                    <div className="flex items-start justify-between mb-3">
                                      <p className="font-bold text-gray-900 flex-1">
                                        Q{qIdx + 1}. {q.question}
                                      </p>
                                      <span
                                        className={`px-3 py-1 rounded text-sm font-bold whitespace-nowrap ml-2 ${
                                          q.isCorrect
                                            ? 'bg-green-200 text-green-900'
                                            : q.studentAnswer === null || q.studentAnswer === undefined
                                            ? 'bg-orange-200 text-orange-900'
                                            : 'bg-red-200 text-red-900'
                                        }`}
                                      >
                                        {q.isCorrect
                                          ? `✓ Correct +${q.marksAwarded}`
                                          : q.studentAnswer === null || q.studentAnswer === undefined
                                          ? '⚠ Not Attempted'
                                          : '✗ Incorrect'
                                        }
                                        <span className="ml-1 text-xs">
                                          ({q.marksAwarded}/{q.marksPerQuestion})
                                        </span>
                                      </span>
                                    </div>

                                    {/* Options */}
                                    <div className="space-y-2 mb-4">
                                      {q.options?.map((opt, optIdx) => {
                                        const isStudentAnswer = optIdx === q.studentAnswer;
                                        const isCorrectAnswer = optIdx === q.correctAnswer;
                                        const isWrongStudentAnswer = isStudentAnswer && !q.isCorrect;

                                        let borderStyle = 'bg-gray-50 border-gray-200';
                                        if (isCorrectAnswer) {
                                          borderStyle = 'bg-green-50 border-green-500';
                                        }
                                        if (isWrongStudentAnswer) {
                                          borderStyle = 'bg-red-50 border-red-500';
                                        }

                                        return (
                                          <div
                                            key={optIdx}
                                            className={`p-3 rounded-lg border-2 ${borderStyle}`}
                                          >
                                            <div className="flex items-start gap-3">
                                              <span className="font-bold text-gray-800 min-w-[2rem]">
                                                {String.fromCharCode(65 + optIdx)})
                                              </span>
                                              <p className="text-gray-900 flex-1">{opt}</p>
                                              <div className="flex flex-col gap-1 items-end">
                                                {isCorrectAnswer && (
                                                  <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-bold">
                                                    ✓ Correct Answer
                                                  </span>
                                                )}
                                                {isStudentAnswer && isCorrectAnswer && (
                                                  <span className="px-2 py-0.5 bg-green-700 text-white rounded-full text-xs font-bold">
                                                    ✓ Your Answer
                                                  </span>
                                                )}
                                                {isWrongStudentAnswer && (
                                                  <span className="px-2 py-0.5 bg-red-600 text-white rounded-full text-xs font-bold">
                                                    ✗ Your Answer
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Summary line */}
                                    <div className="text-xs text-gray-500 flex flex-wrap gap-4 mb-3">
                                      <span>
                                        Your answer:{' '}
                                        <strong>
                                          {q.studentAnswer !== null && q.studentAnswer !== undefined
                                            ? String.fromCharCode(65 + q.studentAnswer)
                                            : 'Not answered'}
                                        </strong>
                                      </span>
                                      <span>
                                        Correct answer:{' '}
                                        <strong>{String.fromCharCode(65 + q.correctAnswer)}</strong>
                                      </span>
                                      <span>
                                        Marks: <strong>{q.marksAwarded}/{q.marksPerQuestion}</strong>
                                      </span>
                                    </div>

                                    {/* Explanation */}
                                    {q.explanation && (
                                      <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
                                        <p className="text-sm font-bold text-blue-900 mb-1">
                                          💡 Explanation:
                                        </p>
                                        <p className="text-sm text-blue-900 leading-relaxed">
                                          {q.explanation}
                                        </p>
                                      </div>
                                    )}

                                    {/* No explanation notice */}
                                    {!q.explanation && (
                                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <p className="text-xs text-gray-400 italic">
                                          No explanation provided for this question.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ======================== MATERIALS TAB ======================== */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
            {availableMaterials.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No study materials available</p>
              </div>
            ) : (
              availableMaterials.map(m => (
                <div key={m._id} className="bg-white rounded-lg shadow p-6">
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