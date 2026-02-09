import React, { useState } from 'react';
import { BookOpen, LogOut, Upload, ImageIcon, FileText } from 'lucide-react';
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

const TeacherView: React.FC<TeacherViewProps> = ({
  user,
  tests,
  courses,
  materials,
  onLogout,
  onTestsUpdate,
  onMaterialsUpdate,
}) => {
  // Add guard clause to prevent rendering if user is not defined
  if (!user) return null;

  const [activeTab, setActiveTab] = useState('tests');
  const [testForm, setTestForm] = useState({
    title: '',
    course: '',
    subject: '',
    duration: 60,
    questions: [] as Question[]
  });
  const [questionForm, setQuestionForm] = useState({
    question: '',
    questionImage: '',
    options: ['', '', '', ''],
    optionImages: ['', '', '', ''],
    correct: 0,
    explanation: ''
  });
  const [materialForm, setMaterialForm] = useState({
    title: '',
    course: '',
    subject: '',
    content: '',
    type: 'notes' as 'notes' | 'video' | 'pdf'
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const myTests = tests.filter(t => t.teacherId === user!.id);
  const isMyMaterial = (m: Material) => m.teacherId === user!.id;

  const addQuestion = () => {
    if (questionForm.question && questionForm.options.every(o => o)) {
      setTestForm(prev => ({
        ...prev,
        questions: [...prev.questions, {
          question: questionForm.question,
          questionImage: questionForm.questionImage,
          options: questionForm.options,
          optionImages: questionForm.optionImages,
          correct: questionForm.correct,
          explanation: questionForm.explanation
        }]
      }));
      setQuestionForm({
        question: '',
        questionImage: '',
        options: ['', '', '', ''],
        optionImages: ['', '', '', ''],
        correct: 0,
        explanation: ''
      });
    }
  };

  const removeQuestion = (index: number) => {
    setTestForm(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }));
  };

  const createTest = async () => {
    let finalQuestions = [...testForm.questions];
    if (questionForm.question && questionForm.options.every(o => o)) {
      finalQuestions.push({
        question: questionForm.question,
        questionImage: questionForm.questionImage,
        options: questionForm.options,
        optionImages: questionForm.optionImages,
        correct: questionForm.correct,
        explanation: questionForm.explanation
      });
    }

    if (!testForm.title || !testForm.course || !testForm.subject || finalQuestions.length === 0) {
      alert('Please fill all fields and add at least one question');
      return;
    }

    try {
      setActionLoading('create');
      await api('tests', 'POST', {
        title: testForm.title,
        course: testForm.course,
        subject: testForm.subject,
        duration: testForm.duration,
        questions: finalQuestions
      });

      alert('Test created! Awaiting admin approval.');
      setTestForm({
        title: '',
        course: '',
        subject: '',
        duration: 60,
        questions: [],
      });
      setQuestionForm({
        question: '',
        questionImage: '',
        options: ['', '', '', ''],
        optionImages: ['', '', '', ''],
        correct: 0,
        explanation: ''
      });
      setActiveTab('tests');
      const testsData = await api('tests');
      onTestsUpdate(testsData);
    } catch (error: any) {
      alert(error.message || "Failed to create test");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (testId: string, currentActive: boolean) => {
    setActionLoading(testId);
    try {
      await api(`tests/${testId}`, "PATCH", { active: !currentActive });
      const testsData = await api("tests");
      onTestsUpdate(testsData);
    } catch (error: any) {
      alert(error.message || "Failed to update test");
    }
    setActionLoading(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isWord = name.endsWith('.docx'); // only support .docx via mammoth

    if (!isExcel && !isWord) {
      alert('Please upload an Excel (.xlsx, .xls) or Word (.docx) file');
      return;
    }

    setUploadingFile(true);

    try {
      let questions: Question[] = [];

      if (isExcel) {
        const XLSX = await import('xlsx');
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        questions = jsonData.map((row: any) => {
          const correctRaw = row.Correct ?? row.correct ?? row.CorrectAnswer ?? 0;
          const correctNum = Number(correctRaw);
          const correct = isNaN(correctNum) ? 0 : Math.max(0, Math.min(3, correctNum - 1));

          return {
            question: row.Question || row.question || '',
            questionImage: row.QuestionImage || row.questionImage || '',
            options: [
              row.Option1 || row.option1 || '',
              row.Option2 || row.option2 || '',
              row.Option3 || row.option3 || '',
              row.Option4 || row.option4 || ''
            ],
            optionImages: [
              row.OptionImage1 || row.optionImage1 || '',
              row.OptionImage2 || row.optionImage2 || '',
              row.OptionImage3 || row.optionImage3 || '',
              row.OptionImage4 || row.optionImage4 || ''
            ],
            correct,
            explanation: row.Explanation || row.explanation || ''
          };
        });
      } else if (isWord) {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        let text = result.value || '';
        // normalize newlines and collapse excessive blank lines
        text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
        const questionBlocks = text.split('\n\n').map((b: string) => b.trim()).filter(Boolean);

        questions = questionBlocks.map((block: string) => {
          const lines = block.split('\n').map(l => l.trim());
          const questionLine = lines.find(l => /^q:/i.test(l)) || lines[0] || '';
          const question = questionLine.replace(/^q:\s*/i, '').trim();

          const optionsRaw = lines.filter(l => /^[A-D]\)/i.test(l));
          const options = optionsRaw.map((l: string) => l.replace(/^[A-D]\)\s*/i, '').trim());

          const correctLine = (lines.find(l => /^correct:/i.test(l)) || '').replace(/^correct:\s*/i, '').trim() || 'A';
          const correctChar = correctLine.charAt(0).toUpperCase();
          const correct = Math.max(0, Math.min(3, correctChar.charCodeAt(0) - 65));

          const explanation = (lines.find(l => /^explanation:/i.test(l)) || '').replace(/^explanation:\s*/i, '').trim() || '';

          return {
            question,
            questionImage: '',
            options: options.length === 4 ? options : ['', '', '', ''],
            optionImages: ['', '', '', ''],
            correct: isNaN(correct) ? 0 : correct,
            explanation
          };
        }).filter((q: Question) => q.question && q.options.every(o => o));
      }

      if (questions.length === 0) {
        alert('No valid questions found in the file.');
        return;
      }

      setTestForm(prev => ({
        ...prev,
        questions: [...prev.questions, ...questions]
      }));

      alert(`Successfully imported ${questions.length} questions!`);
    } catch (error: any) {
      console.error(error);
      alert('Failed to parse file: ' + (error?.message || String(error)));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'question' | 'option', optionIndex?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
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
    } catch (error) {
      alert('Failed to upload image');
    }
  };

  // add download helper and template generators
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        [
          'Question',
          'QuestionImage',
          'Option1',
          'OptionImage1',
          'Option2',
          'OptionImage2',
          'Option3',
          'OptionImage3',
          'Option4',
          'OptionImage4',
          'Correct', // number 1-4
          'Explanation'
        ],
        [
          'What is 2 + 2?',
          '',
          '2',
          '',
          '3',
          '',
          '4',
          '',
          '5',
          '',
          '3',
          '2 + 2 = 4'
        ]
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = { Sheets: { Sheet1: ws }, SheetNames: ['Sheet1'] };
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      downloadBlob(blob, 'questions_template.xlsx');
    } catch (err) {
      alert('Failed to prepare Excel template.');
    }
  };

  const downloadWordTemplate = () => {
    // Plain-text Word-style template matching the parser used by the app (save as .docx/.doc if desired)
    const text = [
      'Q: What is 2 + 2?',
      'A) 2',
      'B) 3',
      'C) 4',
      'D) 5',
      'Correct: C',
      'Explanation: 2 + 2 equals 4',
      '',
      'Q: Which planet is known as the Red Planet?',
      'A) Earth',
      'B) Mars',
      'C) Venus',
      'D) Jupiter',
      'Correct: B',
      'Explanation: Mars is called the Red Planet'
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    downloadBlob(blob, 'questions_template.docx'); // plain-text file; Word can open it
  };

  

  return (
    <div className="min-h-screen bg-gray-50">
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
              <LogOut className="w-5 h-5" />Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-4 mb-6 overflow-x-auto">
          {['tests', 'create-test', 'materials'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)} 
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap transition ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>

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
                <div key={t.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold">{t.title}</h3>
                      <p className="text-gray-600">{t.subject} | {t.duration} minutes | {t.questions.length} questions</p>
                      <div className="flex gap-2 mt-2">
                        <span className={`px-3 py-1 rounded text-sm ${t.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {t.approved ? 'Approved' : 'Pending Approval'}
                        </span>
                        {t.approved && (
                          <span className={`px-3 py-1 rounded text-sm ${t.active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                            {t.active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </div>
                    </div>
                    {t.approved && (
                      <button 
                        disabled={actionLoading === t.id}
                        onClick={() => handleToggleActive(t.id, t.active)} 
                        className={`px-4 py-2 rounded-lg disabled:opacity-60 ${t.active ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
                      >
                        {actionLoading === t.id ? '...' : t.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'create-test' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Create New Test</h2>
            
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Quick Import from File
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                Upload Excel (.xlsx) or Word (.docx) file with questions.
              </p>

              {/* new: template download buttons and format info */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={downloadExcelTemplate}
                  className="px-3 py-1 bg-white border rounded text-sm hover:bg-gray-50"
                >
                  Download Excel Template
                </button>
                <button
                  type="button"
                  onClick={downloadWordTemplate}
                  className="px-3 py-1 bg-white border rounded text-sm hover:bg-gray-50"
                >
                  Download Word Template
                </button>
                <details className="ml-2 text-sm text-gray-600">
                  <summary className="cursor-pointer">Format / Example</summary>
                  <div className="mt-2">
                    <p className="text-xs"><strong>Excel:</strong> Columns: Question, QuestionImage, Option1, OptionImage1, Option2, OptionImage2, Option3, OptionImage3, Option4, OptionImage4, Correct (1-4), Explanation.</p>
                    <p className="text-xs mt-1"><strong>Word (.docx):</strong> Separate questions with a blank line. Each block example:</p>
                    <pre className="text-xs bg-gray-100 p-2 rounded mt-1">Q: Question text
A) Option 1
B) Option 2
C) Option 3
D) Option 4
Correct: C
Explanation: Optional explanation</pre>
                  </div>
                </details>
              </div>

              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Upload className="w-4 h-4" />
                {uploadingFile ? 'Uploading...' : 'Upload File'}
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.docx" 
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="hidden" 
                />
              </label>
            </div>

            <div className="space-y-4 mb-6">
              <input 
                type="text" 
                placeholder="Test Title" 
                value={testForm.title} 
                onChange={e => setTestForm({...testForm, title: e.target.value})} 
                className="w-full px-4 py-2 border rounded-lg" 
              />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select 
                  value={testForm.course} 
                  onChange={e => setTestForm({...testForm, course: e.target.value})} 
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                
                <input 
                  type="text" 
                  placeholder="Subject (e.g., Physics)" 
                  value={testForm.subject} 
                  onChange={e => setTestForm({...testForm, subject: e.target.value})} 
                  className="px-4 py-2 border rounded-lg" 
                />
                
                <input 
                  type="number" 
                  placeholder="Duration (minutes)" 
                  value={testForm.duration} 
                  onChange={e => setTestForm({...testForm, duration: parseInt(e.target.value) || 60})} 
                  className="px-4 py-2 border rounded-lg" 
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-bold mb-3">Add Question ({testForm.questions.length} added)</h3>
                
                <div className="mb-3">
                  <textarea 
                    placeholder="Question" 
                    value={questionForm.question} 
                    onChange={e => setQuestionForm({...questionForm, question: e.target.value})} 
                    className="w-full px-4 py-2 border rounded-lg mb-2" 
                    rows={2} 
                  />
                  <div className="flex gap-2 items-center">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200">
                      <ImageIcon className="w-4 h-4" />
                      Add Question Image
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleImageUpload(e, 'question')}
                        className="hidden" 
                      />
                    </label>
                    {questionForm.questionImage && (
                      <div className="flex items-center gap-2">
                        <img src={questionForm.questionImage} alt="Question" className="h-10 w-10 object-cover rounded" />
                        <button 
                          onClick={() => setQuestionForm({...questionForm, questionImage: ''})}
                          className="text-red-600 text-sm hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {questionForm.options.map((opt, idx) => (
                  <div key={idx} className="mb-3">
                    <div className="flex gap-2 mb-1">
                      <input 
                        type="text" 
                        placeholder={`Option ${idx + 1}`} 
                        value={opt} 
                        onChange={e => {
                          const newOpts = [...questionForm.options];
                          newOpts[idx] = e.target.value;
                          setQuestionForm({...questionForm, options: newOpts});
                        }} 
                        className="flex-1 px-4 py-2 border rounded-lg" 
                      />
                      <button 
                        type="button"
                        onClick={() => setQuestionForm({...questionForm, correct: idx})} 
                        className={`px-4 py-2 rounded-lg transition whitespace-nowrap ${questionForm.correct === idx ? 'bg-green-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                      >
                        {questionForm.correct === idx ? '✓ Correct' : 'Set Correct'}
                      </button>
                    </div>
                    <div className="flex gap-2 items-center ml-2">
                      <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs hover:bg-gray-100">
                        <ImageIcon className="w-3 h-3" />
                        Add Image
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleImageUpload(e, 'option', idx)}
                          className="hidden" 
                        />
                      </label>
                      {questionForm.optionImages[idx] && (
                        <div className="flex items-center gap-1">
                          <img src={questionForm.optionImages[idx]} alt={`Option ${idx + 1}`} className="h-8 w-8 object-cover rounded" />
                          <button 
                            onClick={() => {
                              const newImages = [...questionForm.optionImages];
                              newImages[idx] = '';
                              setQuestionForm({...questionForm, optionImages: newImages});
                            }}
                            className="text-red-600 text-xs hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                <textarea 
                  placeholder="Explanation for correct answer (optional)" 
                  value={questionForm.explanation} 
                  onChange={e => setQuestionForm({...questionForm, explanation: e.target.value})} 
                  className="w-full px-4 py-2 border rounded-lg mb-2" 
                  rows={2} 
                />
                
                <button 
                  type="button"
                  onClick={addQuestion} 
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Question
                </button>
              </div>

              {testForm.questions.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-bold mb-2">Questions Preview</h3>
                  <div className="max-h-96 overflow-y-auto">
                    {testForm.questions.map((q, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded mb-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">Q{idx + 1}: {q.question}</p>
                            {q.questionImage && <img src={q.questionImage} alt="Question" className="h-20 mt-1 rounded" />}
                            <p className="text-sm text-green-600 mt-1">Correct: {q.options[q.correct]}</p>
                            {q.explanation && <p className="text-xs text-gray-600 mt-1">Explanation: {q.explanation}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQuestion(idx)}
                            className="text-red-600 hover:text-red-800 text-sm ml-2"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                disabled={actionLoading === 'create'}
                onClick={createTest} 
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {actionLoading === 'create' ? 'Creating...' : 'Submit Test for Approval'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Upload Study Material</h2>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Material Title" 
                value={materialForm.title} 
                onChange={e => setMaterialForm({...materialForm, title: e.target.value})} 
                className="w-full px-4 py-2 border rounded-lg" 
              />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select 
                  value={materialForm.course} 
                  onChange={e => setMaterialForm({...materialForm, course: e.target.value})} 
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                
                <input 
                  type="text" 
                  placeholder="Subject" 
                  value={materialForm.subject} 
                  onChange={e => setMaterialForm({...materialForm, subject: e.target.value})} 
                  className="px-4 py-2 border rounded-lg" 
                />
                
                <select 
                  value={materialForm.type} 
                  onChange={e => setMaterialForm({...materialForm, type: e.target.value as 'notes' | 'video' | 'pdf'})} 
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
                onChange={e => setMaterialForm({...materialForm, content: e.target.value})} 
                className="w-full px-4 py-2 border rounded-lg" 
                rows={5} 
              />
              
              <button 
                disabled={actionLoading === 'material'}
                onClick={async () => { 
                  if(materialForm.title && materialForm.content && materialForm.course && materialForm.subject) { 
                    try {
                      setActionLoading('material');
                      await api('materials', 'POST', {
                        title: materialForm.title,
                        course: materialForm.course,
                        subject: materialForm.subject,
                        content: materialForm.content,
                        type: materialForm.type
                      });
                      const materialsData = await api('materials');
                      onMaterialsUpdate(materialsData);
                      setMaterialForm({ title: '', course: '', subject: '', content: '', type: 'notes' });
                      alert('Material uploaded successfully!');
                    } catch (error: any) {
                      alert(error.message || "Failed to upload material");
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

            <div className="mt-8">
              <h3 className="font-bold mb-4">My Materials</h3>
              <div className="space-y-2">
                {materials.filter(isMyMaterial).length === 0 ? (
                  <p className="text-gray-500">No materials uploaded yet</p>
                ) : (
                  materials.filter(isMyMaterial).map(m => (
                    <div key={m.id} className="p-4 border rounded-lg">
                      <p className="font-medium">{m.title}</p>
                      <p className="text-sm text-gray-600">{m.subject} | {m.type}</p>
                      <p className="text-xs text-gray-500 mt-1">Course: {courses.find(c => c.id === m.course)?.name || m.course}</p>
                    </div>
                  ))
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