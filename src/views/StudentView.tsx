import React, { useState } from 'react';
import { Award, LogOut, FileText, BookOpen, ChevronDown, ChevronUp, Clock, Lock, Eye, EyeOff } from 'lucide-react';
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

const getSubjectLabel = (subject: string): string => {
  switch (subject) {
    case 'physics': return 'Physics';
    case 'chemistry': return 'Chemistry';
    case 'maths': return 'Mathematics';
    case 'biology': return 'Biology';
    default: return subject.charAt(0).toUpperCase() + subject.slice(1);
  }
};

const getSectionBadgeColor = (subject: string) => {
  switch (subject) {
    case 'physics': return 'bg-blue-100 text-blue-800';
    case 'chemistry': return 'bg-green-100 text-green-800';
    case 'maths': return 'bg-purple-100 text-purple-800';
    case 'biology': return 'bg-orange-100 text-orange-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getSectionBorderColor = (subject: string) => {
  switch (subject) {
    case 'physics': return 'border-blue-200 bg-blue-50';
    case 'chemistry': return 'border-green-200 bg-green-50';
    case 'maths': return 'border-purple-200 bg-purple-50';
    case 'biology': return 'border-orange-200 bg-orange-50';
    default: return 'border-gray-200 bg-gray-50';
  }
};

const getSectionHeaderColor = (subject: string) => {
  switch (subject) {
    case 'physics': return 'text-blue-800';
    case 'chemistry': return 'text-green-800';
    case 'maths': return 'text-purple-800';
    case 'biology': return 'text-orange-800';
    default: return 'text-gray-800';
  }
};

const getSectionTabActiveColor = (subject: string) => {
  switch (subject) {
    case 'physics': return 'border-blue-600 text-blue-700';
    case 'chemistry': return 'border-green-600 text-green-700';
    case 'maths': return 'border-purple-600 text-purple-700';
    case 'biology': return 'border-orange-600 text-orange-700';
    default: return 'border-indigo-600 text-indigo-700';
  }
};

const getMarksPerQuestion = (subject: string, section?: any): number => {
  if (section?.marksPerQuestion) return section.marksPerQuestion;
  return subject === 'maths' ? 2 : 1;
};

const getScoreColor = (percentage: number) => {
  if (percentage >= 70) return 'text-green-600';
  if (percentage >= 40) return 'text-yellow-600';
  return 'text-red-600';
};

const getScoreBgColor = (percentage: number) => {
  if (percentage >= 70) return 'bg-green-50 border-green-200';
  if (percentage >= 40) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
};

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
  
  // Group chunked tests together
  const groupedTests = (() => {
    const groups = new Map<string, Test[]>();
    const processed = new Set<string>();

    for (const test of tests) {
      if (processed.has(test._id)) continue;

      if (test.parentTestId) {
        // This is a chunk, find its parent group
        const groupKey = test.parentTestId;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(test);
        processed.add(test._id);
      } else if (test.chunkInfo && test.chunkInfo.total > 1) {
        // This is the first chunk/parent of a group
        const groupKey = test._id;
        const groupTests = [test];
        
        // Find all chunks for this parent
        for (const otherTest of tests) {
          if (otherTest.parentTestId === test._id) {
            groupTests.push(otherTest);
            processed.add(otherTest._id);
          }
        }
        
        // Sort by chunk current number
        groupTests.sort((a, b) => {
          const aChunk = a.chunkInfo?.current ?? 0;
          const bChunk = b.chunkInfo?.current ?? 0;
          return aChunk - bChunk;
        });

        groups.set(groupKey, groupTests);
        processed.add(test._id);
      } else {
        // Standalone test
        groups.set(test._id, [test]);
        processed.add(test._id);
      }
    }

    return groups;
  })();

  // Helper to combine sections from multiple tests (chunks)
  const getCombinedSections = (testGroup: Test[]): any[] => {
    const combinedSections: any[] = [];
    const sectionMap = new Map<string, any>();

    for (const test of testGroup) {
      for (const section of test.sections || []) {
        if (!sectionMap.has(section.subject)) {
          sectionMap.set(section.subject, {
            subject: section.subject,
            marksPerQuestion: section.marksPerQuestion,
            questions: [],
          });
        }
        sectionMap.get(section.subject).questions.push(...(section.questions || []));
      }
    }

    return Array.from(sectionMap.values());
  };

  const availableTests = Array.from(groupedTests.values())
    .map(testGroup => {
      const primaryTest = testGroup[0];
      // Create a merged test object for display
      return {
        ...primaryTest,
        sections: getCombinedSections(testGroup),
        _isChunkedTest: testGroup.length > 1,
        _testChunks: testGroup,
      };
    })
    .filter(t => t.approved && t.active && t.course === user.course);

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
      const marks = getMarksPerQuestion(s.subject, s);
      return sum + (s.questions?.length || 0) * marks;
    }, 0);
  };

  // Get total duration for display
  const getTotalDuration = (test: Test): number => {
    if (test.testType === 'mock') {
      const pc = test.sectionTimings?.physicsChemistry ?? 90;
      const mb = test.sectionTimings?.mathsOrBiology ?? 90;
      return pc + mb;
    }
    if (test.testType === 'custom') {
      return test.customDuration ?? 60;
    }
    // Legacy fallback
    return 180;
  };

  // Get timing description for test card
  const getTimingDescription = (test: Test): React.ReactNode => {
    if (test.testType === 'mock') {
      const pc = test.sectionTimings?.physicsChemistry ?? 90;
      const mb = test.sectionTimings?.mathsOrBiology ?? 90;
      const phase2Label = test.stream === 'PCB' ? 'Biology' : 'Mathematics';
      return (
        <div className="mt-2 text-xs text-gray-400 space-y-0.5">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Part 1: Physics + Chemistry — {pc} min (auto-submits, no going back)</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Part 2: {phase2Label} — {mb} min</span>
          </div>
        </div>
      );
    }
    if (test.testType === 'custom') {
      const subjects = test.sections?.map(s => getSubjectLabel(s.subject)).join(', ') || '';
      return (
        <div className="mt-2 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{test.customDuration ?? 60} min — {subjects}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Get test type badge
  const getTestTypeBadge = (test: Test): React.ReactNode => {
    if (test.testType === 'mock') {
      return (
        <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
          Mock Test {test.stream && `(${test.stream})`}
        </span>
      );
    }
    if (test.testType === 'custom') {
      return (
        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
          Custom Test
        </span>
      );
    }
    // Legacy
    if (test.sections && test.sections.length === 1) {
      return (
        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
          Subject Test
        </span>
      );
    }
    return null;
  };

  // Check if answer key is visible for a test
  const isAnswerKeyVisible = (testOrSubmission: Test | TestSubmission): boolean => {
    // Check from submission's canViewAnswerKey
    if ('canViewAnswerKey' in testOrSubmission && testOrSubmission.canViewAnswerKey !== undefined) {
      return testOrSubmission.canViewAnswerKey;
    }

    // Check from the test's showAnswerKey
    if ('showAnswerKey' in testOrSubmission) {
      return testOrSubmission.showAnswerKey;
    }

    // Try to find the test and check
    if ('testId' in testOrSubmission) {
      const rawTestId: any = testOrSubmission.testId;
      if (typeof rawTestId === 'object' && rawTestId?.showAnswerKey !== undefined) {
        return rawTestId.showAnswerKey;
      }
      const testIdStr = typeof rawTestId === 'string' ? rawTestId : rawTestId?._id;
      const foundTest = tests.find(t => t._id === testIdStr);
      if (foundTest) {
        return foundTest.showAnswerKey;
      }
    }

    // Default: hidden
    return false;
  };

  // Get the test object from a submission
  const getTestFromSubmission = (submission: TestSubmission): Test | undefined => {
    const rawTestId: any = submission.testId;
    if (typeof rawTestId === 'object' && rawTestId?._id) {
      return rawTestId as Test;
    }
    const testIdStr = typeof rawTestId === 'string' ? rawTestId : rawTestId?._id;
    return tests.find(t => t._id === testIdStr);
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
                  
                  // Check if this attempt is for any chunk in this test group
                  if ((t as any)._isChunkedTest && (t as any)._testChunks) {
                    return (t as any)._testChunks.some((chunk: Test) => chunk._id === testIdStr);
                  }
                  
                  return testIdStr === t._id;
                });

                const totalQuestions = getTotalQuestions(t);
                const totalMarks = getTotalMarks(t);
                const totalDuration = getTotalDuration(t);

                return (
                  <div key={t._id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold">{t.title}</h3>
                          {getTestTypeBadge(t)}
                          {(t as any)._isChunkedTest && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                              Multi-part Test ({(t as any)._testChunks?.length || 0} sections)
                            </span>
                          )}
                        </div>

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
                                  {getSubjectLabel(section.subject)}
                                  : {section.questions?.length || 0}Q × {getMarksPerQuestion(section.subject, section)}m
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Timing and totals */}
                        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {totalDuration} min total
                          </span>
                          <span className="flex items-center gap-1">
                            📝 {totalQuestions} questions
                          </span>
                          <span className="flex items-center gap-1">
                            🏆 {totalMarks} marks
                          </span>
                        </div>

                        {/* Timing breakdown */}
                        {getTimingDescription(t)}

                        {/* Multi-part test note */}
                        {(t as any)._isChunkedTest && (
                          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                            <span className="font-semibold">ℹ️ Multi-part Test:</span> This test is divided into {(t as any)._testChunks?.length || 0} parts. Once you start, all parts are combined into one continuous experience. You must complete all parts in one session.
                          </div>
                        )}

                        {/* Mock test warning */}
                        {t.testType === 'mock' && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                            <Lock className="w-3 h-3 inline mr-1" />
                            <strong>Note:</strong> Physics & Chemistry will auto-submit when their time expires.
                            You cannot return to them after moving to{' '}
                            {t.stream === 'PCB' ? 'Biology' : 'Mathematics'}.
                            You may also submit them early.
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => onStartTest(t)}
                        disabled={alreadyAttempted}
                        className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap ml-4 shrink-0 ${
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

                const testObj = getTestFromSubmission(a);
                const answerKeyVisible = isAnswerKeyVisible(a);
                const isExpanded = expandedAttempts.has(a._id);
                const sectionResults = a.sectionResults || [];
                const percentage = a.percentage || 0;

                // Get test type info
                const testType = testObj?.testType;
                const streamLabel = testObj?.stream;

                return (
                  <div key={a._id} className="bg-white rounded-lg shadow p-6">
                    {/* Header with score */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold">{testTitle}</h3>
                          {testType === 'mock' && (
                            <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                              Mock {streamLabel && `(${streamLabel})`}
                            </span>
                          )}
                          {testType === 'custom' && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          Submitted: {new Date(a.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className={`text-right p-3 rounded-lg border ${getScoreBgColor(percentage)}`}>
                        <p className={`text-3xl font-bold ${getScoreColor(percentage)}`}>
                          {percentage}%
                        </p>
                        <p className="text-gray-600 text-sm">
                          {a.totalScore}/{a.totalMaxScore} marks
                        </p>
                      </div>
                    </div>

                    {/* Section-wise score summary */}
                    {sectionResults.length > 0 && (
                      <div className={`grid gap-3 mb-4 ${
                        sectionResults.length === 1
                          ? 'grid-cols-1'
                          : sectionResults.length === 2
                          ? 'grid-cols-2'
                          : sectionResults.length === 3
                          ? 'grid-cols-3'
                          : 'grid-cols-2 md:grid-cols-4'
                      }`}>
                        {sectionResults.map((sr) => {
                          const sectionPct = sr.maxScore > 0
                            ? Math.round((sr.score / sr.maxScore) * 100)
                            : 0;

                          return (
                            <div
                              key={sr.subject}
                              className={`border rounded-lg p-3 ${getSectionBorderColor(sr.subject)}`}
                            >
                              <h4 className={`font-semibold text-sm ${getSectionHeaderColor(sr.subject)}`}>
                                {getSubjectLabel(sr.subject)}
                              </h4>
                              <p className={`text-lg font-bold ${getScoreColor(sectionPct)}`}>
                                {sr.score}/{sr.maxScore}
                              </p>
                              <p className="text-xs text-gray-500">
                                {sr.correctCount !== undefined && sr.incorrectCount !== undefined ? (
                                  <>
                                    ✓{sr.correctCount} ✗{sr.incorrectCount} ○{sr.unansweredCount || 0}
                                  </>
                                ) : (
                                  <>
                                    {sr.questions?.length || 0}Q × {sr.marksPerQuestion}m
                                  </>
                                )}
                                {' | '}{sectionPct}%
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Answer Key Section */}
                    <div className="border-t pt-4">
                      {answerKeyVisible ? (
                        <>
                          {/* Answer key toggle button */}
                          <button
                            type="button"
                            onClick={() => toggleAttempt(a._id)}
                            className="w-full p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                          >
                            <div className="flex items-center justify-between text-blue-900 font-medium">
                              <span className="flex items-center gap-2">
                                <Eye className="w-4 h-4" />
                                📋 View Answers & Explanations
                              </span>
                              {isExpanded
                                ? <ChevronUp className="w-5 h-5" />
                                : <ChevronDown className="w-5 h-5" />
                              }
                            </div>
                          </button>

                          {/* Expanded answer key content */}
                          {isExpanded && sectionResults.length > 0 && (
                            <div className="mt-4">
                              {/* Section tabs */}
                              <div className="flex border-b mb-4 overflow-x-auto">
                                {sectionResults.map((sr) => (
                                  <button
                                    key={sr.subject}
                                    onClick={() => setExpandedSection(sr.subject)}
                                    className={`px-5 py-3 font-medium text-sm transition-colors whitespace-nowrap ${
                                      expandedSection === sr.subject
                                        ? `border-b-2 ${getSectionTabActiveColor(sr.subject)}`
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                  >
                                    {getSubjectLabel(sr.subject)} ({sr.score}/{sr.maxScore})
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
                                      <p className={`font-semibold ${getSectionHeaderColor(sr.subject)}`}>
                                        {getSubjectLabel(sr.subject)} — {sr.score}/{sr.maxScore} marks
                                        <span className="font-normal text-sm ml-2">
                                          ({sr.marksPerQuestion} mark{sr.marksPerQuestion > 1 ? 's' : ''} per question)
                                        </span>
                                      </p>
                                      {sr.correctCount !== undefined && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          ✓ Correct: {sr.correctCount} | ✗ Incorrect: {sr.incorrectCount} | ○ Unanswered: {sr.unansweredCount || 0}
                                        </p>
                                      )}
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
                                        <div className="flex items-start justify-between mb-3 gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900">
                                              Q{qIdx + 1}. {q.question}
                                            </p>
                                            {q.questionImage && (
                                              <img
                                                src={q.questionImage}
                                                alt="Question"
                                                className="mt-2 max-h-48 rounded-lg border"
                                              />
                                            )}
                                          </div>
                                          <span
                                            className={`px-3 py-1 rounded text-sm font-bold whitespace-nowrap shrink-0 ${
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
                                                  <span className="font-bold text-gray-800 min-w-[2rem] shrink-0">
                                                    {String.fromCharCode(65 + optIdx)})
                                                  </span>
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-gray-900">{opt}</p>
                                                    {q.optionImages?.[optIdx] && (
                                                      <img
                                                        src={q.optionImages[optIdx]}
                                                        alt={`Option ${String.fromCharCode(65 + optIdx)}`}
                                                        className="mt-2 max-h-24 rounded border"
                                                      />
                                                    )}
                                                  </div>
                                                  <div className="flex flex-col gap-1 items-end shrink-0">
                                                    {isCorrectAnswer && (
                                                      <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-bold">
                                                        ✓ Correct
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
                                            {q.explanationImage && (
                                              <img
                                                src={q.explanationImage}
                                                alt="Explanation"
                                                className="mt-2 max-h-48 rounded border"
                                              />
                                            )}
                                          </div>
                                        )}

                                        {/* No explanation notice */}
                                        {!q.explanation && !q.explanationImage && (
                                          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <p className="text-xs text-gray-400 italic">
                                              No explanation provided for this question.
                                            </p>
                                          </div>
                                        )}

                                        {/* Explanation image only */}
                                        {!q.explanation && q.explanationImage && (
                                          <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-300">
                                            <p className="text-sm font-bold text-blue-900 mb-1">
                                              💡 Explanation:
                                            </p>
                                            <img
                                              src={q.explanationImage}
                                              alt="Explanation"
                                              className="mt-1 max-h-48 rounded border"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </>
                      ) : (
                        /* Answer key NOT visible - show locked message */
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3 text-gray-500">
                            <div className="p-2 bg-gray-200 rounded-full">
                              <EyeOff className="w-5 h-5 text-gray-500" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-700">
                                Answer Key & Explanations Locked
                              </p>
                              <p className="text-sm text-gray-500">
                                Your teacher has not yet released the answer key for this test.
                                You will be able to view correct answers and explanations once they are made available.
                              </p>
                            </div>
                            <Lock className="w-5 h-5 text-gray-400 shrink-0" />
                          </div>
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
