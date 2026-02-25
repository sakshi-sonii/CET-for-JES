import React, { useState, useEffect } from 'react';
import { LogOut, Save, ChevronDown, ChevronUp, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import type { User, Test, Course, Question } from '../types';
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
  sectionTimings: {
    physicsChemistry: number;
    mathsOrBiology: number;
  };
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
    sectionTimings: {
      physicsChemistry: 90,
      mathsOrBiology: 90,
    },
    selectedQuestions: [],
    customDuration: 60,
    showAnswerKey: false,
  });

  const [creatingTest, setCreatingTest] = useState(false);
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedCoordinatorTests, setExpandedCoordinatorTests] = useState<Set<string>>(new Set());
  const [expandedTeacherSubmissions, setExpandedTeacherSubmissions] = useState<Set<string>>(new Set());

  const myTests = tests.filter(t => t.coordinatorId === user._id || (typeof t.coordinatorId === 'object' && t.coordinatorId?._id === user._id));
  const pendingApproval = myTests.filter(t => !t.approved);
  const teacherSubmissions = tests.filter(t => !!t.teacherId && !t.approved);
  const pendingTeacherReview = teacherSubmissions.filter(
    t => t.reviewStatus !== 'accepted_by_coordinator'
  );

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
      // Fetch all tests and filter for teacher-submitted tests in this course
      const allTests = (await api('tests', 'GET')) || [];

      // Filter for tests that have a teacherId and match the selected course
      const availableTests = allTests.filter((test: any) => {
        return test.teacherId && test.course === courseId;
      });

      // Organize by teacher and subject
      const bankMap = new Map<string, TeacherQuestionsBank>();

      for (const test of availableTests) {
        for (const section of test.sections || []) {
          const key = `${test.teacherId}_${section.subject}`;
          if (!bankMap.has(key)) {
            const teacherName = typeof test.teacherId === 'object' 
              ? (test.teacherId.name || '')
              : '';
            
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

  // Helper function to get payload size in bytes
  const getPayloadSize = (payload: any): number => {
    return new Blob([JSON.stringify(payload)]).size;
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
    if (draftTest.testType === 'custom' && (!draftTest.customDuration || draftTest.customDuration < 1)) {
      setError('Custom test duration must be at least 1 minute');
      return;
    }
    if (
      draftTest.testType === 'mock' &&
      (
        !draftTest.sectionTimings.physicsChemistry ||
        draftTest.sectionTimings.physicsChemistry < 1 ||
        !draftTest.sectionTimings.mathsOrBiology ||
        draftTest.sectionTimings.mathsOrBiology < 1
      )
    ) {
      setError('Both mock phase timings must be at least 1 minute');
      return;
    }

    setCreatingTest(true);
    setError('');

    try {
      // Flatten questions with subject metadata
      const flatQuestions: (Question & { subject: SubjectKey })[] = [];
      const subjectsIncluded = new Set<SubjectKey>();

      for (const sq of draftTest.selectedQuestions) {
        const bank = teacherQuestions.find(
          tq => tq.testId === sq.sourceTestId && tq.subject === sq.subject
        );
        if (!bank) continue;

        subjectsIncluded.add(sq.subject);
        for (const idx of sq.questionIndices) {
          flatQuestions.push({
            ...bank.questions[idx],
            subject: sq.subject,
          });
        }
      }

      const testTitle = draftTest.title.trim();
      const CHUNK_SIZE_LIMIT = 3.5 * 1024 * 1024; // 3.5 MB in bytes

      // Build payload with flat questions
      const buildPayload = (questions: (Question & { subject: SubjectKey })[], title: string): any => {
        const payload: any = {
          title,
          course: selectedCourse,
          testType: draftTest.testType,
          flatQuestions: questions,
          subjectsIncluded: Array.from(subjectsIncluded),
          showAnswerKey: draftTest.showAnswerKey,
        };

        if (draftTest.testType === 'mock') {
          payload.stream = draftTest.stream;
          payload.sectionTimings = {
            physicsChemistry: draftTest.sectionTimings.physicsChemistry,
            mathsOrBiology: draftTest.sectionTimings.mathsOrBiology,
          };
        } else {
          payload.customDuration = draftTest.customDuration;
        }

        return payload;
      };

      // Check initial payload size
      const initialPayload = buildPayload(flatQuestions, testTitle);
      const payloadSize = getPayloadSize(initialPayload);

      const createdTests: any[] = [];
      let parentTestId: string | null = null;

      if (payloadSize <= CHUNK_SIZE_LIMIT) {
        // Payload fits, send as is
        const newTest = await api('tests', 'POST', initialPayload);
        createdTests.push(newTest);
      } else {
        // Split into chunks by questions
        setError(`Test size (${(payloadSize / 1024 / 1024).toFixed(2)} MB) exceeds limit, splitting into multiple parts...`);
        
        const chunks: (Question & { subject: SubjectKey })[][] = [];
        let currentChunk: (Question & { subject: SubjectKey })[] = [];

        for (let qIdx = 0; qIdx < flatQuestions.length; qIdx++) {
          const question = flatQuestions[qIdx];
          const testChunk = [...currentChunk, question];
          const testPayload = buildPayload(testChunk, testTitle);
          const chunkSize = getPayloadSize(testPayload);

          if (chunkSize <= CHUNK_SIZE_LIMIT) {
            currentChunk.push(question);
          } else {
            // Current chunk is full, save it
            if (currentChunk.length > 0) {
              chunks.push(currentChunk);
            }
            currentChunk = [question];
          }
        }

        // Save final chunk
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
        }

        const totalChunks = chunks.length;
        console.log(`Splitting test into ${totalChunks} chunks`);

        for (let i = 0; i < chunks.length; i++) {
          const chunkTitle = totalChunks > 1 ? `${testTitle} (Part ${i + 1}/${totalChunks})` : testTitle;
          const chunkPayload = buildPayload(chunks[i], chunkTitle);
          const chunkSize = getPayloadSize(chunkPayload);

          console.log(`Chunk ${i + 1}/${totalChunks} size: ${(chunkSize / 1024 / 1024).toFixed(2)} MB`);

          if (chunkSize > CHUNK_SIZE_LIMIT) {
            throw new Error(
              `Chunk ${i + 1} is still too large (${(chunkSize / 1024 / 1024).toFixed(2)} MB). ` +
              `Consider reducing the number of image questions or file size of images.`
            );
          }

          // Mark as chunk for backend
          chunkPayload.isChunk = true;
          chunkPayload.chunkIndex = i;
          chunkPayload.totalChunks = totalChunks;

          if (i > 0 && parentTestId) {
            chunkPayload.parentTestId = parentTestId;
          }

          const newTest = await api('tests', 'POST', chunkPayload);
          createdTests.push(newTest);

          if (i === 0 && totalChunks > 1) {
            parentTestId = newTest._id;
            await api(`tests?testId=${encodeURIComponent(newTest._id)}`, 'PATCH', {
              chunkInfo: { current: 1, total: totalChunks },
            });
          } else if (i > 0 && parentTestId) {
            await api(`tests?testId=${encodeURIComponent(newTest._id)}`, 'PATCH', {
              chunkInfo: { current: i + 1, total: totalChunks },
            });
          }

          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      onTestsUpdate([...tests, ...createdTests]);
      setDraftTest({
        title: '',
        course: selectedCourse,
        testType: 'custom',
        stream: 'PCM',
        sectionTimings: {
          physicsChemistry: 90,
          mathsOrBiology: 90,
        },
        selectedQuestions: [],
        customDuration: 60,
        showAnswerKey: false,
      });
      
      const successMsg = createdTests.length > 1 
        ? `Test created successfully in ${createdTests.length} parts and sent for approval`
        : 'Test created successfully and sent for approval';
      
      setError(successMsg);
      setTimeout(() => setError(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create test');
    } finally {
      setCreatingTest(false);
    }
  };

  const handleReviewSubmission = async (testId: string, decision: 'accept' | 'return') => {
    try {
      if (decision === 'return' && !reviewComment[testId]?.trim()) {
        setError('Please add a comment before sending back to teacher');
        return;
      }

      setActionLoading(`${decision}-${testId}`);
      await api(`tests?testId=${encodeURIComponent(testId)}&action=review`, 'PATCH', {
        decision,
        comment: reviewComment[testId] || '',
      });
      const testsData = await api('tests');
      onTestsUpdate(testsData);
      if (decision === 'accept') {
        setReviewComment(prev => ({ ...prev, [testId]: '' }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to review submission');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (testId: string, currentActive: boolean) => {
    try {
      setActionLoading(`active-${testId}`);
      await api(`tests?testId=${encodeURIComponent(testId)}`, 'PATCH', { active: !currentActive });
      const testsData = await api('tests');
      onTestsUpdate(testsData);
    } catch (err: any) {
      setError(err.message || 'Failed to update active status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAnswerKey = async (testId: string, currentShowAnswerKey: boolean) => {
    try {
      setActionLoading(`answer-${testId}`);
      await api(`tests?testId=${encodeURIComponent(testId)}`, 'PATCH', {
        showAnswerKey: !currentShowAnswerKey,
      });
      const testsData = await api('tests');
      onTestsUpdate(testsData);
    } catch (err: any) {
      setError(err.message || 'Failed to update answer key visibility');
    } finally {
      setActionLoading(null);
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
            Review & Tests ({pendingTeacherReview.length + pendingApproval.length})
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
                                  {bank.teacherName ? `${bank.teacherName} - ` : ''}{getSubjectLabel(bank.subject)}
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
                                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                  <input
                                    type="checkbox"
                                    checked={selected?.questionIndices.length === bank.questions.length && bank.questions.length > 0}
                                    onChange={() => {
                                      if (selected?.questionIndices.length === bank.questions.length) {
                                        selectQuestionsFromBank(bank, []);
                                      } else {
                                        const allIndices = bank.questions.map((_, idx) => idx);
                                        selectQuestionsFromBank(bank, allIndices);
                                      }
                                    }}
                                    className="w-4 h-4"
                                  />
                                  <label className="font-semibold text-blue-700 cursor-pointer flex-1">
                                    Select All ({bank.questions.length} questions)
                                  </label>
                                </div>

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

                    {draftTest.testType === 'mock' && (
                      <>
                        <div>
                          <label className="block font-medium mb-2">Mock Stream</label>
                          <select
                            value={draftTest.stream || 'PCM'}
                            onChange={(e) => setDraftTest({ ...draftTest, stream: e.target.value as 'PCM' | 'PCB' })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="PCM">PCM (Maths in Phase 2)</option>
                            <option value="PCB">PCB (Biology in Phase 2)</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-medium mb-2">Phase 1 (Physics + Chemistry) minutes</label>
                            <input
                              type="number"
                              min="1"
                              max="600"
                              value={draftTest.sectionTimings.physicsChemistry}
                              onChange={(e) =>
                                setDraftTest({
                                  ...draftTest,
                                  sectionTimings: {
                                    ...draftTest.sectionTimings,
                                    physicsChemistry: Math.max(1, parseInt(e.target.value) || 90),
                                  },
                                })
                              }
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block font-medium mb-2">
                              Phase 2 ({draftTest.stream === 'PCB' ? 'Biology' : 'Maths'}) minutes
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="600"
                              value={draftTest.sectionTimings.mathsOrBiology}
                              onChange={(e) =>
                                setDraftTest({
                                  ...draftTest,
                                  sectionTimings: {
                                    ...draftTest.sectionTimings,
                                    mathsOrBiology: Math.max(1, parseInt(e.target.value) || 90),
                                  },
                                })
                              }
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </>
                    )}

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
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold mb-4">Teacher Submissions for Review ({pendingTeacherReview.length})</h3>
              {pendingTeacherReview.length === 0 ? (
                <p className="text-gray-600">No teacher submissions pending review.</p>
              ) : (
                <div className="space-y-4">
                  {pendingTeacherReview.map((test) => {
                    const isExpanded = expandedTeacherSubmissions.has(test._id);
                    return (
                    <div key={test._id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="font-semibold">{test.title}</p>
                          <p className="text-xs text-gray-500">
                            {test.reviewStatus === 'changes_requested' ? 'Resubmitted after feedback' : 'Pending coordinator review'}
                          </p>
                          {!!test.reviewComment && (
                            <p className="text-sm text-red-700 mt-2 bg-red-50 border border-red-200 rounded p-2">
                              Coordinator feedback: {test.reviewComment}
                            </p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          test.reviewStatus === 'changes_requested'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {test.reviewStatus === 'changes_requested' ? 'Changes Requested' : 'Coordinator Review'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                        {test.sections.map((section, idx) => (
                          <div key={idx} className={`p-2 rounded ${getSubjectInfo(section.subject).bgColor}`}>
                            <span className="font-medium">{getSubjectLabel(section.subject)}</span>
                            <span className="text-sm text-gray-700 ml-2">{section.questions.length} questions</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3">
                        <button
                          onClick={() => {
                            const next = new Set(expandedTeacherSubmissions);
                            if (next.has(test._id)) {
                              next.delete(test._id);
                            } else {
                              next.add(test._id);
                            }
                            setExpandedTeacherSubmissions(next);
                          }}
                          className="px-3 py-2 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 inline-flex items-center gap-1 text-sm"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          {isExpanded ? 'Hide Preview' : 'Preview'}
                        </button>
                      </div>

                      {isExpanded && test.sections && (
                        <div className="mt-4 border-t pt-4">
                          {test.sections.map((section) => section && (
                            <div key={section.subject} className="mb-4">
                              <h4 className={`font-semibold text-sm uppercase tracking-wide mb-2 ${getSubjectInfo(section.subject).color}`}>
                                {getSubjectLabel(section.subject)} ({section.questions?.length || 0}Q x {section.marksPerQuestion}m)
                              </h4>
                              <div className="space-y-2 pl-4">
                                {section.questions?.map((q, qIdx) => q && (
                                  <div key={qIdx} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                                    <p className="font-medium text-gray-800">
                                      Q{qIdx + 1}. {q.question}
                                      {!q.question && q.questionImage && <span className="text-gray-400 italic">(Image question)</span>}
                                    </p>
                                    {q.questionImage && (
                                      <img src={q.questionImage} alt="Question" className="mt-1 max-h-20 rounded border" />
                                    )}
                                    <div className="flex flex-wrap gap-3 mt-1 text-gray-600">
                                      {q.options?.map((opt, optIdx) => (
                                        <span key={optIdx} className={optIdx === q.correct ? 'text-green-700 font-semibold' : ''}>
                                          {String.fromCharCode(65 + optIdx)}. {opt || (q.optionImages?.[optIdx] ? '(image)' : '(empty)')}{optIdx === q.correct && ' ✓'}
                                        </span>
                                      ))}
                                    </div>
                                    {q.explanation && <p className="text-xs text-blue-600 mt-1">Tip: {q.explanation}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea
                        value={reviewComment[test._id] || ''}
                        onChange={(e) => setReviewComment(prev => ({ ...prev, [test._id]: e.target.value }))}
                        placeholder="Comment for teacher (required when sending back)"
                        className="w-full mt-3 px-3 py-2 border rounded-lg text-sm"
                        rows={2}
                      />

                      <div className="flex gap-2 mt-3">
                        <button
                          disabled={!!actionLoading}
                          onClick={() => handleReviewSubmission(test._id, 'accept')}
                          className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1"
                        >
                          <CheckCircle size={16} /> Accept
                        </button>
                        <button
                          disabled={!!actionLoading}
                          onClick={() => handleReviewSubmission(test._id, 'return')}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-1"
                        >
                          <XCircle size={16} /> Send Back
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold mb-4">Coordinator Tests</h3>
              {myTests.length === 0 ? (
                <p className="text-gray-600">No coordinator tests created yet.</p>
              ) : (
                <div className="space-y-4">
                  {myTests.map((test) => {
                    const isExpanded = expandedCoordinatorTests.has(test._id);
                    return (
                      <div key={test._id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="font-semibold">{test.title}</p>
                            <p className="text-xs text-gray-500">Created: {new Date(test.createdAt || '').toLocaleDateString()}</p>
                          </div>
                          <div className="flex gap-2">
                            <span className={`text-xs px-2 py-1 rounded font-semibold ${
                              test.approved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {test.approved ? 'Approved by Admin' : 'Pending Admin Approval'}
                            </span>
                            {test.approved && (
                              <span className={`text-xs px-2 py-1 rounded font-semibold ${
                                test.active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {test.active ? 'Active' : 'Inactive'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                          {test.sections.map((section, idx) => (
                            <div key={idx} className={`p-2 rounded ${getSubjectInfo(section.subject).bgColor}`}>
                              <span className="font-medium">{getSubjectLabel(section.subject)}</span>
                              <span className="text-sm text-gray-700 ml-2">{section.questions.length} questions</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedCoordinatorTests);
                              if (newExpanded.has(test._id)) {
                                newExpanded.delete(test._id);
                              } else {
                                newExpanded.add(test._id);
                              }
                              setExpandedCoordinatorTests(newExpanded);
                            }}
                            className="px-3 py-2 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 inline-flex items-center gap-1 text-sm"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {isExpanded ? 'Hide Preview' : 'Preview'}
                          </button>
                          <button
                            disabled={!test.approved || !!actionLoading}
                            onClick={() => handleToggleActive(test._id, test.active)}
                            className={`px-4 py-2 rounded text-white disabled:opacity-60 ${
                              test.active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            {actionLoading === `active-${test._id}` ? '...' : test.active ? 'Deactivate Access' : 'Activate Access'}
                          </button>
                          <button
                            disabled={!!actionLoading}
                            onClick={() => handleToggleAnswerKey(test._id, test.showAnswerKey)}
                            className={`px-4 py-2 rounded border disabled:opacity-60 inline-flex items-center gap-1 ${
                              test.showAnswerKey
                                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            {actionLoading === `answer-${test._id}` ? '...' : test.showAnswerKey ? <><EyeOff size={16} /> Hide Answer Key</> : <><Eye size={16} /> Show Answer Key</>}
                          </button>
                        </div>

                        {isExpanded && test.sections && (
                          <div className="mt-4 border-t pt-4">
                            {test.sections.map((section) => section && (
                              <div key={section.subject} className="mb-4">
                                <h4 className={`font-semibold text-sm uppercase tracking-wide mb-2 ${getSubjectInfo(section.subject).color}`}>
                                  {getSubjectLabel(section.subject)} ({section.questions?.length || 0}Q × {section.marksPerQuestion}m)
                                </h4>
                                <div className="space-y-2 pl-4">
                                  {section.questions?.map((q, qIdx) => q && (
                                    <div key={qIdx} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                                      <p className="font-medium text-gray-800">
                                        Q{qIdx + 1}. {q.question}
                                        {!q.question && q.questionImage && <span className="text-gray-400 italic">(Image question)</span>}
                                      </p>
                                      {q.questionImage && (
                                        <img src={q.questionImage} alt="Question" className="mt-1 max-h-20 rounded border" />
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoordinatorView;
