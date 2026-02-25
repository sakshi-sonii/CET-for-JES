import React, { useState, useEffect } from 'react';
import { LogOut, Save, ChevronDown, ChevronUp } from 'lucide-react';
import type { User, Test, Course, TestSection, Question } from '../types';
import { api } from '../api';

interface CoordinatorViewProps {
  user: User;
  tests: Test[];
  courses: Course[];
  onLogout: () => void;
  onTestsUpdate: (tests: Test[]) => void;
}

type SubjectKey = 'physics' | 'chemistry' | 'maths' | 'biology';

interface TeacherQuestionsBank {
  teacherId: string;
  teacherName: string;
  subject: SubjectKey;
  testId: string;
  testTitle: string;
  questions: Question[];
}

const ALL_SUBJECTS: { key: SubjectKey; label: string; color: string; bgColor: string }[] = [
  { key: 'physics', label: 'Physics', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { key: 'chemistry', label: 'Chemistry', color: 'text-green-700', bgColor: 'bg-green-100' },
  { key: 'maths', label: 'Mathematics', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { key: 'biology', label: 'Biology', color: 'text-orange-700', bgColor: 'bg-orange-100' },
];

const getSubjectInfo = (key: string) => ALL_SUBJECTS.find(s => s.key === key) || ALL_SUBJECTS[0];
const getSubjectLabel = (key: string) => getSubjectInfo(key).label;

interface DraftComposedTest {
  title: string;
  course: string;
  testType: 'mock' | 'custom';
  stream?: 'PCM' | 'PCB';
  selectedQuestions: {
    subject: SubjectKey;
    sourceTeacherId: string;
    sourceTestId: string;
    questionIndices: number[];
  }[];
  customDuration: number;
  showAnswerKey: boolean;
}

const CoordinatorView: React.FC<CoordinatorViewProps> = ({
  user,
  tests,
  courses,
  onLogout,
  onTestsUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'compose' | 'manage'>('compose');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [teacherQuestions, setTeacherQuestions] = useState<TeacherQuestionsBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [expandedTeachers, setExpandedTeachers] = useState<Set<string>>(new Set());

  const [draftTest, setDraftTest] = useState<DraftComposedTest>({
    title: '',
    course: '',
    testType: 'custom',
    stream: 'PCM',
    selectedQuestions: [],
    customDuration: 60,
    showAnswerKey: false,
  });

  const [creatingTest, setCreatingTest] = useState(false);

  const myTests = tests.filter(t => t.coordinatorId === user._id || (typeof t.coordinatorId === 'object' && t.coordinatorId?._id === user._id));
  const pendingApproval = myTests.filter(t => !t.approved);

  // Fetch teacher questions when course changes
  useEffect(() => {
    if (selectedCourse) {
      loadTeacherQuestions(selectedCourse);
    }
  }, [selectedCourse]);

  const loadTeacherQuestions = async (courseId: string) => {
    setLoading(true);
    setError('');
    try {
      // Fetch teacher questions (question banks) from coordinator endpoint
      const courseTests = (await api(`subjects/questions?courseId=${courseId}`, 'GET')) || [];

      // Organize by teacher and subject
      const bankMap = new Map<string, TeacherQuestionsBank>();

      for (const test of courseTests) {
        for (const section of test.sections || []) {
          const key = `${test.teacherId}_${section.subject}`;
          if (!bankMap.has(key)) {
            const teacherName = typeof test.teacherId === 'object' 
              ? test.teacherId.name || 'Unknown'
              : 'Unknown';
            
            bankMap.set(key, {
              teacherId: typeof test.teacherId === 'object' ? test.teacherId._id : test.teacherId,
              teacherName,
              subject: section.subject as SubjectKey,
              testId: test._id,
              testTitle: test.title,
              questions: section.questions || [],
            });
          }
        }
      }

      setTeacherQuestions(Array.from(bankMap.values()));
    } catch (err: any) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const toggleTeacherExpanded = (teacherId: string, subject: SubjectKey) => {
    const key = `${teacherId}_${subject}`;
    const newExpanded = new Set(expandedTeachers);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedTeachers(newExpanded);
  };

  const selectQuestionsFromBank = (bank: TeacherQuestionsBank, questionIndices: number[]) => {
    const existing = draftTest.selectedQuestions.find(
      sq => sq.sourceTestId === bank.testId && sq.subject === bank.subject
    );

    let updated: typeof draftTest.selectedQuestions;
    if (existing) {
      updated = draftTest.selectedQuestions.map(sq =>
        sq === existing ? { ...sq, questionIndices } : sq
      );
    } else {
      updated = [
        ...draftTest.selectedQuestions,
        {
          subject: bank.subject,
          sourceTeacherId: bank.teacherId,
          sourceTestId: bank.testId,
          questionIndices,
        },
      ];
    }

    setDraftTest({ ...draftTest, selectedQuestions: updated });
  };

  const handleSubmitTest = async () => {
    if (!draftTest.title.trim()) {
      setError('Test title is required');
      return;
    }
    if (!selectedCourse) {
      setError('Please select a course');
      return;
    }
    if (draftTest.selectedQuestions.length === 0) {
      setError('Please select at least one subject with questions');
      return;
    }

    setCreatingTest(true);
    setError('');

    try {
      // Build sections from selected questions
      const sections: TestSection[] = [];
      const subjectsMap = new Map<SubjectKey, Question[]>();

      for (const sq of draftTest.selectedQuestions) {
        const bank = teacherQuestions.find(
          tq => tq.testId === sq.sourceTestId && tq.subject === sq.subject
        );
        if (!bank) continue;

        const selected = sq.questionIndices.map(idx => bank.questions[idx]);
        if (!subjectsMap.has(sq.subject)) {
          subjectsMap.set(sq.subject, []);
        }
        subjectsMap.get(sq.subject)!.push(...selected);
      }

      for (const [subject, questions] of subjectsMap) {
        sections.push({
          subject,
          marksPerQuestion: subject === 'maths' ? 2 : 1,
          questions,
        });
      }

      const payload: any = {
        title: draftTest.title.trim(),
        course: selectedCourse,
        testType: draftTest.testType,
        sections,
        showAnswerKey: draftTest.showAnswerKey,
      };

      if (draftTest.testType === 'mock') {
        payload.stream = draftTest.stream;
        payload.sectionTimings = { physicsChemistry: 90, mathsOrBiology: 90 };
      } else {
        payload.customDuration = draftTest.customDuration;
      }

      const newTest = await api('tests', 'POST', payload);
      
      onTestsUpdate([...tests, newTest]);
      setDraftTest({
        title: '',
        course: selectedCourse,
        testType: 'custom',
        stream: 'PCM',
        selectedQuestions: [],
        customDuration: 60,
        showAnswerKey: false,
      });
      setError('Test created successfully and sent for approval');
      setTimeout(() => setError(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create test');
    } finally {
      setCreatingTest(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-md border-b border-blue-200">
        <div className="max-w-7xl mx-auto flex justify-between items-center p-4">
          <h1 className="text-2xl font-bold text-blue-800">📋 Coordinator Dashboard</h1>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <LogOut size={20} /> Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white rounded-lg shadow-sm p-2">
          <button
            onClick={() => setActiveTab('compose')}
            className={`px-6 py-2 rounded-md font-semibold transition-colors ${
              activeTab === 'compose'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Compose Test
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-6 py-2 rounded-md font-semibold transition-colors ${
              activeTab === 'manage'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            My Tests ({pendingApproval.length})
          </button>
        </div>

        {error && (
          <div className={`p-4 rounded-lg mb-6 ${
            error.includes('successfully')
              ? 'bg-green-100 border border-green-400 text-green-800'
              : 'bg-red-100 border border-red-400 text-red-800'
          }`}>
            {error}
          </div>
        )}

        {/* Compose Tab */}
        {activeTab === 'compose' && (
          <div className="space-y-4">
            {/* Course Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Step 1: Select Course</h2>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a Course --</option>
                {courses.map(course => (
                  <option key={course._id} value={course._id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCourse && (
              <>
                {/* Available Questions */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold mb-4">Step 2: Select Questions from Teachers</h2>
                  
                  {loading && <p className="text-gray-600">Loading questions...</p>}
                  
                  {!loading && teacherQuestions.length === 0 && (
                    <p className="text-gray-500">No questions available from teachers for this course</p>
                  )}

                  {!loading && teacherQuestions.length > 0 && (
                    <div className="space-y-3">
                      {teacherQuestions.map((bank) => {
                        const key = `${bank.teacherId}_${bank.subject}`;
                        const isExpanded = expandedTeachers.has(key);
                        const selected = draftTest.selectedQuestions.find(
                          sq => sq.sourceTestId === bank.testId && sq.subject === bank.subject
                        );

                        return (
                          <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleTeacherExpanded(bank.teacherId, bank.subject)}
                              className="w-full p-4 bg-gray-50 hover:bg-gray-100 flex justify-between items-center"
                            >
                              <div className="text-left">
                                <p className="font-semibold text-gray-800">
                                  {bank.teacherName} - {getSubjectLabel(bank.subject)}
                                </p>
                                <p className="text-sm text-gray-600">{bank.testTitle}</p>
                                <p className="text-xs text-gray-500">{bank.questions.length} questions available</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {selected && (
                                  <span className="text-sm bg-green-100 text-green-800 px-3 py-1 rounded-full">
                                    {selected.questionIndices.length} selected
                                  </span>
                                )}
                                {isExpanded ? <ChevronUp /> : <ChevronDown />}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="p-4 bg-white border-t border-gray-200 space-y-3">
                                {bank.questions.map((q, idx) => {
                                  const isSelected = selected?.questionIndices.includes(idx);
                                  return (
                                    <label key={idx} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isSelected || false}
                                        onChange={() => {
                                          const newIndices = isSelected
                                            ? (selected?.questionIndices.filter(i => i !== idx) || [])
                                            : [...(selected?.questionIndices || []), idx];
                                          selectQuestionsFromBank(bank, newIndices);
                                        }}
                                        className="mt-1"
                                      />
                                      <div className="flex-1 text-sm">
                                        <p className="font-medium">{q.question || '(Image question)'}</p>
                                        <p className="text-gray-600">Options: {q.options.length}</p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Test Configuration */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-bold mb-4">Step 3: Configure Test</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block font-medium mb-2">Test Title</label>
                      <input
                        type="text"
                        value={draftTest.title}
                        onChange={(e) => setDraftTest({ ...draftTest, title: e.target.value })}
                        placeholder="e.g., Mock Test - January 2025"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block font-medium mb-2">Test Type</label>
                      <select
                        value={draftTest.testType}
                        onChange={(e) => setDraftTest({ ...draftTest, testType: e.target.value as 'mock' | 'custom' })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="custom">Custom (Single Timer)</option>
                        <option value="mock">Mock (Two-Phase: Math/Bio)</option>
                      </select>
                    </div>

                    {draftTest.testType === 'custom' && (
                      <div>
                        <label className="block font-medium mb-2">Duration (minutes)</label>
                        <input
                          type="number"
                          value={draftTest.customDuration}
                          onChange={(e) => setDraftTest({ ...draftTest, customDuration: parseInt(e.target.value) || 60 })}
                          min="1"
                          max="600"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showAnswerKey"
                        checked={draftTest.showAnswerKey}
                        onChange={(e) => setDraftTest({ ...draftTest, showAnswerKey: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="showAnswerKey" className="font-medium">
                        Show Answer Key to Students
                      </label>
                    </div>

                    <button
                      onClick={handleSubmitTest}
                      disabled={creatingTest || draftTest.selectedQuestions.length === 0}
                      className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2 font-semibold"
                    >
                      <Save size={20} /> {creatingTest ? 'Creating...' : 'Create & Submit for Approval'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Manage Tab */}
        {activeTab === 'manage' && (
          <div className="space-y-4">
            {pendingApproval.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
                No tests pending approval
              </div>
            ) : (
              pendingApproval.map((test) => (
                <div key={test._id} className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold">{test.title}</h3>
                      <p className="text-sm text-gray-600">Created: {new Date(test.createdAt || '').toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full font-semibold">
                      Pending Admin Approval
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {test.sections.map((section, idx) => (
                      <div key={idx} className={`p-3 rounded-lg ${getSubjectInfo(section.subject).bgColor}`}>
                        <p className="font-semibold">{getSubjectLabel(section.subject)}</p>
                        <p className="text-sm">{section.questions.length} questions</p>
                      </div>
                    ))}
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

export default CoordinatorView;
