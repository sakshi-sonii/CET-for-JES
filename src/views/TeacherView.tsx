import React, { useState, useRef } from 'react';
import { BookOpen, LogOut, Upload, ImageIcon, FileText, Trash2, Download } from 'lucide-react';
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
    explanationImage: '',
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
  const mockFileInputRef = useRef<HTMLInputElement>(null);
  const sectionFileInputRef = useRef<HTMLInputElement>(null);

  // ========================
  // Helpers
  // ========================
  const myTests = tests.filter(t => {
    const tid = typeof t.teacherId === 'string' ? t.teacherId : String(t.teacherId);
    return tid === String(user._id);
  });

  const isMyMaterial = (m: Material) => {
    const mid = typeof m.teacherId === 'string'
      ? m.teacherId
      : typeof m.teacherId === 'object' && m.teacherId !== null
        ? (m.teacherId as any)._id || String(m.teacherId)
        : String(m.teacherId);
    return String(mid) === String(user._id);
  };

  const getTotalQuestions = (test: Test): number =>
    test.sections?.reduce((sum, s) => sum + (s.questions?.length || 0), 0) || 0;

  const getTotalMarks = (test: Test): number =>
    test.sections?.reduce((sum, s) => {
      const marks = s.marksPerQuestion || (s.subject === 'maths' ? 2 : 1);
      return sum + (s.questions?.length || 0) * marks;
    }, 0) || 0;

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
  // Image helpers
  // ========================
  const convertImageToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'question' | 'option' | 'explanation',
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
      } else if (type === 'explanation') {
        setQuestionForm(prev => ({ ...prev, explanationImage: base64 }));
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
    e.target.value = '';
  };

  const renderImagePreview = (
    src: string,
    alt: string,
    className: string = 'h-16 max-w-xs object-contain rounded border'
  ) => {
    if (!src) return null;
    if (src.startsWith('data:') || src.startsWith('http')) {
      return <img src={src} alt={alt} className={className} />;
    }
    return (
      <span className="text-xs text-blue-600 inline-flex items-center gap-1">
        <ImageIcon className="w-3 h-3" />
        {src.length > 40 ? src.substring(0, 40) + '...' : src}
      </span>
    );
  };

  // ========================
  // Question management
  // ========================
  const resetQuestionForm = () => {
    setQuestionForm({
      question: '', questionImage: '',
      options: ['', '', '', ''], optionImages: ['', '', '', ''],
      correct: 0, explanation: '', explanationImage: '',
    });
  };

  const addQuestion = () => {
    const hasQuestionContent = questionForm.question.trim() || questionForm.questionImage;
    const allOptionsValid = questionForm.options.every(
      (o, idx) => o.trim() || questionForm.optionImages[idx]
    );

    if (!hasQuestionContent || !allOptionsValid) {
      alert('Please provide text or image for the question and all 4 options');
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
      explanationImage: questionForm.explanationImage || undefined,
    };

    setSections(prev => {
      const updated = [...prev];
      updated[currentSection] = {
        ...updated[currentSection],
        questions: [...updated[currentSection].questions, newQ],
      };
      return updated;
    });

    resetQuestionForm();
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
    const hasQuestionContent = questionForm.question.trim() || questionForm.questionImage;
    const allOptionsValid = questionForm.options.every(
      (o, idx) => o.trim() || questionForm.optionImages[idx]
    );
    if (hasQuestionContent && allOptionsValid) addQuestion();

    if (!testTitle.trim()) { alert('Please enter a test title'); return; }
    if (!testCourse) { alert('Please select a course'); return; }

    const totalQ = sections.reduce((sum, s) => sum + s.questions.length, 0);
    if (totalQ === 0) { alert('Please add at least one question'); return; }

    const emptySections = sections.filter(s => s.questions.length === 0);
    if (emptySections.length > 0) {
      const names = emptySections.map(s => sectionLabels[s.subject]).join(', ');
      if (!confirm(`${names} section(s) have no questions. Continue anyway?`)) return;
    }

    setActionLoading('create');
    try {
      const payload = {
        title: testTitle,
        course: testCourse,
        sections: sections
          .filter(s => s.questions.length > 0)
          .map(s => ({
            subject: s.subject,
            questions: s.questions.map(q => ({
              question: q.question,
              questionImage: q.questionImage || undefined,
              options: q.options,
              optionImages: q.optionImages?.some(img => img) ? q.optionImages : undefined,
              correct: q.correct,
              explanation: q.explanation || '',
              explanationImage: q.explanationImage || undefined,
            })),
          })),
      };

      await api('tests', 'POST', payload);

      setTestTitle('');
      setTestCourse('');
      setSections([
        { subject: 'physics', questions: [] },
        { subject: 'chemistry', questions: [] },
        { subject: 'maths', questions: [] },
      ]);
      resetQuestionForm();

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
  // Excel parsing
  // ========================
  const parseExcelSheet = (XLSX: any, worksheet: any): Question[] => {
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    return jsonData.map((row: any) => {
      const correctRaw = row.Correct ?? row.correct ?? row.CorrectAnswer ?? 0;
      const correctNum = Number(correctRaw);
      const correct = isNaN(correctNum) ? 0 : Math.max(0, Math.min(3, correctNum - 1));

      const questionImage = String(row.QuestionImage || row.questionImage || '') || undefined;
      const explanationImage = String(row.ExplanationImage || row.explanationImage || '') || undefined;
      const optionImages = [
        String(row.Option1Image || row.option1Image || ''),
        String(row.Option2Image || row.option2Image || ''),
        String(row.Option3Image || row.option3Image || ''),
        String(row.Option4Image || row.option4Image || ''),
      ];
      const hasOptionImages = optionImages.some(img => img);

      return {
        question: String(row.Question || row.question || ''),
        questionImage,
        options: [
          String(row.Option1 || row.option1 || ''),
          String(row.Option2 || row.option2 || ''),
          String(row.Option3 || row.option3 || ''),
          String(row.Option4 || row.option4 || ''),
        ],
        optionImages: hasOptionImages ? optionImages : undefined,
        correct,
        explanation: String(row.Explanation || row.explanation || '') || undefined,
        explanationImage,
      };
    }).filter((q: any) => {
      const hasQuestion = q.question || q.questionImage;
      const allOptionsValid = q.options.every(
        (o: string, idx: number) => o || (q.optionImages && q.optionImages[idx])
      );
      return hasQuestion && allOptionsValid;
    });
  };

  const parseExcelFile = async (file: File): Promise<Question[]> => {
    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return parseExcelSheet(XLSX, worksheet);
  };

  // ========================
  // Word (.docx) parsing
  // ========================
  const parseWordLines = async (file: File): Promise<{ text: string; images: string[] }[]> => {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();

    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        convertImage: mammoth.images.imgElement((image: any) => {
          return image.read('base64').then((imageBuffer: string) => {
            const contentType = image.contentType || 'image/png';
            return { src: `data:${contentType};base64,${imageBuffer}` };
          });
        }),
      }
    );

    const html = result.value;
    const domParser = new DOMParser();
    const doc = domParser.parseFromString(html, 'text/html');
    const elements = Array.from(doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));

    const lines: { text: string; images: string[] }[] = [];
    for (const el of elements) {
      const text = el.textContent?.trim() || '';
      const imgs = Array.from(el.querySelectorAll('img')).map(img => img.getAttribute('src') || '');
      if (text || imgs.length > 0) {
        lines.push({ text, images: imgs });
      }
    }
    return lines;
  };

  const parseQuestionsFromLines = (lines: { text: string; images: string[] }[]): Question[] => {
    const questions: Question[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Detect question: Q1. or Q1: or 1. or 1: or Question 1:
      const qMatch = line.text.match(/^(?:Q(?:uestion)?\s*)?(\d+)\s*[.:)\-]\s*(.*)/i);
      if (!qMatch) { i++; continue; }

      const questionText = qMatch[2]?.trim() || '';
      const questionImage = line.images[0] || '';

      const optionTexts: string[] = ['', '', '', ''];
      const optionImgs: string[] = ['', '', '', ''];
      let correct = 0;

      // Read 4 options
      for (let oi = 0; oi < 4; oi++) {
        i++;
        if (i >= lines.length) break;
        const optLine = lines[i];
        const optMatch = optLine.text.match(/^\(?([A-Da-d])\)?\s*[.:)\-]?\s*(.*)/);
        if (optMatch) {
          optionTexts[oi] = optMatch[2]?.trim() || '';
          optionImgs[oi] = optLine.images[0] || '';
        } else {
          optionTexts[oi] = optLine.text;
          optionImgs[oi] = optLine.images[0] || '';
        }
      }

      // Correct answer line
      i++;
      if (i < lines.length) {
        const corrLine = lines[i];
        const corrMatch = corrLine.text.match(/(?:correct|answer|ans)\s*[.:)\-]?\s*([A-Da-d1-4])/i);
        if (corrMatch) {
          const val = corrMatch[1].toUpperCase();
          if ('ABCD'.includes(val)) correct = 'ABCD'.indexOf(val);
          else {
            const num = parseInt(val);
            if (num >= 1 && num <= 4) correct = num - 1;
          }
        } else {
          i--;
        }
      }

      // Explanation line
      let explanation = '';
      let explanationImage = '';
      i++;
      if (i < lines.length) {
        const expLine = lines[i];
        const expMatch = expLine.text.match(/(?:explanation|explain|reason|hint)\s*[.:)\-]?\s*(.*)/i);
        if (expMatch) {
          explanation = expMatch[1]?.trim() || '';
          explanationImage = expLine.images[0] || '';
        } else {
          i--;
        }
      }

      const hasOptionImages = optionImgs.some(img => img);

      questions.push({
        question: questionText,
        questionImage: questionImage || undefined,
        options: optionTexts,
        optionImages: hasOptionImages ? optionImgs : undefined,
        correct,
        explanation: explanation || undefined,
        explanationImage: explanationImage || undefined,
      });

      i++;
    }

    return questions.filter(q => {
      const hasQuestion = q.question || q.questionImage;
      const allOptionsValid = q.options.every(
        (o, idx) => o || (q.optionImages && q.optionImages[idx])
      );
      return hasQuestion && allOptionsValid;
    });
  };

  const parseWordQuestions = async (file: File): Promise<Question[]> => {
    const lines = await parseWordLines(file);
    return parseQuestionsFromLines(lines);
  };

  const parseWordMockTest = async (file: File): Promise<SectionForm[]> => {
    const lines = await parseWordLines(file);

    type SubjectKey = 'physics' | 'chemistry' | 'maths';
    const sectionContent: Record<SubjectKey, { text: string; images: string[] }[]> = {
      physics: [],
      chemistry: [],
      maths: [],
    };

    let currentSubjectKey: SubjectKey | null = null;

    for (const line of lines) {
      // Detect section headers: === PHYSICS === or --- Physics --- or just PHYSICS
      const headerMatch = line.text.match(
        /^(?:[=\-*#]{2,}\s*)?(physics|chemistry|math(?:ematics|s)?)\s*(?:[=\-*#]{2,})?$/i
      );
      if (headerMatch) {
        const name = headerMatch[1].toLowerCase();
        if (name === 'physics') currentSubjectKey = 'physics';
        else if (name === 'chemistry') currentSubjectKey = 'chemistry';
        else if (name.startsWith('math')) currentSubjectKey = 'maths';
        continue;
      }

      if (currentSubjectKey && (line.text || line.images.length > 0)) {
        sectionContent[currentSubjectKey].push(line);
      }
    }

    return [
      { subject: 'physics', questions: parseQuestionsFromLines(sectionContent.physics) },
      { subject: 'chemistry', questions: parseQuestionsFromLines(sectionContent.chemistry) },
      { subject: 'maths', questions: parseQuestionsFromLines(sectionContent.maths) },
    ];
  };

  // ========================
  // Upload handlers
  // ========================
  const handleSectionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase();
    const isExcel = ext.endsWith('.xlsx') || ext.endsWith('.xls');
    const isWord = ext.endsWith('.docx');

    if (!isExcel && !isWord) {
      alert('Please upload an Excel (.xlsx/.xls) or Word (.docx) file');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    try {
      const questions = isExcel
        ? await parseExcelFile(file)
        : await parseWordQuestions(file);

      if (questions.length === 0) {
        alert(
          'No valid questions found.\n\n' +
          (isExcel
            ? 'Excel: Each row needs Question (or QuestionImage) and all 4 Options (or OptionImages).'
            : 'Word: Use format Q1. question → A) B) C) D) → Correct: A → Explanation:')
        );
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

      const imageCount = questions.filter(q =>
        q.questionImage || q.explanationImage || q.optionImages?.some(img => img)
      ).length;

      alert(
        `✅ Imported ${questions.length} questions to ${sectionLabels[sections[currentSection].subject]}!` +
        (imageCount > 0 ? `\n📸 ${imageCount} questions contain images.` : '')
      );
    } catch (error: any) {
      alert('Failed to parse file: ' + (error?.message || String(error)));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleMockTestFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase();
    const isExcel = ext.endsWith('.xlsx') || ext.endsWith('.xls');
    const isWord = ext.endsWith('.docx');

    if (!isExcel && !isWord) {
      alert('Please upload an Excel (.xlsx/.xls) or Word (.docx) file');
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    try {
      let newSections: SectionForm[];

      if (isExcel) {
        const XLSX = await import('xlsx');
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });

        const sheetMap: Record<string, 'physics' | 'chemistry' | 'maths'> = {
          Physics: 'physics', Chemistry: 'chemistry',
          Mathematics: 'maths', Maths: 'maths', Math: 'maths',
        };

        newSections = [
          { subject: 'physics', questions: [] },
          { subject: 'chemistry', questions: [] },
          { subject: 'maths', questions: [] },
        ];

        for (const sheetName of workbook.SheetNames) {
          const subject = sheetMap[sheetName];
          if (!subject) continue;
          const worksheet = workbook.Sheets[sheetName];
          const questions = parseExcelSheet(XLSX, worksheet);
          const idx = newSections.findIndex(s => s.subject === subject);
          if (idx !== -1) newSections[idx].questions = questions;
        }
      } else {
        newSections = await parseWordMockTest(file);
      }

      const totalQ = newSections.reduce((sum, s) => sum + s.questions.length, 0);
      if (totalQ === 0) {
        alert(
          'No valid questions found.\n\n' +
          (isExcel
            ? 'Excel: Make sure sheet names are Physics, Chemistry, Mathematics.\nEach row needs Question/QuestionImage and all 4 Options/OptionImages.'
            : 'Word: Make sure document has section headers like:\n=== PHYSICS ===\n=== CHEMISTRY ===\n=== MATHEMATICS ===\n\nWith questions formatted as:\nQ1. question\nA) option\nB) option\nC) option\nD) option\nCorrect: A\nExplanation: text')
        );
        return;
      }

      setSections(newSections);

      const totalImages = newSections.reduce((sum, s) =>
        sum + s.questions.filter(q =>
          q.questionImage || q.explanationImage || q.optionImages?.some(img => img)
        ).length, 0
      );

      alert(
        `✅ Imported from ${isExcel ? 'Excel' : 'Word'}:\n` +
        `Physics: ${newSections[0].questions.length} questions\n` +
        `Chemistry: ${newSections[1].questions.length} questions\n` +
        `Mathematics: ${newSections[2].questions.length} questions\n` +
        `Total: ${totalQ} questions` +
        (totalImages > 0 ? `\n📸 ${totalImages} questions contain images` : '')
      );
    } catch (error: any) {
      alert('Failed to parse file: ' + (error?.message || String(error)));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  // ========================
  // Template downloads
  // ========================
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const excelHeaders = [
    'Question', 'QuestionImage',
    'Option1', 'Option1Image',
    'Option2', 'Option2Image',
    'Option3', 'Option3Image',
    'Option4', 'Option4Image',
    'Correct', 'Explanation', 'ExplanationImage',
  ];

  const excelColWidths = [
    { wch: 35 }, { wch: 40 },
    { wch: 20 }, { wch: 40 },
    { wch: 20 }, { wch: 40 },
    { wch: 20 }, { wch: 40 },
    { wch: 20 }, { wch: 40 },
    { wch: 8 }, { wch: 35 }, { wch: 40 },
  ];

  const createInstructionSheet = (XLSX: any) => {
    const instrData = [
      ['📋 TEMPLATE INSTRUCTIONS'],
      [''],
      ['Column', 'Description', 'Required?'],
      ['Question', 'Question text', 'Yes (if no QuestionImage)'],
      ['QuestionImage', 'Image URL or base64', 'Yes (if no Question text)'],
      ['Option1–4', 'Option text', 'Yes (if no OptionImage)'],
      ['Option1Image–4Image', 'Option image URL or base64', 'Yes (if no Option text)'],
      ['Correct', 'Correct answer: 1, 2, 3, or 4', 'Yes'],
      ['Explanation', 'Explanation text', 'Optional'],
      ['ExplanationImage', 'Explanation image URL or base64', 'Optional'],
      [''],
      ['💡 TIPS:'],
      ['• Each question must have text OR image (or both)'],
      ['• Each option must have text OR image (or both)'],
      ['• Correct column: 1=Option1, 2=Option2, 3=Option3, 4=Option4'],
      ['• Image columns accept full URLs (https://...) or base64 data'],
      ['• You can mix text-only and image questions freely'],
      ['• Explanation text and image are both optional'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(instrData);
    ws['!cols'] = [{ wch: 30 }, { wch: 50 }, { wch: 30 }];
    return ws;
  };

  const downloadSingleSectionTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        excelHeaders,
        ['What is 2 + 2?', '', '2', '', '3', '', '4', '', '5', '', '3', '2 + 2 = 4', ''],
        ['Capital of France?', '', 'London', '', 'Berlin', '', 'Paris', '', 'Madrid', '', '3', 'Paris is the capital', ''],
        ['Identify the diagram:', 'https://example.com/diagram.png', 'Cell', '', 'Atom', '', 'Molecule', '', 'Organ', '', '1', 'Shows a cell', ''],
        ['Which symbol matches?', 'https://example.com/symbol.png', '', 'https://example.com/a.png', '', 'https://example.com/b.png', '', 'https://example.com/c.png', '', 'https://example.com/d.png', '2', '', 'https://example.com/explain.png'],
        ['Solve:', 'https://example.com/eq.png', 'x=2', '', 'x=3', '', 'x=4', '', 'x=5', '', '1', 'Steps:', 'https://example.com/sol.png'],
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = excelColWidths;

      const wb = {
        Sheets: { Questions: ws, Instructions: createInstructionSheet(XLSX) },
        SheetNames: ['Questions', 'Instructions'],
      };
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'section_template.xlsx');
    } catch {
      alert('Failed to create template');
    }
  };

  const downloadMockTestTemplate = async () => {
    try {
      const XLSX = await import('xlsx');

      const physicsData = [
        excelHeaders,
        ['SI unit of force?', '', 'Joule', '', 'Newton', '', 'Watt', '', 'Pascal', '', '2', 'Newton is the SI unit', ''],
        ['Gravity acceleration?', '', '9.8 m/s²', '', '10 m/s²', '', '8.9 m/s²', '', '11 m/s²', '', '1', 'g ≈ 9.8 m/s²', ''],
        ['Identify circuit:', 'https://example.com/circuit.png', 'Series', '', 'Parallel', '', 'Mixed', '', 'None', '', '1', '', 'https://example.com/circuit-sol.png'],
      ];
      const chemistryData = [
        excelHeaders,
        ['Atomic number of Carbon?', '', '5', '', '6', '', '7', '', '8', '', '2', 'Carbon has 6 protons', ''],
        ['Formula of water?', '', 'H2O', '', 'CO2', '', 'O2', '', 'H2', '', '1', 'Water is H2O', ''],
        ['Identify structure:', 'https://example.com/mol.png', '', 'https://example.com/a.png', '', 'https://example.com/b.png', '', 'https://example.com/c.png', '', 'https://example.com/d.png', '2', '', 'https://example.com/mol-sol.png'],
      ];
      const mathsData = [
        excelHeaders,
        ['Value of π?', '', '3.14', '', '2.71', '', '1.41', '', '1.73', '', '1', 'π ≈ 3.14159', ''],
        ['Derivative of x²?', '', 'x', '', '2x', '', '3x', '', 'x³', '', '2', 'd/dx(x²) = 2x', ''],
        ['Solve equation:', 'https://example.com/eq.png', 'x=1', '', 'x=2', '', 'x=3', '', 'x=4', '', '2', 'Solution:', 'https://example.com/sol.png'],
      ];

      const physicsWs = XLSX.utils.aoa_to_sheet(physicsData);
      physicsWs['!cols'] = excelColWidths;
      const chemistryWs = XLSX.utils.aoa_to_sheet(chemistryData);
      chemistryWs['!cols'] = excelColWidths;
      const mathsWs = XLSX.utils.aoa_to_sheet(mathsData);
      mathsWs['!cols'] = excelColWidths;

      const wb = {
        Sheets: {
          Physics: physicsWs, Chemistry: chemistryWs,
          Mathematics: mathsWs, Instructions: createInstructionSheet(XLSX),
        },
        SheetNames: ['Physics', 'Chemistry', 'Mathematics', 'Instructions'],
      };
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(new Blob([wbout], { type: 'application/octet-stream' }), 'mock_test_template.xlsx');
    } catch {
      alert('Failed to create template');
    }
  };

  // Word template download
  const downloadWordTemplate = async (type: 'section' | 'mock') => {
    try {
      const docx = await import('docx');
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

      const createInstructions = (): InstanceType<typeof Paragraph>[] => [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '📋 WORD TEMPLATE INSTRUCTIONS', bold: true, size: 28 })],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [new TextRun({ text: 'FORMAT RULES — Follow exactly:', bold: true, size: 24, color: 'FF0000' })],
        }),
        new Paragraph({ children: [new TextRun({ text: '• Questions: Start with Q1. or Q1: or 1. or 1: or Question 1:', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '• Question text goes after the number. Paste/insert image on same line.', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '• Options: Use A) B) C) D) or a) b) c) d) or (A) (B) (C) (D)', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '• Option text after letter. Paste image for image-based options.', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '• Correct answer: "Correct: A" or "Answer: 2" or "Ans: B"', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '• Explanation (optional): "Explanation: your text" — paste image too', size: 22 })] }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [new TextRun({
            text: '🖼️ You can PASTE IMAGES directly into this document!',
            bold: true, size: 24, color: '0066CC',
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'Images embedded in the Word file will be automatically extracted as base64.',
            size: 22, color: '0066CC',
          })],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [new TextRun({
            text: '⚠️ Each question MUST have text OR image. Each option MUST have text OR image.',
            bold: true, size: 22, color: 'FF6600',
          })],
        }),
        new Paragraph({ children: [] }),
      ];

      const createSampleQuestions = (subject: string): InstanceType<typeof Paragraph>[] => [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({
            text: `--- ${subject} Sample Questions (Replace with your own) ---`,
            bold: true, size: 24,
          })],
        }),
        new Paragraph({ children: [] }),

        // Sample 1: Text only
        new Paragraph({ children: [new TextRun({ text: 'Q1. What is the correct answer? (text-only example)', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A) First option', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'B) Second option', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'C) Third option (correct)', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'D) Fourth option', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Correct: C', size: 22, color: '008800' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Explanation: This explains why C is correct.', size: 22, italics: true })] }),
        new Paragraph({ children: [] }),

        // Sample 2: With image placeholder
        new Paragraph({ children: [new TextRun({ text: 'Q2. Look at the image below and answer:', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: '[PASTE YOUR QUESTION IMAGE HERE]', size: 20, color: '0066CC', italics: true })] }),
        new Paragraph({ children: [new TextRun({ text: 'A) Option A text or [PASTE OPTION IMAGE]', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'B) Option B text or [PASTE OPTION IMAGE]', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'C) Option C text or [PASTE OPTION IMAGE]', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'D) Option D text or [PASTE OPTION IMAGE]', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Correct: A', size: 22, color: '008800' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Explanation: [PASTE EXPLANATION IMAGE or type text]', size: 22, italics: true })] }),
        new Paragraph({ children: [] }),

        // Sample 3: Minimal
        new Paragraph({ children: [new TextRun({ text: 'Q3. Simple question example?', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'A) Yes', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'B) No', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'C) Maybe', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'D) None of the above', size: 22 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Correct: A', size: 22, color: '008800' })] }),
        new Paragraph({ children: [] }),
        new Paragraph({ children: [] }),
      ];

      let doc: InstanceType<typeof Document>;

      if (type === 'section') {
        doc = new Document({
          sections: [{
            children: [
              ...createInstructions(),
              ...createSampleQuestions('Section'),
            ],
          }],
        });
      } else {
        doc = new Document({
          sections: [{
            children: [
              ...createInstructions(),

              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: '=== PHYSICS ===', bold: true, size: 32, color: '0000FF' })],
              }),
              new Paragraph({ children: [] }),
              ...createSampleQuestions('Physics'),

              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: '=== CHEMISTRY ===', bold: true, size: 32, color: '008800' })],
              }),
              new Paragraph({ children: [] }),
              ...createSampleQuestions('Chemistry'),

              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: '=== MATHEMATICS ===', bold: true, size: 32, color: '880088' })],
              }),
              new Paragraph({ children: [] }),
              ...createSampleQuestions('Mathematics'),
            ],
          }],
        });
      }

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, type === 'section' ? 'section_template.docx' : 'mock_test_template.docx');
    } catch (error: any) {
      console.error('Word template error:', error);
      alert('Failed to create Word template: ' + (error?.message || 'Unknown error'));
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
            <button onClick={onLogout} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
              <LogOut className="w-5 h-5" /> Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab buttons */}
        <div className="flex gap-4 mb-6 overflow-x-auto">
          {['tests', 'create-test', 'materials'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}>
              {tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
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
                <button onClick={() => setActiveTab('create-test')}
                  className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Create Your First Test
                </button>
              </div>
            ) : (
              myTests.map(t => (
                <div key={t._id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold">{t.title}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {t.sections?.map(s => (
                          <span key={s.subject}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${sectionBadgeColors[s.subject] || 'bg-gray-100 text-gray-800'}`}>
                            {sectionLabels[s.subject] || s.subject}: {s.questions?.length || 0}Q × {s.marksPerQuestion || (s.subject === 'maths' ? 2 : 1)}m
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        {getTotalQuestions(t)} questions | {getTotalMarks(t)} marks | {t.totalDuration || 180} min
                      </p>
                      <div className="text-xs text-gray-400 mt-1">
                        Phy+Chem: {t.sectionTimings?.physicsChemistry || 90} min | Maths: {t.sectionTimings?.maths || 90} min
                      </div>
                      <div className="flex gap-2 mt-3">
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
                      <button disabled={actionLoading === t._id}
                        onClick={() => handleToggleActive(t._id, t.active)}
                        className={`px-4 py-2 rounded-lg disabled:opacity-60 whitespace-nowrap ml-4 ${
                          t.active ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'
                        }`}>
                        {actionLoading === t._id ? '...' : t.active ? 'Deactivate' : 'Activate'}
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

            {/* Test structure info */}
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-semibold text-yellow-800 mb-1">⏱ Test Structure</h3>
              <p className="text-sm text-yellow-700">
                <strong>Part 1:</strong> Physics + Chemistry — 90 min (combined)<br />
                <strong>Part 2:</strong> Mathematics — 90 min (unlocks after Part 1)<br />
                <strong>Marks:</strong> Physics & Chemistry = 1 mark/Q | Mathematics = 2 marks/Q<br />
                <strong>Total:</strong> 180 minutes
              </p>
            </div>

            {/* Quick import full mock test */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <Upload className="w-5 h-5" /> Quick Import Full Mock Test
              </h3>

              {/* Format info */}
              <div className="text-sm text-gray-600 mb-3 p-3 bg-white rounded border">
                <p className="font-medium mb-2">📋 Supported Formats:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-2 bg-green-50 rounded border border-green-200">
                    <p className="font-medium text-green-800">📊 Excel (.xlsx)</p>
                    <p className="text-xs text-green-700 mt-1">
                      3 sheets: Physics, Chemistry, Mathematics<br />
                      13 columns: Question, QuestionImage, Option1, Option1Image, ..., Correct, Explanation, ExplanationImage<br />
                      Use image URLs or base64 in image columns
                    </p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="font-medium text-blue-800">📝 Word (.docx)</p>
                    <p className="text-xs text-blue-700 mt-1">
                      Paste images directly into the document!<br />
                      Section headers: === PHYSICS === etc.<br />
                      Format: Q1. → A) B) C) D) → Correct: A → Explanation:<br />
                      Embedded images auto-extracted as base64
                    </p>
                  </div>
                </div>
              </div>

              {/* Download templates */}
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-700 mb-2">📥 Download Templates:</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadMockTestTemplate}
                    className="px-4 py-2 bg-white border border-green-300 rounded-lg text-sm hover:bg-green-50 inline-flex items-center gap-2">
                    <Download className="w-4 h-4 text-green-600" /> Excel Template
                  </button>
                  <button type="button" onClick={() => downloadWordTemplate('mock')}
                    className="px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm hover:bg-blue-50 inline-flex items-center gap-2">
                    <Download className="w-4 h-4 text-blue-600" /> Word Template
                  </button>
                </div>
              </div>

              {/* Upload */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">📤 Upload Full Mock Test:</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => mockFileInputRef.current?.click()} disabled={uploadingFile}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm inline-flex items-center gap-2 disabled:opacity-60">
                    <Upload className="w-4 h-4" />
                    {uploadingFile ? 'Processing...' : 'Upload Excel or Word File'}
                  </button>
                  <input ref={mockFileInputRef} type="file" accept=".xlsx,.xls,.docx"
                    onChange={handleMockTestFileUpload} className="hidden" />
                </div>
              </div>
            </div>

            {/* Title & Course */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Test Title *</label>
                <input type="text" placeholder="e.g., JEE Mock Test 1" value={testTitle}
                  onChange={e => setTestTitle(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Course *</label>
                <select value={testCourse} onChange={e => setTestCourse(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg">
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Section tabs */}
            <div className="flex gap-2 mb-4">
              {sections.map((section, idx) => {
                const colors = sectionTabColors[section.subject];
                const isActive = currentSection === idx;
                return (
                  <button key={section.subject} onClick={() => setCurrentSection(idx)}
                    className={`px-5 py-3 rounded-lg font-medium text-sm transition ${isActive ? colors.active : colors.inactive}`}>
                    {sectionLabels[section.subject]} ({section.questions.length}Q)
                    <span className="ml-1 text-xs opacity-75">{section.subject === 'maths' ? '2m/Q' : '1m/Q'}</span>
                  </button>
                );
              })}
            </div>

            {/* Current section area */}
            <div className={`border-2 rounded-lg p-5 mb-6 ${sectionColors[currentSubject]}`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <h3 className="text-lg font-semibold">
                  {sectionLabels[currentSubject]} Questions
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({currentSubject === 'maths' ? '2 marks' : '1 mark'} per question)
                  </span>
                </h3>

                {/* Section-level import */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={downloadSingleSectionTemplate}
                      className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1">
                      <Download className="w-3 h-3" /> Excel
                    </button>
                    <button type="button" onClick={() => downloadWordTemplate('section')}
                      className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1">
                      <Download className="w-3 h-3" /> Word
                    </button>
                  </div>
                  <button type="button" onClick={() => sectionFileInputRef.current?.click()} disabled={uploadingFile}
                    className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    {uploadingFile ? 'Processing...' : 'Import Excel/Word'}
                  </button>
                  <input ref={sectionFileInputRef} type="file" accept=".xlsx,.xls,.docx"
                    onChange={handleSectionFileUpload} className="hidden" />
                </div>
              </div>

              {/* Add question form */}
              <div className="bg-white rounded-lg border p-4 mb-4">
                <h4 className="font-medium text-sm text-gray-600 mb-3">
                  Add Question to {sectionLabels[currentSubject]}
                </h4>

                {/* Question text + image */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                    Question (text, image, or both)
                  </label>
                  <textarea
                    placeholder="Question text (leave empty if using image only)"
                    value={questionForm.question}
                    onChange={e => setQuestionForm({ ...questionForm, question: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg text-sm" rows={2}
                  />
                  <div className="flex gap-2 items-center mt-2 flex-wrap">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs hover:bg-gray-100 transition">
                      <ImageIcon className="w-3 h-3 text-blue-600" /> Add Image
                      <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'question')} className="hidden" />
                    </label>
                    {questionForm.questionImage && (
                      <div className="flex items-center gap-2 p-1 bg-blue-50 rounded border border-blue-200">
                        <img src={questionForm.questionImage} alt="" className="h-12 max-w-[120px] object-contain rounded" />
                        <button onClick={() => setQuestionForm({ ...questionForm, questionImage: '' })}
                          className="text-red-500 hover:text-red-700 text-xs px-1">✕</button>
                      </div>
                    )}
                    {!questionForm.question.trim() && !questionForm.questionImage && (
                      <span className="text-xs text-amber-600">⚠ Need text or image</span>
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {questionForm.options.map((opt, idx) => (
                    <div key={idx}
                      className={`border rounded-lg p-3 transition ${
                        questionForm.correct === idx
                          ? 'bg-green-50 border-green-300 ring-2 ring-green-200'
                          : 'bg-gray-50'
                      }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">
                          Option {String.fromCharCode(65 + idx)}
                        </span>
                        <button type="button"
                          onClick={() => setQuestionForm({ ...questionForm, correct: idx })}
                          className={`px-3 py-1 rounded text-xs font-medium transition ${
                            questionForm.correct === idx
                              ? 'bg-green-600 text-white shadow-sm'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}>
                          {questionForm.correct === idx ? '✓ Correct' : 'Set Correct'}
                        </button>
                      </div>
                      <input type="text"
                        placeholder={`Option ${String.fromCharCode(65 + idx)} text (or use image)`}
                        value={opt}
                        onChange={e => {
                          const newOpts = [...questionForm.options];
                          newOpts[idx] = e.target.value;
                          setQuestionForm({ ...questionForm, options: newOpts });
                        }}
                        className="w-full px-3 py-2 border rounded text-sm mb-2"
                      />
                      <div className="flex gap-2 items-center flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs hover:bg-gray-100 transition">
                          <ImageIcon className="w-3 h-3 text-blue-600" /> Image
                          <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'option', idx)} className="hidden" />
                        </label>
                        {questionForm.optionImages[idx] && (
                          <div className="flex items-center gap-1 p-1 bg-blue-50 rounded border border-blue-200">
                            <img src={questionForm.optionImages[idx]} alt=""
                              className="h-8 max-w-[60px] object-contain rounded" />
                            <button onClick={() => {
                              const newImages = [...questionForm.optionImages];
                              newImages[idx] = '';
                              setQuestionForm({ ...questionForm, optionImages: newImages });
                            }} className="text-red-500 text-xs px-1">✕</button>
                          </div>
                        )}
                        {!opt.trim() && !questionForm.optionImages[idx] && (
                          <span className="text-xs text-amber-600">⚠ Need text or image</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Explanation text + image */}
                <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <label className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 block">
                    Explanation (optional — text, image, or both)
                  </label>
                  <textarea
                    placeholder="Explanation text (optional)"
                    value={questionForm.explanation}
                    onChange={e => setQuestionForm({ ...questionForm, explanation: e.target.value })}
                    className="w-full px-3 py-2 border rounded text-sm mb-2" rows={2}
                  />
                  <div className="flex gap-2 items-center flex-wrap">
                    <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs hover:bg-gray-100 transition">
                      <ImageIcon className="w-3 h-3 text-amber-600" /> Explanation Image
                      <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'explanation')} className="hidden" />
                    </label>
                    {questionForm.explanationImage && (
                      <div className="flex items-center gap-2 p-1 bg-amber-100 rounded border border-amber-300">
                        <img src={questionForm.explanationImage} alt=""
                          className="h-12 max-w-[120px] object-contain rounded" />
                        <button onClick={() => setQuestionForm({ ...questionForm, explanationImage: '' })}
                          className="text-red-500 hover:text-red-700 text-xs px-1">✕</button>
                      </div>
                    )}
                  </div>
                </div>

                <button type="button" onClick={addQuestion}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition">
                  + Add Question
                </button>
              </div>

              {/* Questions preview */}
              {currentQuestions.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm text-gray-600 mb-2">
                    {sectionLabels[currentSubject]} Questions ({currentQuestions.length})
                  </h4>
                  <div className="max-h-[500px] overflow-y-auto space-y-2">
                    {currentQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 bg-white rounded border text-sm">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            {/* Question */}
                            <p className="font-medium">
                              Q{idx + 1}: {q.question || <span className="text-gray-400 italic">(Image question)</span>}
                            </p>
                            {q.questionImage && (
                              <div className="mt-1">
                                {renderImagePreview(q.questionImage, 'Question', 'h-20 max-w-[200px] object-contain rounded border')}
                              </div>
                            )}

                            {/* Options */}
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              {q.options.map((opt, optIdx) => (
                                <div key={optIdx}
                                  className={`text-xs px-2 py-1.5 rounded flex items-start gap-1 ${
                                    optIdx === q.correct
                                      ? 'bg-green-50 text-green-700 font-medium border border-green-200'
                                      : 'text-gray-600 bg-gray-50'
                                  }`}>
                                  <span className="font-semibold shrink-0">{String.fromCharCode(65 + optIdx)})</span>
                                  <div className="min-w-0">
                                    {opt && <span>{opt}</span>}
                                    {!opt && !(q.optionImages?.[optIdx]) && (
                                      <span className="text-gray-400">(empty)</span>
                                    )}
                                    {q.optionImages?.[optIdx] && (
                                      <div className="mt-1">
                                        {renderImagePreview(
                                          q.optionImages[optIdx],
                                          `Option ${String.fromCharCode(65 + optIdx)}`,
                                          'h-10 max-w-[80px] object-contain rounded border'
                                        )}
                                      </div>
                                    )}
                                    {optIdx === q.correct && <span className="ml-1 text-green-600">✓</span>}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Explanation */}
                            {(q.explanation || q.explanationImage) && (
                              <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                                {q.explanation && <p className="text-xs text-amber-800">💡 {q.explanation}</p>}
                                {q.explanationImage && (
                                  <div className="mt-1">
                                    {renderImagePreview(q.explanationImage, 'Explanation', 'h-14 max-w-[150px] object-contain rounded border')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <button type="button" onClick={() => removeQuestion(currentSection, idx)}
                            className="text-red-500 hover:text-red-700 ml-2 shrink-0">
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
                {sections.map(s => {
                  const imageQCount = s.questions.filter(q =>
                    q.questionImage || q.explanationImage || q.optionImages?.some(img => img)
                  ).length;
                  return (
                    <div key={s.subject}>
                      <span className="text-gray-600">{sectionLabels[s.subject]}:</span>{' '}
                      <strong>
                        {s.questions.length} Q × {s.subject === 'maths' ? 2 : 1} ={' '}
                        {s.questions.length * (s.subject === 'maths' ? 2 : 1)} marks
                      </strong>
                      {imageQCount > 0 && (
                        <span className="text-xs text-blue-600 block">📸 {imageQCount} with images</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-sm font-semibold border-t pt-2">
                Total: {sections.reduce((sum, s) => sum + s.questions.length, 0)} questions |{' '}
                {sections.reduce((sum, s) => sum + s.questions.length * (s.subject === 'maths' ? 2 : 1), 0)} marks | 180 min
              </div>
            </div>

            {/* Submit */}
            <button disabled={actionLoading === 'create'} onClick={createTest}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition">
              {actionLoading === 'create' ? 'Creating...' : 'Submit Test for Approval'}
            </button>
          </div>
        )}

        {/* ======================== MATERIALS TAB ======================== */}
        {activeTab === 'materials' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">Upload Study Material</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Material Title" value={materialForm.title}
                onChange={e => setMaterialForm({ ...materialForm, title: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg" />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select value={materialForm.course}
                  onChange={e => setMaterialForm({ ...materialForm, course: e.target.value })}
                  className="px-4 py-2 border rounded-lg">
                  <option value="">Select Course</option>
                  {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
                <input type="text" placeholder="Subject" value={materialForm.subject}
                  onChange={e => setMaterialForm({ ...materialForm, subject: e.target.value })}
                  className="px-4 py-2 border rounded-lg" />
                <select value={materialForm.type}
                  onChange={e => setMaterialForm({ ...materialForm, type: e.target.value as 'notes' | 'video' | 'pdf' })}
                  className="px-4 py-2 border rounded-lg">
                  <option value="notes">Notes</option>
                  <option value="video">Video Link</option>
                  <option value="pdf">PDF Link</option>
                </select>
              </div>

              <textarea placeholder="Content (Notes or URL)" value={materialForm.content}
                onChange={e => setMaterialForm({ ...materialForm, content: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg" rows={5} />

              <button disabled={actionLoading === 'material'}
                onClick={async () => {
                  if (materialForm.title && materialForm.content && materialForm.course && materialForm.subject) {
                    try {
                      setActionLoading('material');
                      await api('materials', 'POST', {
                        title: materialForm.title, course: materialForm.course,
                        subject: materialForm.subject, content: materialForm.content, type: materialForm.type,
                      });
                      const materialsData = await api('materials');
                      onMaterialsUpdate(materialsData);
                      setMaterialForm({ title: '', course: '', subject: '', content: '', type: 'notes' });
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
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {actionLoading === 'material' ? 'Uploading...' : 'Upload Material'}
              </button>
            </div>

            <div className="mt-8">
              <h3 className="font-bold mb-4">My Materials</h3>
              <div className="space-y-2">
                {materials.filter(isMyMaterial).length === 0 ? (
                  <p className="text-gray-500">No materials uploaded yet</p>
                ) : (
                  materials.filter(isMyMaterial).map(m => {
                    const matCourse = typeof m.course === 'string'
                      ? courses.find(c => c._id === m.course)?.name || m.course
                      : (m.course as any)?.name || 'Unknown';
                    return (
                      <div key={m._id} className="p-4 border rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium">{m.title}</p>
                          <p className="text-sm text-gray-600">{m.subject} | {m.type}</p>
                          <p className="text-xs text-gray-500 mt-1">Course: {matCourse}</p>
                        </div>
                        <button onClick={async () => {
                          if (!confirm('Delete this material?')) return;
                          try {
                            await api(`materials/${m._id}`, 'DELETE');
                            const materialsData = await api('materials');
                            onMaterialsUpdate(materialsData);
                          } catch (error: any) {
                            alert(error.message || 'Failed to delete');
                          }
                        }} className="text-red-500 hover:text-red-700">
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