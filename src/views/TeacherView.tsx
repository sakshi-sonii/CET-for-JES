import React, { useState, useRef } from 'react';
import { BookOpen, LogOut, Upload, ImageIcon, FileText, Trash2 } from 'lucide-react';
import type { User, Test, Course, Material, Question } from '../types';
import { api } from '../api';

interface TeacherViewProps {
  user: User;
  tests: Test[];
  courses: Course[];
  materials: Material[];
  onLogout: () => void;
  onTestsUpdate: (tests: Test[]) => void;
  onMaterialsUpdate: (materials: Material[]) => void;
}

interface SectionForm {
  subject: 'physics' | 'chemistry' | 'maths';
  questions: Question[];
}

const TeacherView: React.FC<TeacherViewProps> = ({
  user,
  tests,
  courses,
  materials,
  onLogout,
  onTestsUpdate,
  onMaterialsUpdate,
}) => {
  if (!user) return null;

  const [activeTab, setActiveTab] = useState('tests');

  // Test form — always 3 sections
  const [testTitle, setTestTitle] = useState('');
  const [testCourse, setTestCourse] = useState('');
  const [sections, setSections] = useState<SectionForm[]>([
    { subject: 'physics', questions: [] },
    { subject: 'chemistry', questions: [] },
    { subject: 'maths', questions: [] },
  ]);
  const [currentSection, setCurrentSection] = useState(0);

  const [questionForm, setQuestionForm] = useState({
    question: '',
    questionImage: '',
    options: ['', '', '', ''],
    optionImages: ['', '', '', ''],
    correct: 0,
    explanation: '',
  });

  const [materialForm, setMaterialForm] = useState({
    title: '',
    course: '',
    subject: '',
    content: '',
    type: 'notes' as 'notes' | 'video' | 'pdf',
  });

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  // const fileInputRef = useRef<HTMLInputElement>(null);
  const mockFileInputRef = useRef<HTMLInputElement>(null);
  const sectionFileInputRef = useRef<HTMLInputElement>(null);

  // ========================
  // Helpers
  // ========================
  const myTests = tests.filter(t => {
    const tid = typeof t.teacherId === 'string' ? t.teacherId : String(t.teacherId);
    const uid = String(user._id);
    return tid === uid;
  });

  const isMyMaterial = (m: Material) => {
    const mid = typeof m.teacherId === 'string'
      ? m.teacherId
      : typeof m.teacherId === 'object' && m.teacherId !== null
      ? (m.teacherId as any)._id || String(m.teacherId)
      : String(m.teacherId);
    return String(mid) === String(user._id);
  };

  const getTotalQuestions = (test: Test): number => {
    if (!test.sections) return 0;
    return test.sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
  };

  const getTotalMarks = (test: Test): number => {
    if (!test.sections) return 0;
    return test.sections.reduce((sum, s) => {
      const marks = s.marksPerQuestion || (s.subject === 'maths' ? 2 : 1);
      return sum + (s.questions?.length || 0) * marks;
    }, 0);
  };

  const sectionLabels: Record<string, string> = {
    physics: 'Physics',
    chemistry: 'Chemistry',
    maths: 'Mathematics',
  };

  const sectionColors: Record<string, string> = {
    physics: 'bg-blue-50 border-blue-200',
    chemistry: 'bg-green-50 border-green-200',
    maths: 'bg-purple-50 border-purple-200',
  };

  const sectionTabColors: Record<string, { active: string; inactive: string }> = {
    physics: { active: 'bg-blue-600 text-white', inactive: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    chemistry: { active: 'bg-green-600 text-white', inactive: 'bg-green-50 text-green-700 hover:bg-green-100' },
    maths: { active: 'bg-purple-600 text-white', inactive: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
  };

  const sectionBadgeColors: Record<string, string> = {
    physics: 'bg-blue-100 text-blue-800',
    chemistry: 'bg-green-100 text-green-800',
    maths: 'bg-purple-100 text-purple-800',
  };

  // ========================
  // Question management
  // ========================
  const addQuestion = () => {
    if (!questionForm.question || !questionForm.options.every(o => o.trim())) {
      alert('Please fill in the question and all 4 options');
      return;
    }

    const newQ: Question = {
      question: questionForm.question,
      questionImage: questionForm.questionImage || undefined,
      options: [...questionForm.options],
      optionImages: questionForm.optionImages.some(img => img)
        ? [...questionForm.optionImages]
        : undefined,
      correct: questionForm.correct,
      explanation: questionForm.explanation || undefined,
    };

    setSections(prev => {
      const updated = [...prev];
      updated[currentSection] = {
        ...updated[currentSection],
        questions: [...updated[currentSection].questions, newQ],
      };
      return updated;
    });

    setQuestionForm({
      question: '',
      questionImage: '',
      options: ['', '', '', ''],
      optionImages: ['', '', '', ''],
      correct: 0,
      explanation: '',
    });
  };

  const removeQuestion = (sectionIdx: number, questionIdx: number) => {
    setSections(prev => {
      const updated = [...prev];
      updated[sectionIdx] = {
        ...updated[sectionIdx],
        questions: updated[sectionIdx].questions.filter((_, i) => i !== questionIdx),
      };
      return updated;
    });
  };

  // ========================
  // Create test
  // ========================
  const createTest = async () => {
    // Auto-add current question if filled
    if (questionForm.question && questionForm.options.every(o => o.trim())) {
      addQuestion();
    }

    if (!testTitle.trim()) {
      alert('Please enter a test title');
      return;
    }
    if (!testCourse) {
      alert('Please select a course');
      return;
    }

    const totalQ = sections.reduce((sum, s) => sum + s.questions.length, 0);
    if (totalQ === 0) {
      alert('Please add at least one question to any section');
      return;
    }

    // Validate all 3 sections have questions
    const emptySections = sections.filter(s => s.questions.length === 0);
    if (emptySections.length > 0) {
      const names = emptySections.map(s => sectionLabels[s.subject]).join(', ');
      if (!confirm(`${names} section(s) have no questions. Continue anyway?`)) {
        return;
      }
    }

    setActionLoading('create');

    try {
      // Build payload matching the API format
      const payload = {
        title: testTitle,
        course: testCourse,
        sections: sections
          .filter(s => s.questions.length > 0)
          .map(s => ({
            subject: s.subject,
            questions: s.questions.map(q => ({
              question: q.question,
              options: q.options,
              correct: q.correct,
              explanation: q.explanation || '',
            })),
          })),
      };

      await api('tests', 'POST', payload);

      // Reset form
      setTestTitle('');
      setTestCourse('');
      setSections([
        { subject: 'physics', questions: [] },
        { subject: 'chemistry', questions: [] },
        { subject: 'maths', questions: [] },
      ]);
      setQuestionForm({
        question: '',
        questionImage: '',
        options: ['', '', '', ''],
        optionImages: ['', '', '', ''],
        correct: 0,
        explanation: '',
      });

      alert('Test created! Awaiting admin approval.');
      setActiveTab('tests');
      const testsData = await api('tests');
      onTestsUpdate(testsData);
    } catch (error: any) {
      alert(error.message || 'Failed to create test');
    } finally {
      setActionLoading(null);
    }
  };

  // ========================
  // Toggle active
  // ========================
  const handleToggleActive = async (testId: string, currentActive: boolean) => {
    setActionLoading(testId);
    try {
      await api(`tests/${testId}`, 'PATCH', { active: !currentActive });
      const testsData = await api('tests');
      onTestsUpdate(testsData);
    } catch (error: any) {
      alert(error.message || 'Failed to update test');
    }
    setActionLoading(null);
  };

  // ========================
  // File upload helpers
  // ========================
  const parseExcelQuestions = async (file: File): Promise<Question[]> => {
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    return jsonData.map((row: any) => {
      const correctRaw = row.Correct ?? row.correct ?? row.CorrectAnswer ?? 0;
      const correctNum = Number(correctRaw);
      const correct = isNaN(correctNum) ? 0 : Math.max(0, Math.min(3, correctNum - 1));

      return {
        question: String(row.Question || row.question || ''),
        questionImage: String(row.QuestionImage || row.questionImage || '') || undefined,
        options: [
          String(row.Option1 || row.option1 || ''),
          String(row.Option2 || row.option2 || ''),
          String(row.Option3 || row.option3 || ''),
          String(row.Option4 || row.option4 || ''),
        ],
        correct,
        explanation: String(row.Explanation || row.explanation || '') || undefined,
      };
    }).filter(q => q.question && q.options.every(o => o));
  };

  // Upload questions to current section
  const handleSectionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      alert('Please upload an Excel file (.xlsx or .xls)');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    try {
      const questions = await parseExcelQuestions(file);

      if (questions.length === 0) {
        alert('No valid questions found in the file');
        return;
      }

      setSections(prev => {
        const updated = [...prev];
        updated[currentSection] = {
          ...updated[currentSection],
          questions: [...updated[currentSection].questions, ...questions],
        };
        return updated;
      });

      alert(`Imported ${questions.length} questions to ${sectionLabels[sections[currentSection].subject]}!`);
    } catch (error: any) {
      alert('Failed to parse file: ' + (error?.message || String(error)));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // Upload full mock test (3 sheets: Physics, Chemistry, Mathematics)
  const handleMockTestFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      alert('Please upload an Excel file (.xlsx or .xls)');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      const sheetMap: Record<string, 'physics' | 'chemistry' | 'maths'> = {
        Physics: 'physics',
        Chemistry: 'chemistry',
        Mathematics: 'maths',
        Maths: 'maths',
        Math: 'maths',
      };

      const newSections: SectionForm[] = [
        { subject: 'physics', questions: [] },
        { subject: 'chemistry', questions: [] },
        { subject: 'maths', questions: [] },
      ];

      for (const sheetName of workbook.SheetNames) {
        const subject = sheetMap[sheetName];
        if (!subject) continue;

        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        const questions: Question[] = jsonData.map((row: any) => {
          const correctRaw = row.Correct ?? row.correct ?? row.CorrectAnswer ?? 0;
          const correctNum = Number(correctRaw);
          const correct = isNaN(correctNum) ? 0 : Math.max(0, Math.min(3, correctNum - 1));

          return {
            question: String(row.Question || row.question || ''),
            options: [
              String(row.Option1 || row.option1 || ''),
              String(row.Option2 || row.option2 || ''),
              String(row.Option3 || row.option3 || ''),
              String(row.Option4 || row.option4 || ''),
            ],
            correct,
            explanation: String(row.Explanation || row.explanation || '') || undefined,
          };
        }).filter(q => q.question && q.options.every(o => o));

        const sectionIdx = newSections.findIndex(s => s.subject === subject);
        if (sectionIdx !== -1) {
          newSections[sectionIdx].questions = questions;
        }
      }

      const totalQ = newSections.reduce((sum, s) => sum + s.questions.length, 0);
      if (totalQ === 0) {
        alert('No valid questions found. Make sure sheet names are: Physics, Chemistry, Mathematics');
        return;
      }

      setSections(newSections);
      alert(
        `Imported: Physics (${newSections[0].questions.length}), ` +
        `Chemistry (${newSections[1].questions.length}), ` +
        `Maths (${newSections[2].questions.length}) — Total: ${totalQ} questions`
      );
    } catch (error: any) {
      alert('Failed to parse file: ' + (error?.message || String(error)));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // ========================
  // CSV template download
  // ========================
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleSectionTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        ['Question', 'Option1', 'Option2', 'Option3', 'Option4', 'Correct', 'Explanation'],
        ['What is 2 + 2?', '2', '3', '4', '5', '3', '2 + 2 = 4'],
        ['Capital of France?', 'London', 'Berlin', 'Paris', 'Madrid', '3', 'Paris is the capital of France'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = { Sheets: { Questions: ws }, SheetNames: ['Questions'] };
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'section_template.xlsx');
    } catch {
      alert('Failed to create template');
    }
  };

  const downloadMockTestTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const headers = ['Question', 'Option1', 'Option2', 'Option3', 'Option4', 'Correct', 'Explanation'];

      const physicsData = [
        headers,
        ['What is the SI unit of force?', 'Joule', 'Newton', 'Watt', 'Pascal', '2', 'Newton is the SI unit of force'],
        ['Acceleration due to gravity is approx?', '9.8 m/s²', '10 m/s²', '8.9 m/s²', '11 m/s²', '1', 'g ≈ 9.8 m/s²'],
      ];
      const chemistryData = [
        headers,
        ['Atomic number of Carbon?', '5', '6', '7', '8', '2', 'Carbon has 6 protons'],
        ['Chemical formula of water?', 'H2O', 'CO2', 'O2', 'H2', '1', 'Water is H2O'],
      ];
      const mathsData = [
        headers,
        ['Value of π (approx)?', '3.14', '2.71', '1.41', '1.73', '1', 'π ≈ 3.14159'],
        ['Derivative of x²?', 'x', '2x', '3x', 'x³', '2', 'd/dx(x²) = 2x'],
      ];

      const wb = {
        Sheets: {
          Physics: XLSX.utils.aoa_to_sheet(physicsData),
          Chemistry: XLSX.utils.aoa_to_sheet(chemistryData),
          Mathematics: XLSX.utils.aoa_to_sheet(mathsData),
        },
        SheetNames: ['Physics', 'Chemistry', 'Mathematics'],
      };

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(
        new Blob([wbout], { type: 'application/octet-stream' }),
        'mock_test_template.xlsx'
      );
    } catch {
      alert('Failed to create template');
    }
  };

  // ========================
  // Image upload
  // ========================
  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'question' | 'option',
    optionIndex?: number
  ) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }
    try {
      const base64 = await convertImageToBase64(file);
      if (type === 'question') {
        setQuestionForm(prev => ({ ...prev, questionImage: base64 }));
      } else if (type === 'option' && optionIndex !== undefined) {
        setQuestionForm(prev => {
          const newImages = [...prev.optionImages];
          newImages[optionIndex] = base64;
          return { ...prev, optionImages: newImages };
        });
      }
    } catch {
      alert('Failed to upload image');
    }
  };

  // ========================
  // Current section data
  // ========================
  const currentQuestions = sections[currentSection].questions;
  const currentSubject = sections[currentSection].subject;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            <span className="text-xl font-bold">Teacher Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">Welcome, {user?.name}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab buttons */}
        <div className="flex gap-4 mb-6 overflow-x-auto">
          {['tests', 'create-test', 'materials'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab
                .split('-')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')}
            </button>
          ))}
        </div>

        {/* ======================== TESTS TAB ======================== */}
        {activeTab === 'tests' && (
          <div className="space-y-4">
            {myTests.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No tests created yet</p>
                <button
                  onClick={() => setActiveTab('create-test')}
                  className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create Your First Test
                </button>
              </div>
            ) : (
              myTests.map(t => (
                <div key={t._id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold">{t.title}</h3>

                      {/* Section badges */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {t.sections?.map(s => (
                          <span
                            key={s.subject}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              sectionBadgeColors[s.subject] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {sectionLabels[s.subject] || s.subject}: {s.questions?.length || 0}Q ×{' '}
                            {s.marksPerQuestion || (s.subject === 'maths' ? 2 : 1)}m
                          </span>
                        ))}
                      </div>

                      <p className="text-sm text-gray-500 mt-2">
                        {getTotalQuestions(t)} questions | {getTotalMarks(t)} marks |{' '}
                        {t.totalDuration || 180} min
                      </p>

                      <div className="text-xs text-gray-400 mt-1">
                        Phy+Chem: {t.sectionTimings?.physicsChemistry || 90} min | Maths:{' '}
                        {t.sectionTimings?.maths || 90} min
                      </div>

                      <div className="flex gap-2 mt-3">
                        <span
                          className={`px-3 py-1 rounded text-sm ${
                            t.approved
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {t.approved ? 'Approved' : 'Pending Approval'}
                        </span>
                        {t.approved && (
                          <span
                            className={`px-3 py-1 rounded text-sm ${
                              t.active
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {t.active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </div>
                    </div>

                    {t.approved && (
                      <button
                        disabled={actionLoading === t._id}
                        onClick={() => handleToggleActive(t._id, t.active)}
                        className={`px-4 py-2 rounded-lg disabled:opacity-60 whitespace-nowrap ml-4 ${
                          t.active
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {actionLoading === t._id
                          ? '...'
                          : t.active
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ======================== CREATE TEST TAB ======================== */}
        {activeTab === 'create-test' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Create Mock Test</h2>

            {/* Test info box */}
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-semibold text-yellow-800 mb-1">⏱ Test Structure</h3>
              <p className="text-sm text-yellow-700">
                <strong>Part 1:</strong> Physics + Chemistry — 90 minutes (combined)
                <br />
                <strong>Part 2:</strong> Mathematics — 90 minutes (unlocks after Part 1)
                <br />
                <strong>Marks:</strong> Physics & Chemistry = 1 mark/question | Mathematics = 2
                marks/question
                <br />
                <strong>Total:</strong> 180 minutes
              </p>
            </div>

            {/* Quick import full mock test */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Quick Import Full Mock Test
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Upload an Excel file with 3 sheets named: <strong>Physics</strong>,{' '}
                <strong>Chemistry</strong>, <strong>Mathematics</strong>.
                <br />
                Each sheet should have columns: Question, Option1, Option2, Option3, Option4,
                Correct (1-4), Explanation
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadMockTestTemplate}
                  className="px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50"
                >
                  📥 Download Mock Test Template
                </button>
                <button
                  type="button"
                  onClick={() => mockFileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingFile ? 'Uploading...' : 'Upload Mock Test File'}
                </button>
                <input
                  ref={mockFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleMockTestFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Title & Course */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Test Title *</label>
                <input
                  type="text"
                  placeholder="e.g., JEE Mock Test 1"
                  value={testTitle}
                  onChange={e => setTestTitle(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Course *</label>
                <select
                  value={testCourse}
                  onChange={e => setTestCourse(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="">Select Course</option>
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section tabs */}
            <div className="flex gap-2 mb-4">
              {sections.map((section, idx) => {
                const colors = sectionTabColors[section.subject];
                const isActive = currentSection === idx;
                return (
                  <button
                    key={section.subject}
                    onClick={() => setCurrentSection(idx)}
                    className={`px-5 py-3 rounded-lg font-medium text-sm transition ${
                      isActive ? colors.active : colors.inactive
                    }`}
                  >
                    {sectionLabels[section.subject]} ({section.questions.length}Q)
                    <span className="ml-1 text-xs opacity-75">
                      {section.subject === 'maths' ? '2m/Q' : '1m/Q'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Current section area */}
            <div className={`border-2 rounded-lg p-5 mb-6 ${sectionColors[currentSubject]}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {sectionLabels[currentSubject]} Questions
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({currentSubject === 'maths' ? '2 marks' : '1 mark'} per question)
                  </span>
                </h3>

                {/* Import to this section */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={downloadSingleSectionTemplate}
                    className="px-3 py-1 bg-white border rounded text-xs hover:bg-gray-50"
                  >
                    📥 Section Template
                  </button>
                  <button
                    type="button"
                    onClick={() => sectionFileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="px-3 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    {uploadingFile ? '...' : 'Import to this section'}
                  </button>
                  <input
                    ref={sectionFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleSectionFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Add question form */}
              <div className="bg-white rounded-lg border p-4 mb-4">
                <h4 className="font-medium text-sm text-gray-600 mb-3">
                  Add Question to {sectionLabels[currentSubject]}
                </h4>

                <div className="mb-3">
                  <textarea
                    placeholder="Question text"
                    value={questionForm.question}
                    onChange={e => setQuestionForm({ ...questionForm, question: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg text-sm"
                    rows={2}
                  />
                  <div className="flex gap-2 items-center mt-1">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded text-xs hover:bg-gray-200">
                      <ImageIcon className="w-3 h-3" />
                      Add Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleImageUpload(e, 'question')}
                        className="hidden"
                      />
                    </label>
                    {questionForm.questionImage && (
                      <div className="flex items-center gap-1">
                        <img
                          src={questionForm.questionImage}
                          alt=""
                          className="h-8 w-8 object-cover rounded"
                        />
                        <button
                          onClick={() => setQuestionForm({ ...questionForm, questionImage: '' })}
                          className="text-red-600 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  {questionForm.options.map((opt, idx) => (
                    <div key={idx}>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                          value={opt}
                          onChange={e => {
                            const newOpts = [...questionForm.options];
                            newOpts[idx] = e.target.value;
                            setQuestionForm({ ...questionForm, options: newOpts });
                          }}
                          className="flex-1 px-3 py-2 border rounded text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setQuestionForm({ ...questionForm, correct: idx })}
                          className={`px-3 py-2 rounded text-xs whitespace-nowrap transition ${
                            questionForm.correct === idx
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-200 hover:bg-gray-300'
                          }`}
                        >
                          {questionForm.correct === idx ? '✓' : String.fromCharCode(65 + idx)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <textarea
                  placeholder="Explanation for correct answer (optional)"
                  value={questionForm.explanation}
                  onChange={e => setQuestionForm({ ...questionForm, explanation: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm mb-3"
                  rows={2}
                />

                <button
                  type="button"
                  onClick={addQuestion}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                >
                  + Add Question
                </button>
              </div>

              {/* Questions preview */}
              {currentQuestions.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm text-gray-600 mb-2">
                    {sectionLabels[currentSubject]} Questions ({currentQuestions.length})
                  </h4>
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {currentQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 bg-white rounded border text-sm">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">
                              Q{idx + 1}: {q.question}
                            </p>
                            <p className="text-green-600 text-xs mt-1">
                              Correct: {String.fromCharCode(65 + q.correct)}) {q.options[q.correct]}
                            </p>
                            {q.explanation && (
                              <p className="text-gray-500 text-xs mt-1">💡 {q.explanation}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQuestion(currentSection, idx)}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Test summary */}
            <div className="bg-gray-50 border rounded-lg p-4 mb-6">
              <h4 className="font-semibold mb-2">📊 Test Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {sections.map(s => (
                  <div key={s.subject}>
                    <span className="text-gray-600">{sectionLabels[s.subject]}:</span>{' '}
                    <strong>
                      {s.questions.length} Q × {s.subject === 'maths' ? 2 : 1} ={' '}
                      {s.questions.length * (s.subject === 'maths' ? 2 : 1)} marks
                    </strong>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm font-semibold border-t pt-2">
                Total:{' '}
                {sections.reduce((sum, s) => sum + s.questions.length, 0)} questions |{' '}
                {sections.reduce(
                  (sum, s) => sum + s.questions.length * (s.subject === 'maths' ? 2 : 1),
                  0
                )}{' '}
                marks | 180 minutes
              </div>
            </div>

            {/* Submit button */}
            <button
              disabled={actionLoading === 'create'}
              onClick={createTest}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {actionLoading === 'create' ? 'Creating...' : 'Submit Test for Approval'}
            </button>
          </div>
        )}

        {/* ======================== MATERIALS TAB ======================== */}
        {activeTab === 'materials' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Upload Study Material</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Material Title"
                value={materialForm.title}
                onChange={e => setMaterialForm({ ...materialForm, title: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select
                  value={materialForm.course}
                  onChange={e => setMaterialForm({ ...materialForm, course: e.target.value })}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">Select Course</option>
                  {courses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Subject"
                  value={materialForm.subject}
                  onChange={e => setMaterialForm({ ...materialForm, subject: e.target.value })}
                  className="px-4 py-2 border rounded-lg"
                />

                <select
                  value={materialForm.type}
                  onChange={e =>
                    setMaterialForm({
                      ...materialForm,
                      type: e.target.value as 'notes' | 'video' | 'pdf',
                    })
                  }
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="notes">Notes</option>
                  <option value="video">Video Link</option>
                  <option value="pdf">PDF Link</option>
                </select>
              </div>

              <textarea
                placeholder="Content (Notes or URL)"
                value={materialForm.content}
                onChange={e => setMaterialForm({ ...materialForm, content: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                rows={5}
              />

              <button
                disabled={actionLoading === 'material'}
                onClick={async () => {
                  if (
                    materialForm.title &&
                    materialForm.content &&
                    materialForm.course &&
                    materialForm.subject
                  ) {
                    try {
                      setActionLoading('material');
                      await api('materials', 'POST', {
                        title: materialForm.title,
                        course: materialForm.course,
                        subject: materialForm.subject,
                        content: materialForm.content,
                        type: materialForm.type,
                      });
                      const materialsData = await api('materials');
                      onMaterialsUpdate(materialsData);
                      setMaterialForm({
                        title: '',
                        course: '',
                        subject: '',
                        content: '',
                        type: 'notes',
                      });
                      alert('Material uploaded successfully!');
                    } catch (error: any) {
                      alert(error.message || 'Failed to upload material');
                    } finally {
                      setActionLoading(null);
                    }
                  } else {
                    alert('Please fill all fields');
                  }
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {actionLoading === 'material' ? 'Uploading...' : 'Upload Material'}
              </button>
            </div>

            {/* My Materials */}
            <div className="mt-8">
              <h3 className="font-bold mb-4">My Materials</h3>
              <div className="space-y-2">
                {materials.filter(isMyMaterial).length === 0 ? (
                  <p className="text-gray-500">No materials uploaded yet</p>
                ) : (
                  materials.filter(isMyMaterial).map(m => {
                    const matCourse =
                      typeof m.course === 'string'
                        ? courses.find(c => c._id === m.course)?.name || m.course
                        : (m.course as any)?.name || 'Unknown';

                    return (
                      <div key={m._id} className="p-4 border rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium">{m.title}</p>
                          <p className="text-sm text-gray-600">
                            {m.subject} | {m.type}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Course: {matCourse}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this material?')) return;
                            try {
                              await api(`materials/${m._id}`, 'DELETE');
                              const materialsData = await api('materials');
                              onMaterialsUpdate(materialsData);
                            } catch (error: any) {
                              alert(error.message || 'Failed to delete');
                            }
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherView;