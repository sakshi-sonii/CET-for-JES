import React, { useState, useRef } from 'react';
import { BookOpen, LogOut, Upload, ImageIcon, FileText, Trash2, Download, Plus } from 'lucide-react';
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

type SubjectKey = 'physics' | 'chemistry' | 'maths' | 'biology';

interface SectionForm {
  subject: SubjectKey;
  questions: Question[];
}

const ALL_SUBJECTS: {
  key: SubjectKey;
  label: string;
  marks: number;
  color: string;
  activeColor: string;
  inactiveColor: string;
  badgeColor: string;
}[] = [
  {
    key: 'physics',
    label: 'Physics',
    marks: 1,
    color: 'bg-blue-50 border-blue-200',
    activeColor: 'bg-blue-600 text-white',
    inactiveColor: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  {
    key: 'chemistry',
    label: 'Chemistry',
    marks: 1,
    color: 'bg-green-50 border-green-200',
    activeColor: 'bg-green-600 text-white',
    inactiveColor: 'bg-green-50 text-green-700 hover:bg-green-100',
    badgeColor: 'bg-green-100 text-green-800',
  },
  {
    key: 'maths',
    label: 'Mathematics',
    marks: 2,
    color: 'bg-purple-50 border-purple-200',
    activeColor: 'bg-purple-600 text-white',
    inactiveColor: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
    badgeColor: 'bg-purple-100 text-purple-800',
  },
  {
    key: 'biology',
    label: 'Biology',
    marks: 1,
    color: 'bg-orange-50 border-orange-200',
    activeColor: 'bg-orange-600 text-white',
    inactiveColor: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    badgeColor: 'bg-orange-100 text-orange-800',
  },
];

const getSubjectInfo = (key: string) =>
  ALL_SUBJECTS.find(s => s.key === key) || ALL_SUBJECTS[0];

const getMarksPerQuestion = (subject: string) =>
  subject === 'maths' ? 2 : 1;

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

  // Test form
  const [testTitle, setTestTitle] = useState('');
  const [testCourse, setTestCourse] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<SubjectKey[]>([]);
  const [sections, setSections] = useState<SectionForm[]>([]);
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
    const uid = String(user._id);
    return tid === uid;
  });

  const isMyMaterial = (m: Material) => {
    const mid =
      typeof m.teacherId === 'string'
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
      const marks = s.marksPerQuestion || getMarksPerQuestion(s.subject);
      return sum + (s.questions?.length || 0) * marks;
    }, 0);
  };

  // ========================
  // Subject selection
  // ========================
  const toggleSubject = (subject: SubjectKey) => {
    setSelectedSubjects(prev => {
      let newSelected: SubjectKey[];
      if (prev.includes(subject)) {
        newSelected = prev.filter(s => s !== subject);
      } else {
        newSelected = [...prev, subject];
      }

      // Rebuild sections preserving existing questions
      const newSections = newSelected.map(sub => {
        const existing = sections.find(s => s.subject === sub);
        return existing || { subject: sub, questions: [] };
      });
      setSections(newSections);

      // Fix current section index
      if (newSections.length > 0 && currentSection >= newSections.length) {
        setCurrentSection(newSections.length - 1);
      } else if (newSections.length === 0) {
        setCurrentSection(0);
      }

      return newSelected;
    });
  };

  const applyPreset = (preset: 'pcm' | 'pcb' | 'pcmb') => {
    let subjects: SubjectKey[];
    switch (preset) {
      case 'pcm':
        subjects = ['physics', 'chemistry', 'maths'];
        break;
      case 'pcb':
        subjects = ['physics', 'chemistry', 'biology'];
        break;
      case 'pcmb':
        subjects = ['physics', 'chemistry', 'maths', 'biology'];
        break;
      default:
        subjects = [];
    }
    setSelectedSubjects(subjects);
    setSections(
      subjects.map(sub => {
        const existing = sections.find(s => s.subject === sub);
        return existing || { subject: sub, questions: [] };
      })
    );
    setCurrentSection(0);
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
    className = 'h-16 max-w-xs object-contain rounded border'
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
      question: '',
      questionImage: '',
      options: ['', '', '', ''],
      optionImages: ['', '', '', ''],
      correct: 0,
      explanation: '',
      explanationImage: '',
    });
  };

  const addQuestion = () => {
    if (sections.length === 0) {
      alert('Please select at least one subject first');
      return;
    }

    const hasQuestionContent =
      questionForm.question.trim() || questionForm.questionImage;
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
    // Auto-add pending question
    const hasQ = questionForm.question.trim() || questionForm.questionImage;
    const allOpts = questionForm.options.every(
      (o, idx) => o.trim() || questionForm.optionImages[idx]
    );
    if (hasQ && allOpts && sections.length > 0) addQuestion();

    if (!testTitle.trim()) {
      alert('Please enter a test title');
      return;
    }
    if (!testCourse) {
      alert('Please select a course');
      return;
    }
    if (sections.length === 0) {
      alert('Please select at least one subject');
      return;
    }

    const totalQ = sections.reduce((sum, s) => sum + s.questions.length, 0);
    if (totalQ === 0) {
      alert('Please add at least one question to any section');
      return;
    }

    const emptySections = sections.filter(s => s.questions.length === 0);
    if (emptySections.length > 0) {
      const names = emptySections
        .map(s => getSubjectInfo(s.subject).label)
        .join(', ');
      if (
        !confirm(
          `${names} section(s) have no questions. Remove them and continue?`
        )
      )
        return;
    }

    setActionLoading('create');

    try {
      const payload = {
        title: testTitle,
        course: testCourse,
        testType: sections.filter(s => s.questions.length > 0).length === 1 ? 'subject' : 'mock',
        sections: sections
          .filter(s => s.questions.length > 0)
          .map(s => ({
            subject: s.subject,
            marksPerQuestion: getMarksPerQuestion(s.subject),
            questions: s.questions.map(q => ({
              question: q.question,
              questionImage: q.questionImage || undefined,
              options: q.options,
              optionImages:
                q.optionImages && q.optionImages.some(img => img)
                  ? q.optionImages
                  : undefined,
              correct: q.correct,
              explanation: q.explanation || '',
              explanationImage: q.explanationImage || undefined,
            })),
          })),
      };

      await api('tests', 'POST', payload);

      // Reset
      setTestTitle('');
      setTestCourse('');
      setSelectedSubjects([]);
      setSections([]);
      setCurrentSection(0);
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

  // ========================
  // Toggle active
  // ========================
  const handleToggleActive = async (
    testId: string,
    currentActive: boolean
  ) => {
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

    return jsonData
      .map((row: any) => {
        const correctRaw =
          row.Correct ?? row.correct ?? row.CorrectAnswer ?? 0;
        const correctNum = Number(correctRaw);
        const correct = isNaN(correctNum)
          ? 0
          : Math.max(0, Math.min(3, correctNum - 1));

        const questionImage =
          String(row.QuestionImage || row.questionImage || '') || undefined;
        const explanationImage =
          String(row.ExplanationImage || row.explanationImage || '') ||
          undefined;
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
          explanation:
            String(row.Explanation || row.explanation || '') || undefined,
          explanationImage,
        };
      })
      .filter((q: any) => {
        const hasQuestion = q.question || q.questionImage;
        const allOptionsValid = q.options.every(
          (o: string, idx: number) =>
            o || (q.optionImages && q.optionImages[idx])
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
  const parseWordLines = async (
    file: File
  ): Promise<{ text: string; images: string[] }[]> => {
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
    const elements = Array.from(
      doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
    );

    const lines: { text: string; images: string[] }[] = [];
    for (const el of elements) {
      const text = el.textContent?.trim() || '';
      const imgs = Array.from(el.querySelectorAll('img')).map(
        img => img.getAttribute('src') || ''
      );
      if (text || imgs.length > 0) {
        lines.push({ text, images: imgs });
      }
    }
    return lines;
  };

  const parseQuestionsFromLines = (
    lines: { text: string; images: string[] }[]
  ): Question[] => {
    const questions: Question[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const qMatch = line.text.match(
        /^(?:Q(?:uestion)?\s*)?(\d+)\s*[.:)\-]\s*(.*)/i
      );
      if (!qMatch) {
        i++;
        continue;
      }

      const questionText = qMatch[2]?.trim() || '';
      const questionImage = line.images[0] || '';

      const optionTexts: string[] = ['', '', '', ''];
      const optionImgs: string[] = ['', '', '', ''];
      let correct = 0;

      for (let oi = 0; oi < 4; oi++) {
        i++;
        if (i >= lines.length) break;
        const optLine = lines[i];
        const optMatch = optLine.text.match(
          /^\(?([A-Da-d])\)?\s*[.:)\-]?\s*(.*)/
        );
        if (optMatch) {
          optionTexts[oi] = optMatch[2]?.trim() || '';
          optionImgs[oi] = optLine.images[0] || '';
        } else {
          optionTexts[oi] = optLine.text;
          optionImgs[oi] = optLine.images[0] || '';
        }
      }

      i++;
      if (i < lines.length) {
        const corrLine = lines[i];
        const corrMatch = corrLine.text.match(
          /(?:correct|answer|ans)\s*[.:)\-]?\s*([A-Da-d1-4])/i
        );
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

      let explanation = '';
      let explanationImage = '';
      i++;
      if (i < lines.length) {
        const expLine = lines[i];
        const expMatch = expLine.text.match(
          /(?:explanation|explain|reason|hint)\s*[.:)\-]?\s*(.*)/i
        );
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

    const sectionContent: Record<
      SubjectKey,
      { text: string; images: string[] }[]
    > = {
      physics: [],
      chemistry: [],
      maths: [],
      biology: [],
    };

    let currentSubjectKey: SubjectKey | null = null;

    for (const line of lines) {
      const headerMatch = line.text.match(
        /^(?:[=\-*#]{2,}\s*)?(physics|chemistry|math(?:ematics|s)?|biology)\s*(?:[=\-*#]{2,})?$/i
      );
      if (headerMatch) {
        const name = headerMatch[1].toLowerCase();
        if (name === 'physics') currentSubjectKey = 'physics';
        else if (name === 'chemistry') currentSubjectKey = 'chemistry';
        else if (name.startsWith('math')) currentSubjectKey = 'maths';
        else if (name === 'biology') currentSubjectKey = 'biology';
        continue;
      }

      if (currentSubjectKey && (line.text || line.images.length > 0)) {
        sectionContent[currentSubjectKey].push(line);
      }
    }

    return (
      ['physics', 'chemistry', 'maths', 'biology'] as SubjectKey[]
    )
      .map(sub => ({
        subject: sub,
        questions: parseQuestionsFromLines(sectionContent[sub]),
      }))
      .filter(s => s.questions.length > 0);
  };

  // ========================
  // File upload handlers
  // ========================
  const handleSectionFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
          questions: [
            ...updated[currentSection].questions,
            ...questions,
          ],
        };
        return updated;
      });

      const imageCount = questions.filter(
        q =>
          q.questionImage ||
          q.explanationImage ||
          q.optionImages?.some(img => img)
      ).length;

      alert(
        `✅ Imported ${questions.length} questions to ${
          getSubjectInfo(sections[currentSection].subject).label
        }!` +
          (imageCount > 0
            ? `\n📸 ${imageCount} questions contain images.`
            : '')
      );
    } catch (error: any) {
      alert('Failed to parse file: ' + (error?.message || String(error)));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleMockTestFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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

        const sheetMap: Record<string, SubjectKey> = {
          Physics: 'physics',
          Chemistry: 'chemistry',
          Mathematics: 'maths',
          Maths: 'maths',
          Math: 'maths',
          Biology: 'biology',
        };

        newSections = [];
        for (const sheetName of workbook.SheetNames) {
          const subject = sheetMap[sheetName];
          if (!subject) continue;
          const worksheet = workbook.Sheets[sheetName];
          const questions = parseExcelSheet(XLSX, worksheet);
          if (questions.length > 0) {
            const existing = newSections.find(s => s.subject === subject);
            if (existing) existing.questions.push(...questions);
            else newSections.push({ subject, questions });
          }
        }
      } else {
        newSections = await parseWordMockTest(file);
      }

      const totalQ = newSections.reduce(
        (sum, s) => sum + s.questions.length,
        0
      );
      if (totalQ === 0) {
        alert(
          'No valid questions found.\n\n' +
            (isExcel
              ? 'Excel: Make sure sheet names are: Physics, Chemistry, Mathematics, Biology'
              : 'Word: Use section headers like === PHYSICS === etc.')
        );
        return;
      }

      // Auto-select imported subjects
      const importedSubjects = newSections.map(s => s.subject);
      setSelectedSubjects(importedSubjects);
      setSections(newSections);
      setCurrentSection(0);

      const totalImages = newSections.reduce(
        (sum, s) =>
          sum +
          s.questions.filter(
            q =>
              q.questionImage ||
              q.explanationImage ||
              q.optionImages?.some(img => img)
          ).length,
        0
      );

      const summary = newSections
        .map(
          s =>
            `${getSubjectInfo(s.subject).label}: ${s.questions.length}`
        )
        .join(', ');

      alert(
        `✅ Imported from ${isExcel ? 'Excel' : 'Word'}:\n${summary}\nTotal: ${totalQ} questions` +
          (totalImages > 0
            ? `\n📸 ${totalImages} questions contain images`
            : '')
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
    'Question',
    'QuestionImage',
    'Option1',
    'Option1Image',
    'Option2',
    'Option2Image',
    'Option3',
    'Option3Image',
    'Option4',
    'Option4Image',
    'Correct',
    'Explanation',
    'ExplanationImage',
  ];

  const excelColWidths = [
    { wch: 35 },
    { wch: 40 },
    { wch: 20 },
    { wch: 40 },
    { wch: 20 },
    { wch: 40 },
    { wch: 20 },
    { wch: 40 },
    { wch: 20 },
    { wch: 40 },
    { wch: 8 },
    { wch: 35 },
    { wch: 40 },
  ];

  const createInstructionSheet = (XLSX: any) => {
    const instrData = [
      ['📋 TEMPLATE INSTRUCTIONS'],
      [''],
      ['Column', 'Description', 'Required?'],
      ['Question', 'Question text', 'Yes (if no QuestionImage)'],
      [
        'QuestionImage',
        'Image URL or base64',
        'Yes (if no Question text)',
      ],
      ['Option1–4', 'Option text', 'Yes (if no OptionImage)'],
      [
        'Option1Image–4Image',
        'Option image URL or base64',
        'Yes (if no Option text)',
      ],
      ['Correct', 'Correct answer: 1, 2, 3, or 4', 'Yes'],
      ['Explanation', 'Explanation text', 'Optional'],
      [
        'ExplanationImage',
        'Explanation image URL or base64',
        'Optional',
      ],
      [''],
      ['💡 TIPS:'],
      ['• Each question/option: text OR image OR both'],
      ['• Correct: 1=Option1, 2=Option2, 3=Option3, 4=Option4'],
      ['• Images: full URLs (https://...) or base64 data'],
      [''],
      ['📊 MARKS PER QUESTION:'],
      ['• Physics = 1 mark/question'],
      ['• Chemistry = 1 mark/question'],
      ['• Mathematics = 2 marks/question'],
      ['• Biology = 1 mark/question'],
      [''],
      ['📝 TEST TYPES:'],
      ['• Single subject → Subject Test'],
      ['• Multiple subjects → Mock Test'],
      [
        '• For multi-subject Excel: use sheet names Physics, Chemistry, Mathematics, Biology',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(instrData);
    ws['!cols'] = [{ wch: 30 }, { wch: 50 }, { wch: 30 }];
    return ws;
  };

  const sampleRows = (subject: string) => {
    const samples: Record<string, string[][]> = {
      physics: [
        [
          'What is the SI unit of force?',
          '',
          'Joule',
          '',
          'Newton',
          '',
          'Watt',
          '',
          'Pascal',
          '',
          '2',
          'Newton is the SI unit of force',
          '',
        ],
        [
          'Identify the circuit:',
          'https://example.com/circuit.png',
          'Series',
          '',
          'Parallel',
          '',
          'Mixed',
          '',
          'None',
          '',
          '1',
          '',
          'https://example.com/circuit-sol.png',
        ],
      ],
      chemistry: [
        [
          'Atomic number of Carbon?',
          '',
          '5',
          '',
          '6',
          '',
          '7',
          '',
          '8',
          '',
          '2',
          'Carbon has 6 protons',
          '',
        ],
        [
          'Identify the molecular structure:',
          'https://example.com/mol.png',
          '',
          'https://example.com/a.png',
          '',
          'https://example.com/b.png',
          '',
          'https://example.com/c.png',
          '',
          'https://example.com/d.png',
          '2',
          '',
          'https://example.com/mol-sol.png',
        ],
      ],
      maths: [
        [
          'Value of π (approx)?',
          '',
          '3.14',
          '',
          '2.71',
          '',
          '1.41',
          '',
          '1.73',
          '',
          '1',
          'π ≈ 3.14159',
          '',
        ],
        [
          'Solve the equation:',
          'https://example.com/eq.png',
          'x=1',
          '',
          'x=2',
          '',
          'x=3',
          '',
          'x=4',
          '',
          '2',
          'Solution:',
          'https://example.com/sol.png',
        ],
      ],
      biology: [
        [
          'Powerhouse of the cell?',
          '',
          'Nucleus',
          '',
          'Mitochondria',
          '',
          'Ribosome',
          '',
          'Golgi body',
          '',
          '2',
          'Mitochondria produces ATP',
          '',
        ],
        [
          'Identify the organ:',
          'https://example.com/organ.png',
          'Heart',
          '',
          'Liver',
          '',
          'Kidney',
          '',
          'Lung',
          '',
          '3',
          '',
          'https://example.com/kidney-sol.png',
        ],
      ],
    };
    return samples[subject] || samples.physics;
  };

  const downloadSingleSectionTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const subject = sections[currentSection]?.subject || 'physics';
      const wsData = [excelHeaders, ...sampleRows(subject)];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = excelColWidths;

      const wb = {
        Sheets: {
          Questions: ws,
          Instructions: createInstructionSheet(XLSX),
        },
        SheetNames: ['Questions', 'Instructions'],
      };
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(
        new Blob([wbout], { type: 'application/octet-stream' }),
        `${getSubjectInfo(subject).label.toLowerCase()}_template.xlsx`
      );
    } catch {
      alert('Failed to create template');
    }
  };

  const downloadMockTestTemplate = async () => {
    try {
      const XLSX = await import('xlsx');
      const subjects =
        selectedSubjects.length > 0
          ? selectedSubjects
          : (['physics', 'chemistry', 'maths', 'biology'] as SubjectKey[]);

      const sheets: Record<string, any> = {};
      const sheetNames: string[] = [];

      for (const sub of subjects) {
        const info = getSubjectInfo(sub);
        const wsData = [excelHeaders, ...sampleRows(sub)];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = excelColWidths;
        sheets[info.label] = ws;
        sheetNames.push(info.label);
      }

      sheets['Instructions'] = createInstructionSheet(XLSX);
      sheetNames.push('Instructions');

      const wbout = XLSX.write(
        { Sheets: sheets, SheetNames: sheetNames },
        { bookType: 'xlsx', type: 'array' }
      );
      downloadBlob(
        new Blob([wbout], { type: 'application/octet-stream' }),
        'mock_test_template.xlsx'
      );
    } catch {
      alert('Failed to create template');
    }
  };

  const downloadWordTemplate = async (type: 'section' | 'mock') => {
    try {
      const docx = await import('docx');
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

      const createInstructions = (): InstanceType<typeof Paragraph>[] => [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: '📋 WORD TEMPLATE INSTRUCTIONS',
              bold: true,
              size: 28,
            }),
          ],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'FORMAT RULES — Follow exactly:',
              bold: true,
              size: 24,
              color: 'FF0000',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '• Questions: Q1. or Q1: or 1. or 1: or Question 1:',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '• Options: A) B) C) D) or a) b) c) d) or (A) (B) (C) (D)',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '• Correct: "Correct: A" or "Answer: 2" or "Ans: B"',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '• Explanation (optional): "Explanation: text"',
              size: 22,
            }),
          ],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [
            new TextRun({
              text: '🖼️ PASTE IMAGES directly into the document! They auto-extract as base64.',
              bold: true,
              size: 24,
              color: '0066CC',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '⚠️ Each question/option MUST have text OR image.',
              bold: true,
              size: 22,
              color: 'FF6600',
            }),
          ],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [
            new TextRun({
              text: '📊 Marks: Physics=1, Chemistry=1, Maths=2, Biology=1 per question',
              size: 22,
            }),
          ],
        }),
        new Paragraph({ children: [] }),
      ];

      const createSampleQuestions = (
        subject: string
      ): InstanceType<typeof Paragraph>[] => [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: `--- ${subject} (Replace with your questions) ---`,
              bold: true,
              size: 24,
            }),
          ],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Q1. Sample text question?',
              bold: true,
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'A) First option', size: 22 })],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'B) Second option', size: 22 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'C) Third option (correct)',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'D) Fourth option', size: 22 }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Correct: C',
              size: 22,
              color: '008800',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Explanation: Why C is correct.',
              size: 22,
              italics: true,
            }),
          ],
        }),
        new Paragraph({ children: [] }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Q2. Image question: [PASTE IMAGE HERE]',
              bold: true,
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'A) Option text or [PASTE OPTION IMAGE]',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'B) Option B', size: 22 })],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'C) Option C', size: 22 })],
        }),
        new Paragraph({
          children: [new TextRun({ text: 'D) Option D', size: 22 })],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Correct: A',
              size: 22,
              color: '008800',
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Explanation: [PASTE EXPLANATION IMAGE or type text]',
              size: 22,
              italics: true,
            }),
          ],
        }),
        new Paragraph({ children: [] }),
      ];

      const subjectColors: Record<string, string> = {
        Physics: '0000FF',
        Chemistry: '008800',
        Mathematics: '880088',
        Biology: 'CC6600',
      };

      let doc: InstanceType<typeof Document>;

      if (type === 'section') {
        const subLabel = sections[currentSection]
          ? getSubjectInfo(sections[currentSection].subject).label
          : 'Section';
        doc = new Document({
          sections: [
            {
              children: [
                ...createInstructions(),
                ...createSampleQuestions(subLabel),
              ],
            },
          ],
        });
      } else {
        const subjects =
          selectedSubjects.length > 0
            ? selectedSubjects.map(s => getSubjectInfo(s).label)
            : ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

        const children: InstanceType<typeof Paragraph>[] = [
          ...createInstructions(),
        ];

        for (const sub of subjects) {
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [
                new TextRun({
                  text: `=== ${sub.toUpperCase()} ===`,
                  bold: true,
                  size: 32,
                  color: subjectColors[sub] || '000000',
                }),
              ],
            }),
            new Paragraph({ children: [] }),
            ...createSampleQuestions(sub)
          );
        }

        doc = new Document({ sections: [{ children }] });
      }

      const blob = await Packer.toBlob(doc);
      downloadBlob(
        blob,
        type === 'section'
          ? 'section_template.docx'
          : 'mock_test_template.docx'
      );
    } catch (error: any) {
      console.error('Word template error:', error);
      alert(
        'Failed to create Word template: ' +
          (error?.message || 'Unknown error')
      );
    }
  };

  // ========================
  // Current section data
  // ========================
  const currentQuestions = sections[currentSection]?.questions || [];
  const currentSubject = sections[currentSection]?.subject || 'physics';
  const currentSubjectInfo = getSubjectInfo(currentSubject);

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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-bold">{t.title}</h3>
                        {t.sections && t.sections.length === 1 && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            Subject Test
                          </span>
                        )}
                        {t.sections && t.sections.length > 1 && (
                          <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                            Mock Test
                          </span>
                        )}
                      </div>

                      {/* Section badges */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {t.sections?.map(s => {
                          const info = getSubjectInfo(s.subject);
                          return (
                            <span
                              key={s.subject}
                              className={`px-3 py-1 rounded-full text-xs font-medium ${info.badgeColor}`}
                            >
                              {info.label}:{' '}
                              {s.questions?.length || 0}Q ×{' '}
                              {s.marksPerQuestion ||
                                getMarksPerQuestion(s.subject)}
                              m
                            </span>
                          );
                        })}
                      </div>

                      <p className="text-sm text-gray-500 mt-2">
                        {getTotalQuestions(t)} questions |{' '}
                        {getTotalMarks(t)} marks
                        {t.totalDuration
                          ? ` | ${t.totalDuration} min`
                          : ''}
                      </p>

                      {t.sectionTimings && (
                        <div className="text-xs text-gray-400 mt-1">
                          {t.sectionTimings.physicsChemistry &&
                            `Phy+Chem: ${t.sectionTimings.physicsChemistry} min`}
                          {t.sectionTimings.maths &&
                            ` | Maths: ${t.sectionTimings.maths} min`}
                        </div>
                      )}

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
                        onClick={() =>
                          handleToggleActive(t._id, t.active)
                        }
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
            <h2 className="text-xl font-bold mb-6">Create Test</h2>

            {/* Subject selection */}
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <h3 className="font-semibold text-indigo-800 mb-3">
                📚 Select Subjects
              </h3>
              <p className="text-sm text-indigo-600 mb-3">
                Choose one or more subjects. Single subject = Subject
                Test. Multiple = Mock Test.
                <br />
                <span className="text-xs">
                  Maths (2 marks/Q) and Biology (1 mark/Q) are optional
                  alternatives.
                </span>
              </p>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="text-xs font-medium text-gray-500 self-center mr-1">
                  Presets:
                </span>
                <button
                  onClick={() => applyPreset('pcm')}
                  className="px-3 py-1 text-xs bg-white border rounded-full hover:bg-gray-50 transition"
                >
                  PCM (Phy + Chem + Maths)
                </button>
                <button
                  onClick={() => applyPreset('pcb')}
                  className="px-3 py-1 text-xs bg-white border rounded-full hover:bg-gray-50 transition"
                >
                  PCB (Phy + Chem + Bio)
                </button>
                <button
                  onClick={() => applyPreset('pcmb')}
                  className="px-3 py-1 text-xs bg-white border rounded-full hover:bg-gray-50 transition"
                >
                  All 4 Subjects
                </button>
              </div>

              {/* Subject toggles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ALL_SUBJECTS.map(sub => {
                  const isSelected = selectedSubjects.includes(sub.key);
                  const qCount =
                    sections.find(s => s.subject === sub.key)
                      ?.questions.length || 0;
                  return (
                    <button
                      key={sub.key}
                      onClick={() => toggleSubject(sub.key)}
                      className={`p-3 rounded-lg border-2 text-left transition ${
                        isSelected
                          ? `${sub.color} border-current ring-2 ring-offset-1`
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {sub.label}
                        </span>
                        {isSelected ? (
                          <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">
                            ✓
                          </span>
                        ) : (
                          <Plus className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div className="text-xs mt-1 text-gray-500">
                        {sub.marks} mark
                        {sub.marks > 1 ? 's' : ''}/Q
                        {isSelected && qCount > 0 && (
                          <span className="ml-1 font-medium text-green-600">
                            • {qCount}Q added
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedSubjects.length > 0 && (
                <div className="mt-3 text-sm">
                  <span className="font-medium">
                    {selectedSubjects.length === 1
                      ? '📝 Subject Test: '
                      : '📋 Mock Test: '}
                  </span>
                  {selectedSubjects
                    .map(s => getSubjectInfo(s).label)
                    .join(' + ')}
                </div>
              )}
            </div>

            {/* Test info box — only show for multi-subject */}
            {selectedSubjects.length > 1 && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-semibold text-yellow-800 mb-1">
                  ⏱ Mock Test Structure
                </h3>
                <p className="text-sm text-yellow-700">
                  <strong>Subjects:</strong>{' '}
                  {selectedSubjects
                    .map(s => {
                      const info = getSubjectInfo(s);
                      return `${info.label} (${info.marks}m/Q)`;
                    })
                    .join(', ')}
                  <br />
                  <strong>Note:</strong> Physics & Chemistry = 1
                  mark/Q | Mathematics = 2 marks/Q | Biology = 1
                  mark/Q
                </p>
              </div>
            )}

            {/* Bulk import */}
            {selectedSubjects.length > 0 && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  {selectedSubjects.length > 1
                    ? 'Quick Import Full Mock Test'
                    : 'Quick Import Questions'}
                </h3>

                <div className="text-sm text-gray-600 mb-3 p-3 bg-white rounded border">
                  <p className="font-medium mb-2">
                    📋 Supported Formats:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-2 bg-green-50 rounded border border-green-200">
                      <p className="font-medium text-green-800">
                        📊 Excel (.xlsx)
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        {selectedSubjects.length > 1
                          ? `Sheets: ${selectedSubjects
                              .map(s => getSubjectInfo(s).label)
                              .join(', ')}`
                          : 'Single sheet with questions'}
                        <br />
                        13 columns including image support
                      </p>
                    </div>
                    <div className="p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="font-medium text-blue-800">
                        📝 Word (.docx)
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Paste images directly!
                        <br />
                        {selectedSubjects.length > 1
                          ? 'Use === SUBJECT === headers'
                          : 'Q1. → A) B) C) D) format'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Templates */}
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    📥 Download Templates:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSubjects.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={downloadMockTestTemplate}
                          className="px-4 py-2 bg-white border border-green-300 rounded-lg text-sm hover:bg-green-50 inline-flex items-center gap-2"
                        >
                          <Download className="w-4 h-4 text-green-600" />
                          Excel Template
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadWordTemplate('mock')
                          }
                          className="px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm hover:bg-blue-50 inline-flex items-center gap-2"
                        >
                          <Download className="w-4 h-4 text-blue-600" />
                          Word Template
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={downloadSingleSectionTemplate}
                          className="px-4 py-2 bg-white border border-green-300 rounded-lg text-sm hover:bg-green-50 inline-flex items-center gap-2"
                        >
                          <Download className="w-4 h-4 text-green-600" />
                          Excel Template
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadWordTemplate('section')
                          }
                          className="px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm hover:bg-blue-50 inline-flex items-center gap-2"
                        >
                          <Download className="w-4 h-4 text-blue-600" />
                          Word Template
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Upload for multi-subject */}
                {selectedSubjects.length > 1 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      📤 Upload All Subjects at Once:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          mockFileInputRef.current?.click()
                        }
                        disabled={uploadingFile}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm inline-flex items-center gap-2 disabled:opacity-60"
                      >
                        <Upload className="w-4 h-4" />
                        {uploadingFile
                          ? 'Processing...'
                          : 'Upload Excel or Word File'}
                      </button>
                      <input
                        ref={mockFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.docx"
                        onChange={handleMockTestFileUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Title & Course */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Test Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Physics Chapter 1 Test or JEE Mock Test 1"
                  value={testTitle}
                  onChange={e => setTestTitle(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Course *
                </label>
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

            {/* Section tabs & question area */}
            {sections.length > 0 && (
              <>
                {/* Section tabs */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {sections.map((section, idx) => {
                    const info = getSubjectInfo(section.subject);
                    const isActive = currentSection === idx;
                    return (
                      <button
                        key={section.subject}
                        onClick={() => setCurrentSection(idx)}
                        className={`px-5 py-3 rounded-lg font-medium text-sm transition ${
                          isActive
                            ? info.activeColor
                            : info.inactiveColor
                        }`}
                      >
                        {info.label} ({section.questions.length}Q)
                        <span className="ml-1 text-xs opacity-75">
                          {info.marks}m/Q
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Current section area */}
                <div
                  className={`border-2 rounded-lg p-5 mb-6 ${currentSubjectInfo.color}`}
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                    <h3 className="text-lg font-semibold">
                      {currentSubjectInfo.label} Questions
                      <span className="text-sm font-normal text-gray-600 ml-2">
                        ({currentSubjectInfo.marks} mark
                        {currentSubjectInfo.marks > 1 ? 's' : ''}{' '}
                        per question)
                      </span>
                    </h3>

                    {/* Per-section import */}
                    <div className="flex flex-wrap gap-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={downloadSingleSectionTemplate}
                          className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Excel
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadWordTemplate('section')
                          }
                          className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Word
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          sectionFileInputRef.current?.click()
                        }
                        disabled={uploadingFile}
                        className="px-2 py-1 bg-white border rounded text-xs hover:bg-gray-50 inline-flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" />
                        {uploadingFile ? '...' : 'Import Excel/Word'}
                      </button>
                      <input
                        ref={sectionFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.docx"
                        onChange={handleSectionFileUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Add question form */}
                  <div className="bg-white rounded-lg border p-4 mb-4">
                    <h4 className="font-medium text-sm text-gray-600 mb-3">
                      Add Question to{' '}
                      {currentSubjectInfo.label}
                    </h4>

                    {/* Question text + image */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                        Question (text, image, or both)
                      </label>
                      <textarea
                        placeholder="Question text (leave empty if using image only)"
                        value={questionForm.question}
                        onChange={e =>
                          setQuestionForm({
                            ...questionForm,
                            question: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2 border rounded-lg text-sm"
                        rows={2}
                      />
                      <div className="flex gap-2 items-center mt-2 flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs hover:bg-gray-100 transition">
                          <ImageIcon className="w-3 h-3 text-blue-600" />
                          Add Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e =>
                              handleImageUpload(e, 'question')
                            }
                            className="hidden"
                          />
                        </label>
                        {questionForm.questionImage && (
                          <div className="flex items-center gap-2 p-1 bg-blue-50 rounded border border-blue-200">
                            <img
                              src={questionForm.questionImage}
                              alt=""
                              className="h-12 max-w-[120px] object-contain rounded"
                            />
                            <button
                              onClick={() =>
                                setQuestionForm({
                                  ...questionForm,
                                  questionImage: '',
                                })
                              }
                              className="text-red-500 hover:text-red-700 text-xs px-1"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        {!questionForm.question.trim() &&
                          !questionForm.questionImage && (
                            <span className="text-xs text-amber-600">
                              ⚠ Need text or image
                            </span>
                          )}
                      </div>
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {questionForm.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className={`border rounded-lg p-3 transition ${
                            questionForm.correct === idx
                              ? 'bg-green-50 border-green-300 ring-2 ring-green-200'
                              : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-500">
                              Option{' '}
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setQuestionForm({
                                  ...questionForm,
                                  correct: idx,
                                })
                              }
                              className={`px-3 py-1 rounded text-xs font-medium transition ${
                                questionForm.correct === idx
                                  ? 'bg-green-600 text-white shadow-sm'
                                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                              }`}
                            >
                              {questionForm.correct === idx
                                ? '✓ Correct'
                                : 'Set Correct'}
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder={`Option ${String.fromCharCode(
                              65 + idx
                            )} text (or use image)`}
                            value={opt}
                            onChange={e => {
                              const newOpts = [
                                ...questionForm.options,
                              ];
                              newOpts[idx] = e.target.value;
                              setQuestionForm({
                                ...questionForm,
                                options: newOpts,
                              });
                            }}
                            className="w-full px-3 py-2 border rounded text-sm mb-2"
                          />
                          <div className="flex gap-2 items-center flex-wrap">
                            <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-white border rounded text-xs hover:bg-gray-100 transition">
                              <ImageIcon className="w-3 h-3 text-blue-600" />
                              Image
                              <input
                                type="file"
                                accept="image/*"
                                onChange={e =>
                                  handleImageUpload(
                                    e,
                                    'option',
                                    idx
                                  )
                                }
                                className="hidden"
                              />
                            </label>
                            {questionForm.optionImages[idx] && (
                              <div className="flex items-center gap-1 p-1 bg-blue-50 rounded border border-blue-200">
                                <img
                                  src={
                                    questionForm.optionImages[idx]
                                  }
                                  alt=""
                                  className="h-8 max-w-[60px] object-contain rounded"
                                />
                                <button
                                  onClick={() => {
                                    const newImages = [
                                      ...questionForm.optionImages,
                                    ];
                                    newImages[idx] = '';
                                    setQuestionForm({
                                      ...questionForm,
                                      optionImages: newImages,
                                    });
                                  }}
                                  className="text-red-500 text-xs px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                            {!opt.trim() &&
                              !questionForm.optionImages[idx] && (
                                <span className="text-xs text-amber-600">
                                  ⚠ Need text or image
                                </span>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Explanation */}
                    <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <label className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 block">
                        Explanation (optional — text, image, or both)
                      </label>
                      <textarea
                        placeholder="Explanation text (optional)"
                        value={questionForm.explanation}
                        onChange={e =>
                          setQuestionForm({
                            ...questionForm,
                            explanation: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border rounded text-sm mb-2"
                        rows={2}
                      />
                      <div className="flex gap-2 items-center flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs hover:bg-gray-100 transition">
                          <ImageIcon className="w-3 h-3 text-amber-600" />
                          Explanation Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e =>
                              handleImageUpload(e, 'explanation')
                            }
                            className="hidden"
                          />
                        </label>
                        {questionForm.explanationImage && (
                          <div className="flex items-center gap-2 p-1 bg-amber-100 rounded border border-amber-300">
                            <img
                              src={questionForm.explanationImage}
                              alt=""
                              className="h-12 max-w-[120px] object-contain rounded"
                            />
                            <button
                              onClick={() =>
                                setQuestionForm({
                                  ...questionForm,
                                  explanationImage: '',
                                })
                              }
                              className="text-red-500 hover:text-red-700 text-xs px-1"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addQuestion}
                      className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition"
                    >
                      + Add Question
                    </button>
                  </div>

                  {/* Questions preview */}
                  {currentQuestions.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-gray-600 mb-2">
                        {currentSubjectInfo.label} Questions (
                        {currentQuestions.length})
                      </h4>
                      <div className="max-h-[500px] overflow-y-auto space-y-2">
                        {currentQuestions.map((q, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-white rounded border text-sm"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                {/* Question */}
                                <p className="font-medium">
                                  Q{idx + 1}:{' '}
                                  {q.question || (
                                    <span className="text-gray-400 italic">
                                      (Image question)
                                    </span>
                                  )}
                                </p>
                                {q.questionImage && (
                                  <div className="mt-1">
                                    {renderImagePreview(
                                      q.questionImage,
                                      'Question',
                                      'h-20 max-w-[200px] object-contain rounded border'
                                    )}
                                  </div>
                                )}

                                {/* Options */}
                                <div className="mt-2 grid grid-cols-2 gap-1">
                                  {q.options.map((opt, optIdx) => (
                                    <div
                                      key={optIdx}
                                      className={`text-xs px-2 py-1.5 rounded flex items-start gap-1 ${
                                        optIdx === q.correct
                                          ? 'bg-green-50 text-green-700 font-medium border border-green-200'
                                          : 'text-gray-600 bg-gray-50'
                                      }`}
                                    >
                                      <span className="font-semibold shrink-0">
                                        {String.fromCharCode(
                                          65 + optIdx
                                        )}
                                        )
                                      </span>
                                      <div className="min-w-0">
                                        {opt && (
                                          <span>{opt}</span>
                                        )}
                                        {!opt &&
                                          !q.optionImages?.[
                                            optIdx
                                          ] && (
                                            <span className="text-gray-400">
                                              (empty)
                                            </span>
                                          )}
                                        {q.optionImages?.[
                                          optIdx
                                        ] && (
                                          <div className="mt-1">
                                            {renderImagePreview(
                                              q.optionImages[
                                                optIdx
                                              ],
                                              `Option ${String.fromCharCode(
                                                65 + optIdx
                                              )}`,
                                              'h-10 max-w-[80px] object-contain rounded border'
                                            )}
                                          </div>
                                        )}
                                        {optIdx === q.correct && (
                                          <span className="ml-1 text-green-600">
                                            ✓
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Explanation */}
                                {(q.explanation ||
                                  q.explanationImage) && (
                                  <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                                    {q.explanation && (
                                      <p className="text-xs text-amber-800">
                                        💡 {q.explanation}
                                      </p>
                                    )}
                                    {q.explanationImage && (
                                      <div className="mt-1">
                                        {renderImagePreview(
                                          q.explanationImage,
                                          'Explanation',
                                          'h-14 max-w-[150px] object-contain rounded border'
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  removeQuestion(
                                    currentSection,
                                    idx
                                  )
                                }
                                className="text-red-500 hover:text-red-700 ml-2 shrink-0"
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
              </>
            )}

            {/* Empty state when no subjects selected */}
            {sections.length === 0 && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center mb-6">
                <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 text-lg">
                  Select subjects above to start adding questions
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  You can create a single-subject test or
                  multi-subject mock test
                </p>
              </div>
            )}

            {/* Test summary */}
            {sections.length > 0 && (
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="font-semibold mb-2">
                  📊 Test Summary
                </h4>
                <div
                  className={`grid gap-4 text-sm ${
                    sections.length === 1
                      ? 'grid-cols-1'
                      : sections.length <= 3
                      ? 'grid-cols-3'
                      : 'grid-cols-4'
                  }`}
                >
                  {sections.map(s => {
                    const info = getSubjectInfo(s.subject);
                    const imageQCount = s.questions.filter(
                      q =>
                        q.questionImage ||
                        q.explanationImage ||
                        q.optionImages?.some(img => img)
                    ).length;
                    return (
                      <div key={s.subject}>
                        <span className="text-gray-600">
                          {info.label}:
                        </span>{' '}
                        <strong>
                          {s.questions.length} Q × {info.marks} ={' '}
                          {s.questions.length * info.marks} marks
                        </strong>
                        {imageQCount > 0 && (
                          <span className="text-xs text-blue-600 block">
                            📸 {imageQCount} with images
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-sm font-semibold border-t pt-2">
                  {sections.length === 1
                    ? '📝 Subject Test'
                    : '📋 Mock Test'}{' '}
                  — Total:{' '}
                  {sections.reduce(
                    (sum, s) => sum + s.questions.length,
                    0
                  )}{' '}
                  questions |{' '}
                  {sections.reduce(
                    (sum, s) =>
                      sum +
                      s.questions.length *
                        getMarksPerQuestion(s.subject),
                    0
                  )}{' '}
                  marks
                </div>
              </div>
            )}

            {/* Submit button */}
            {sections.length > 0 && (
              <button
                disabled={actionLoading === 'create'}
                onClick={createTest}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {actionLoading === 'create'
                  ? 'Creating...'
                  : 'Submit Test for Approval'}
              </button>
            )}
          </div>
        )}

        {/* ======================== MATERIALS TAB ======================== */}
        {activeTab === 'materials' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-6">
              Upload Study Material
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Material Title"
                value={materialForm.title}
                onChange={e =>
                  setMaterialForm({
                    ...materialForm,
                    title: e.target.value,
                  })
                }
                className="w-full px-4 py-2 border rounded-lg"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select
                  value={materialForm.course}
                  onChange={e =>
                    setMaterialForm({
                      ...materialForm,
                      course: e.target.value,
                    })
                  }
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
                  onChange={e =>
                    setMaterialForm({
                      ...materialForm,
                      subject: e.target.value,
                    })
                  }
                  className="px-4 py-2 border rounded-lg"
                />

                <select
                  value={materialForm.type}
                  onChange={e =>
                    setMaterialForm({
                      ...materialForm,
                      type: e.target.value as
                        | 'notes'
                        | 'video'
                        | 'pdf',
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
                onChange={e =>
                  setMaterialForm({
                    ...materialForm,
                    content: e.target.value,
                  })
                }
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
                      alert(
                        error.message ||
                          'Failed to upload material'
                      );
                    } finally {
                      setActionLoading(null);
                    }
                  } else {
                    alert('Please fill all fields');
                  }
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {actionLoading === 'material'
                  ? 'Uploading...'
                  : 'Upload Material'}
              </button>
            </div>

            {/* My Materials */}
            <div className="mt-8">
              <h3 className="font-bold mb-4">My Materials</h3>
              <div className="space-y-2">
                {materials.filter(isMyMaterial).length === 0 ? (
                  <p className="text-gray-500">
                    No materials uploaded yet
                  </p>
                ) : (
                  materials.filter(isMyMaterial).map(m => {
                    const matCourse =
                      typeof m.course === 'string'
                        ? courses.find(c => c._id === m.course)
                            ?.name || m.course
                        : (m.course as any)?.name || 'Unknown';

                    return (
                      <div
                        key={m._id}
                        className="p-4 border rounded-lg flex justify-between items-center"
                      >
                        <div>
                          <p className="font-medium">{m.title}</p>
                          <p className="text-sm text-gray-600">
                            {m.subject} | {m.type}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Course: {matCourse}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this material?'))
                              return;
                            try {
                              await api(
                                `materials/${m._id}`,
                                'DELETE'
                              );
                              const materialsData =
                                await api('materials');
                              onMaterialsUpdate(materialsData);
                            } catch (error: any) {
                              alert(
                                error.message ||
                                  'Failed to delete'
                              );
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