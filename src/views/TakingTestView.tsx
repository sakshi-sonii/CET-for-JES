import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, CheckCircle, Circle, AlertCircle, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { Test, TestSection, TestType, SubjectKey, CourseStream } from '../types';

// Phases for mock tests: physics_chemistry -> transition -> maths_or_biology -> submitted
// Phases for custom tests: custom_active -> submitted
type TestPhase = 'physics_chemistry' | 'transition' | 'maths_or_biology' | 'custom_active' | 'submitted';

interface TakingTestViewProps {
  test: Test;
  onSubmit: (answers: Record<string, number>) => void;
  onBack: () => void;
}

const SUBJECT_COLORS: Record<string, {
  active: string;
  inactive: string;
  readOnly: string;
  badge: string;
  header: string;
  timer: string;
}> = {
  physics: {
    active: 'bg-blue-600 text-white',
    inactive: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100',
    readOnly: 'bg-gray-100 text-gray-500 border border-gray-300',
    badge: 'bg-blue-100 text-blue-800',
    header: 'bg-blue-100 text-blue-800',
    timer: 'bg-blue-100 text-blue-800',
  },
  chemistry: {
    active: 'bg-green-600 text-white',
    inactive: 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100',
    readOnly: 'bg-gray-100 text-gray-500 border border-gray-300',
    badge: 'bg-green-100 text-green-800',
    header: 'bg-green-100 text-green-800',
    timer: 'bg-green-100 text-green-800',
  },
  maths: {
    active: 'bg-purple-600 text-white',
    inactive: 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100',
    readOnly: 'bg-gray-100 text-gray-500 border border-gray-300',
    badge: 'bg-purple-100 text-purple-800',
    header: 'bg-purple-100 text-purple-800',
    timer: 'bg-purple-100 text-purple-800',
  },
  biology: {
    active: 'bg-orange-600 text-white',
    inactive: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100',
    readOnly: 'bg-gray-100 text-gray-500 border border-gray-300',
    badge: 'bg-orange-100 text-orange-800',
    header: 'bg-orange-100 text-orange-800',
    timer: 'bg-orange-100 text-orange-800',
  },
};

const getSubjectColor = (subject: string) =>
  SUBJECT_COLORS[subject] || SUBJECT_COLORS.physics;

const getSubjectLabel = (subject: string): string => {
  switch (subject) {
    case 'physics': return 'Physics';
    case 'chemistry': return 'Chemistry';
    case 'maths': return 'Mathematics';
    case 'biology': return 'Biology';
    default: return subject;
  }
};

const getMarksPerQuestion = (subject: string, section?: TestSection): number => {
  if (section?.marksPerQuestion) return section.marksPerQuestion;
  return subject === 'maths' ? 2 : 1;
};

const TakingTestView: React.FC<TakingTestViewProps> = ({
  test,
  onSubmit,
}) => {
  const sections = test.sections || [];
  const testType: TestType = test.testType || (sections.length > 1 ? 'mock' : 'custom');
  const stream: CourseStream | undefined = test.stream;

  // Determine phase 2 subject for mock tests
  const getPhase2Subject = (): SubjectKey => {
    if (stream === 'PCB') return 'biology';
    // Check if maths section exists, otherwise fall back to biology
    const hasMaths = sections.some(s => s.subject === 'maths');
    const hasBiology = sections.some(s => s.subject === 'biology');
    if (hasMaths) return 'maths';
    if (hasBiology) return 'biology';
    return 'maths';
  };

  const phase2Subject = getPhase2Subject();
  const phase2Label = getSubjectLabel(phase2Subject);

  // Determine initial phase
  const getInitialPhase = (): TestPhase => {
    if (testType === 'custom') return 'custom_active';
    return 'physics_chemistry';
  };

  // Determine initial subject
  const getInitialSubject = (): string => {
    if (testType === 'custom') return sections[0]?.subject || 'physics';
    return 'physics';
  };

  // answers keyed by "{subject}_{questionIndex}" e.g. "physics_0", "maths_3"
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [currentPhase, setCurrentPhase] = useState<TestPhase>(getInitialPhase());
  const [activeSubject, setActiveSubject] = useState<string>(getInitialSubject());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

  // Timers in seconds
  // Mock test timers
  const [phaseOneTimeLeft, setPhaseOneTimeLeft] = useState<number>(
    testType === 'mock' ? (test.sectionTimings?.physicsChemistry ?? 90) * 60 : 0
  );
  const [phaseTwoTimeLeft, setPhaseTwoTimeLeft] = useState<number>(
    testType === 'mock' ? (test.sectionTimings?.mathsOrBiology ?? 90) * 60 : 0
  );
  // Custom test timer
  const [customTimeLeft, setCustomTimeLeft] = useState<number>(
    testType === 'custom' ? (test.customDuration ?? 60) * 60 : 0
  );

  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Get the currently active section
  const getActiveSection = (): TestSection | undefined => {
    return sections.find(s => s.subject === activeSubject);
  };

  const activeSection = getActiveSection();
  const activeQuestions = activeSection?.questions || [];

  // ========================
  // SUBJECT ACCESS LOGIC
  // ========================

  // Get all subjects that exist in sections
  const allSubjects = sections.map(s => s.subject);

  // Phase 1 subjects (mock only)
  const phase1Subjects: SubjectKey[] = ['physics', 'chemistry'];

  // Get subjects accessible in current phase
  const getAccessibleSubjects = (): string[] => {
    if (testType === 'custom') {
      return allSubjects;
    }

    // Mock test
    if (currentPhase === 'physics_chemistry') {
      return allSubjects.filter(s => phase1Subjects.includes(s as SubjectKey));
    }
    if (currentPhase === 'maths_or_biology') {
      // Show all but phase 1 subjects are read-only
      return allSubjects;
    }
    return allSubjects;
  };

  const accessibleSubjects = getAccessibleSubjects();

  // Check if a subject is completely locked (cannot even view)
  const isSubjectLocked = (subject: string): boolean => {
    if (testType === 'custom') return false;

    // In phase 1, phase 2 subject is locked
    if (currentPhase === 'physics_chemistry') {
      return !phase1Subjects.includes(subject as SubjectKey);
    }
    return false;
  };

  // Check if a subject is read-only (can view but not change answers)
  const isSubjectReadOnly = (subject: string): boolean => {
    if (testType === 'custom') return false;

    // In phase 2, phase 1 subjects are read-only
    if (currentPhase === 'maths_or_biology' && phase1Subjects.includes(subject as SubjectKey)) {
      return true;
    }
    return false;
  };

  // Check if a subject can be navigated to
  const canNavigateTo = (subject: string): boolean => {
    if (currentPhase === 'submitted' || currentPhase === 'transition') return false;
    if (testType === 'custom') return true;

    if (currentPhase === 'physics_chemistry') {
      return phase1Subjects.includes(subject as SubjectKey);
    }
    if (currentPhase === 'maths_or_biology') {
      // Can view all, but only interact with phase 2 subject
      return true;
    }
    return false;
  };

  // ========================
  // TIMER
  // ========================
  const handleSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setCurrentPhase('submitted');
    onSubmit(answers);
  }, [answers, onSubmit]);

  useEffect(() => {
    if (currentPhase === 'transition' || currentPhase === 'submitted') return;

    const timer = setInterval(() => {
      if (testType === 'mock') {
        if (currentPhase === 'physics_chemistry') {
          setPhaseOneTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              setCurrentPhase('transition');
              return 0;
            }
            return prev - 1;
          });
        } else if (currentPhase === 'maths_or_biology') {
          setPhaseTwoTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              if (!submittedRef.current) {
                handleSubmit();
              }
              return 0;
            }
            return prev - 1;
          });
        }
      } else if (testType === 'custom') {
        if (currentPhase === 'custom_active') {
          setCustomTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              if (!submittedRef.current) {
                handleSubmit();
              }
              return 0;
            }
            return prev - 1;
          });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentPhase, testType, handleSubmit]);

  // ========================
  // HANDLERS
  // ========================
  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const answerKey = (subject: string, qIdx: number) => `${subject}_${qIdx}`;

  const setAnswer = (subject: string, qIdx: number, optionIdx: number) => {
    if (isSubjectReadOnly(subject) || isSubjectLocked(subject)) return;
    const key = answerKey(subject, qIdx);
    setAnswers(prev => ({ ...prev, [key]: optionIdx }));
  };

  const clearAnswer = () => {
    if (!activeSection || isSubjectReadOnly(activeSubject) || isSubjectLocked(activeSubject)) return;
    const key = answerKey(activeSubject, currentQuestionIndex);
    setAnswers(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleMarkReview = () => {
    const key = answerKey(activeSubject, currentQuestionIndex);
    setMarkedForReview(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const goToQuestion = (subject: string, qIdx: number) => {
    if (!canNavigateTo(subject)) return;
    setActiveSubject(subject);
    setCurrentQuestionIndex(qIdx);
  };

  const goNext = () => {
    if (currentQuestionIndex < activeQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Move to next accessible subject that isn't locked
      const navigableSubjects = accessibleSubjects.filter(s => canNavigateTo(s) && !isSubjectLocked(s));
      const currentSubjectIdx = navigableSubjects.indexOf(activeSubject);
      if (currentSubjectIdx < navigableSubjects.length - 1) {
        const nextSubject = navigableSubjects[currentSubjectIdx + 1];
        setActiveSubject(nextSubject);
        setCurrentQuestionIndex(0);
      }
    }
  };

  const goPrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else {
      const navigableSubjects = accessibleSubjects.filter(s => canNavigateTo(s) && !isSubjectLocked(s));
      const currentSubjectIdx = navigableSubjects.indexOf(activeSubject);
      if (currentSubjectIdx > 0) {
        const prevSubject = navigableSubjects[currentSubjectIdx - 1];
        const prevSection = sections.find(s => s.subject === prevSubject);
        setActiveSubject(prevSubject);
        setCurrentQuestionIndex((prevSection?.questions?.length || 1) - 1);
      }
    }
  };

  // Mock test: early submit phase 1 and move to phase 2
  const submitPhase1Early = () => {
    const phase1Answered = phase1Subjects.reduce((sum, sub) => {
      const section = sections.find(s => s.subject === sub);
      if (!section) return sum;
      let count = 0;
      for (let i = 0; i < (section.questions?.length || 0); i++) {
        if (answers[answerKey(sub, i)] !== undefined) count++;
      }
      return sum + count;
    }, 0);

    const phase1Total = phase1Subjects.reduce((sum, sub) => {
      const section = sections.find(s => s.subject === sub);
      return sum + (section?.questions?.length || 0);
    }, 0);

    const unanswered = phase1Total - phase1Answered;

    let confirmMsg = `Are you sure you want to submit Physics & Chemistry?`;
    if (unanswered > 0) {
      confirmMsg += `\n\n⚠️ You have ${unanswered} unanswered question(s) in Physics & Chemistry.`;
    }
    confirmMsg += `\n\n🔒 Once submitted, you CANNOT go back to Physics & Chemistry.`;
    confirmMsg += `\n\nYou will then start the ${phase2Label} section.`;

    if (!confirm(confirmMsg)) return;

    setCurrentPhase('transition');
    setPhaseOneTimeLeft(0);
  };

  // Start phase 2 (maths or biology)
  const startPhase2 = () => {
    setCurrentPhase('maths_or_biology');
    setActiveSubject(phase2Subject);
    setCurrentQuestionIndex(0);
  };

  const handleSubmitConfirm = () => {
    if (testType === 'mock' && currentPhase === 'physics_chemistry') {
      // In mock phase 1, submit button should submit phase 1 early
      submitPhase1Early();
      return;
    }

    const relevantSections = testType === 'mock' && currentPhase === 'maths_or_biology'
      ? sections // All sections (phase 1 already locked)
      : sections;

    const totalQ = relevantSections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    const answeredQ = Object.keys(answers).length;
    const unanswered = totalQ - answeredQ;

    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} unanswered question(s). Are you sure you want to submit?`)) {
        return;
      }
    } else {
      if (!confirm('Are you sure you want to submit the test?')) {
        return;
      }
    }
    handleSubmit();
  };

  // ========================
  // STATS
  // ========================
  const getQuestionStatus = (subject: string, qIdx: number): 'answered' | 'review' | 'unanswered' => {
    const key = answerKey(subject, qIdx);
    if (markedForReview.has(key)) return 'review';
    if (answers[key] !== undefined) return 'answered';
    return 'unanswered';
  };

  const getSectionStats = (subject: string) => {
    const section = sections.find(s => s.subject === subject);
    if (!section) return { total: 0, answered: 0, review: 0 };
    const total = section.questions?.length || 0;
    let answered = 0;
    let review = 0;
    for (let i = 0; i < total; i++) {
      const key = answerKey(subject, i);
      if (answers[key] !== undefined) answered++;
      if (markedForReview.has(key)) review++;
    }
    return { total, answered, review };
  };

  const totalQuestions = sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
  const totalAnswered = Object.keys(answers).length;
  const totalUnanswered = totalQuestions - totalAnswered;
  const totalReview = markedForReview.size;

  const currentQuestion = activeQuestions[currentQuestionIndex];
  const currentKey = answerKey(activeSubject, currentQuestionIndex);
  const isCurrentReadOnly = isSubjectReadOnly(activeSubject) || isSubjectLocked(activeSubject);

  // Current timer
  const getCurrentTimeLeft = (): number => {
    if (testType === 'custom') return customTimeLeft;
    if (currentPhase === 'physics_chemistry') return phaseOneTimeLeft;
    if (currentPhase === 'maths_or_biology') return phaseTwoTimeLeft;
    return 0;
  };

  const currentTimeLeft = getCurrentTimeLeft();
  const isTimeWarning = currentTimeLeft < 300; // Less than 5 minutes

  // Timer label
  const getTimerLabel = (): string => {
    if (testType === 'custom') return 'Time Left';
    if (currentPhase === 'physics_chemistry') return 'Phy + Chem';
    if (currentPhase === 'maths_or_biology') return phase2Label;
    return 'Time';
  };

  // Phase description
  const getPhaseDescription = (): string => {
    if (testType === 'custom') {
      const subjectNames = sections.map(s => getSubjectLabel(s.subject)).join(', ');
      return subjectNames;
    }
    if (currentPhase === 'physics_chemistry') {
      return 'Part 1: Physics + Chemistry';
    }
    if (currentPhase === 'maths_or_biology') {
      return `Part 2: ${phase2Label} (Physics & Chemistry locked)`;
    }
    return '';
  };

  const getSectionTabColor = (subject: string, isActive: boolean) => {
    const colors = getSubjectColor(subject);
    if (isSubjectLocked(subject)) return 'bg-gray-200 text-gray-400 cursor-not-allowed';
    if (isActive) return colors.active;
    if (isSubjectReadOnly(subject)) return colors.readOnly;
    return colors.inactive;
  };

  const getStatusButtonColor = (status: string, isCurrent: boolean) => {
    if (isCurrent) return 'bg-indigo-500 text-white shadow-lg ring-2 ring-indigo-300 scale-110';
    switch (status) {
      case 'answered': return 'bg-green-500 text-white hover:bg-green-600';
      case 'review': return 'bg-yellow-500 text-white hover:bg-yellow-600';
      default: return 'bg-red-500 text-white hover:bg-red-600';
    }
  };

  // Determine submit button text based on phase
  const getSubmitButtonText = (): string => {
    if (submitting) return 'Submitting...';
    if (testType === 'mock' && currentPhase === 'physics_chemistry') {
      return `Submit Phy + Chem → Start ${phase2Label}`;
    }
    return 'Submit Test';
  };

  // Check if we're on the last question of the last navigable subject
  const isLastQuestion = (): boolean => {
    const navigableSubjects = accessibleSubjects.filter(s => canNavigateTo(s) && !isSubjectLocked(s));
    const isLastSubject = navigableSubjects.indexOf(activeSubject) === navigableSubjects.length - 1;
    const isLastQ = currentQuestionIndex === activeQuestions.length - 1;
    return isLastSubject && isLastQ;
  };

  // ========================
  // TRANSITION SCREEN (Mock tests only)
  // ========================
  if (currentPhase === 'transition') {
    const phaseOneTotalTime = (test.sectionTimings?.physicsChemistry ?? 90);
    const timeUsed = phaseOneTotalTime * 60 - phaseOneTimeLeft;
    const minutesUsed = Math.floor(timeUsed / 60);

    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-lg mx-auto p-8">
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-8 text-center shadow-lg">
            <div className="text-5xl mb-4">⏱️</div>
            <h2 className="text-2xl font-bold text-yellow-800 mb-4">
              Physics & Chemistry {phaseOneTimeLeft === 0 ? 'Time is Up!' : 'Submitted!'}
            </h2>

            {phaseOneTimeLeft > 0 ? (
              <p className="text-gray-700 mb-2">
                You submitted Physics & Chemistry early ({minutesUsed} min used of {phaseOneTotalTime} min).
              </p>
            ) : (
              <p className="text-gray-700 mb-2">
                Your {phaseOneTotalTime} minutes for Physics and Chemistry are over.
              </p>
            )}

            <p className="text-gray-700 mb-4">
              Your answers for Physics and Chemistry have been saved and are now <strong>locked</strong>.
              You cannot go back to modify them.
            </p>

            {/* Summary of Phase 1 */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {phase1Subjects.map(subject => {
                const section = sections.find(s => s.subject === subject);
                if (!section) return null;
                const stats = getSectionStats(subject);
                return (
                  <div key={subject} className="bg-white rounded-lg p-3 border">
                    <p className="font-semibold text-sm">{getSubjectLabel(subject)}</p>
                    <p className="text-lg font-bold text-green-600">{stats.answered}/{stats.total}</p>
                    <p className="text-xs text-gray-500">answered</p>
                  </div>
                );
              })}
            </div>

            <p className="text-gray-600 mb-6">
              Click below to start the{' '}
              <strong>
                {phase2Label} section ({test.sectionTimings?.mathsOrBiology ?? 90} minutes)
              </strong>.
            </p>

            <button
              onClick={startPhase2}
              className={`px-8 py-3 text-white text-lg font-semibold rounded-lg hover:opacity-90 transition shadow-md ${
                phase2Subject === 'biology'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              Start {phase2Label} Section →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // SUBMITTED SCREEN (shouldn't normally show, parent handles)
  // ========================
  if (currentPhase === 'submitted') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Test Submitted!</h2>
          <p className="text-gray-600">Your answers have been recorded.</p>
        </div>
      </div>
    );
  }

  // ========================
  // MAIN TEST UI
  // ========================
  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top nav */}
        <nav className="bg-white shadow-sm border-b">
          <div className="px-4 py-3 flex justify-between items-center">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold truncate">{test.title}</h2>
              <p className="text-sm text-gray-600">
                {getPhaseDescription()}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {/* Phase timer */}
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${
                  isTimeWarning
                    ? 'bg-red-100 text-red-800 animate-pulse'
                    : testType === 'custom'
                    ? 'bg-indigo-100 text-indigo-800'
                    : currentPhase === 'physics_chemistry'
                    ? 'bg-blue-100 text-blue-800'
                    : phase2Subject === 'biology'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                <Clock className="w-5 h-5" />
                <div>
                  <div className="text-xs">{getTimerLabel()}</div>
                  <span className="font-mono text-lg">{formatTime(currentTimeLeft)}</span>
                </div>
              </div>

              {/* Mock test: show phase 2 remaining time indicator */}
              {testType === 'mock' && currentPhase === 'physics_chemistry' && (
                <div className="hidden md:flex items-center gap-1 px-3 py-2 bg-gray-100 rounded-lg text-xs text-gray-500">
                  <Lock className="w-3 h-3" />
                  <div>
                    <div>{phase2Label}</div>
                    <span className="font-mono">{formatTime(phaseTwoTimeLeft)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section tabs */}
          <div className="px-4 py-2 bg-gradient-to-r from-blue-50 via-green-50 to-purple-50 border-t flex gap-3 overflow-x-auto">
            {sections.map(section => {
              const stats = getSectionStats(section.subject);
              const isActive = activeSubject === section.subject;
              const locked = isSubjectLocked(section.subject);
              const readOnly = isSubjectReadOnly(section.subject);
              const marksPerQ = getMarksPerQuestion(section.subject, section);

              return (
                <button
                  key={section.subject}
                  onClick={() => {
                    if (canNavigateTo(section.subject)) {
                      setActiveSubject(section.subject);
                      setCurrentQuestionIndex(0);
                    }
                  }}
                  disabled={locked}
                  className={`px-4 py-2 rounded-lg transition-all whitespace-nowrap ${getSectionTabColor(
                    section.subject,
                    isActive
                  )}`}
                >
                  <div className="font-bold text-sm flex items-center gap-1">
                    {getSubjectLabel(section.subject)}
                    {locked && <Lock className="w-3 h-3" />}
                    {readOnly && (
                      <span className="text-xs font-normal opacity-75">(locked)</span>
                    )}
                  </div>
                  <div className="text-xs">
                    {stats.answered}/{stats.total} answered • {marksPerQ}m/Q
                  </div>
                </button>
              );
            })}

            {/* Early submit button for mock phase 1 */}
            {testType === 'mock' && currentPhase === 'physics_chemistry' && (
              <button
                onClick={submitPhase1Early}
                className="px-4 py-2 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-all whitespace-nowrap ml-auto"
              >
                <div className="font-bold text-sm">Submit Phy + Chem →</div>
                <div className="text-xs">Move to {phase2Label}</div>
              </button>
            )}
          </div>

          {/* Stats bar */}
          <div className="px-4 py-2 bg-gray-50 border-t flex justify-around text-sm flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium">{totalAnswered} Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{totalUnanswered} Not Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="font-medium">{totalReview} Marked for Review</span>
            </div>
          </div>
        </nav>

        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-4xl mx-auto">
            {/* Read-only banner */}
            {isSubjectReadOnly(activeSubject) && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  This section's time has ended. Your answers are <strong>locked</strong> and cannot be changed.
                </span>
              </div>
            )}

            {/* Locked banner */}
            {isSubjectLocked(activeSubject) && (
              <div className="bg-gray-100 border border-gray-300 text-gray-600 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  This section is locked. It will be available after the current phase ends.
                </span>
              </div>
            )}

            {currentQuestion && (
              <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
                {/* Question header */}
                <div className="mb-6">
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <h3 className="text-lg font-bold text-gray-700">
                      Question {currentQuestionIndex + 1} of {activeQuestions.length}
                      <span className="ml-2 text-sm font-normal">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            getSubjectColor(activeSubject).badge
                          }`}
                        >
                          {getSubjectLabel(activeSubject)} •{' '}
                          {getMarksPerQuestion(activeSubject, activeSection)} mark
                          {getMarksPerQuestion(activeSubject, activeSection) > 1 ? 's' : ''}
                        </span>
                      </span>
                    </h3>
                    {!isCurrentReadOnly && (
                      <button
                        onClick={toggleMarkReview}
                        className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium shrink-0 ${
                          markedForReview.has(currentKey)
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4" />
                        {markedForReview.has(currentKey) ? 'Marked' : 'Mark for Review'}
                      </button>
                    )}
                  </div>

                  <div className="prose max-w-none">
                    <p className="text-lg text-gray-900 leading-relaxed">
                      {currentQuestion.question}
                    </p>
                    {currentQuestion.questionImage && (
                      <img
                        src={currentQuestion.questionImage}
                        alt="Question"
                        className="mt-4 max-h-64 rounded-lg border shadow-sm"
                      />
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  {currentQuestion.options.map((option, idx) => (
                    <label
                      key={idx}
                      className={`flex items-start p-4 border-2 rounded-lg transition-all ${
                        isCurrentReadOnly
                          ? answers[currentKey] === idx
                            ? 'border-indigo-400 bg-indigo-50 cursor-default'
                            : 'border-gray-200 bg-gray-50 cursor-default opacity-70'
                          : answers[currentKey] === idx
                          ? 'border-indigo-600 bg-indigo-50 shadow-md cursor-pointer'
                          : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50 cursor-pointer'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${currentKey}`}
                        checked={answers[currentKey] === idx}
                        onChange={() => setAnswer(activeSubject, currentQuestionIndex, idx)}
                        disabled={isCurrentReadOnly}
                        className="mt-1 mr-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-700 mr-2">
                          ({String.fromCharCode(65 + idx)})
                        </span>
                        <span className="text-gray-900">{option}</span>
                        {currentQuestion.optionImages?.[idx] && (
                          <img
                            src={currentQuestion.optionImages[idx]}
                            alt={`Option ${String.fromCharCode(65 + idx)}`}
                            className="mt-2 max-h-32 rounded border"
                          />
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                {/* Bottom controls */}
                <div className="mt-8 flex flex-col sm:flex-row justify-between items-center pt-6 border-t gap-4">
                  <button
                    onClick={clearAnswer}
                    disabled={isCurrentReadOnly || answers[currentKey] === undefined}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Clear Response
                  </button>

                  <div className="flex gap-3">
                    <button
                      onClick={goPrevious}
                      disabled={
                        currentQuestionIndex === 0 &&
                        (() => {
                          const navigable = accessibleSubjects.filter(s => canNavigateTo(s) && !isSubjectLocked(s));
                          return navigable.indexOf(activeSubject) === 0;
                        })()
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>

                    {/* Next or Submit */}
                    {!isLastQuestion() ? (
                      <button
                        onClick={goNext}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmitConfirm}
                        disabled={submitting}
                        className={`px-6 py-2 text-white rounded font-medium disabled:opacity-50 ${
                          testType === 'mock' && currentPhase === 'physics_chemistry'
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {getSubmitButtonText()}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* No question selected fallback */}
            {!currentQuestion && !isSubjectLocked(activeSubject) && (
              <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                <p className="text-gray-500">No questions available in this section.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar — Question Palette */}
      <div className="w-72 md:w-80 bg-white border-l shadow-lg overflow-y-auto hidden lg:block">
        <div className="sticky top-0 bg-white border-b p-4 z-10">
          <h3 className="font-bold text-gray-800 mb-3">Question Palette</h3>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-green-500 text-white rounded flex items-center justify-center font-bold text-xs">
                ✓
              </div>
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-500 text-white rounded flex items-center justify-center font-bold text-xs">
                ?
              </div>
              <span>Not Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-yellow-500 text-white rounded flex items-center justify-center font-bold text-xs">
                !
              </div>
              <span>Marked for Review</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-500 text-white rounded flex items-center justify-center font-bold text-xs ring-2 ring-indigo-300">
                ●
              </div>
              <span>Current</span>
            </div>
          </div>
        </div>

        <div className="p-4">
          {sections.map(section => {
            const locked = isSubjectLocked(section.subject);
            const readOnly = isSubjectReadOnly(section.subject);
            const stats = getSectionStats(section.subject);
            const isActiveSec = activeSubject === section.subject;
            const questions = section.questions || [];
            const colors = getSubjectColor(section.subject);

            const headerBg = locked
              ? 'bg-gray-100 text-gray-400'
              : isActiveSec
              ? colors.header
              : 'bg-gray-50 text-gray-600';

            return (
              <div key={section.subject} className="mb-5">
                <div className={`font-bold text-sm mb-2 px-3 py-2 rounded flex items-center gap-2 ${headerBg}`}>
                  <span className="flex-1">
                    {getSubjectLabel(section.subject)}
                    {locked && <Lock className="w-3 h-3 inline ml-1" />}
                    {readOnly && <span className="text-xs font-normal ml-1">(locked)</span>}
                  </span>
                  <span className="font-normal text-xs">
                    {stats.answered}/{stats.total}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((_, qIdx) => {
                    const status = getQuestionStatus(section.subject, qIdx);
                    const isCurrent =
                      activeSubject === section.subject &&
                      currentQuestionIndex === qIdx;

                    return (
                      <button
                        key={qIdx}
                        onClick={() => goToQuestion(section.subject, qIdx)}
                        disabled={locked}
                        className={`w-10 h-10 rounded font-bold text-sm transition-all ${
                          locked
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : getStatusButtonColor(status, isCurrent)
                        }`}
                      >
                        {qIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Submit / Phase transition button in sidebar */}
          {testType === 'mock' && currentPhase === 'physics_chemistry' && (
            <button
              onClick={submitPhase1Early}
              className="w-full mt-4 px-6 py-3 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 shadow-lg"
            >
              Submit Phy + Chem → {phase2Label}
            </button>
          )}

          <button
            onClick={handleSubmitConfirm}
            disabled={submitting}
            className={`w-full mt-3 px-6 py-3 text-white rounded-lg font-bold shadow-lg disabled:opacity-50 ${
              testType === 'mock' && currentPhase === 'physics_chemistry'
                ? 'bg-gray-400 hover:bg-gray-500'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {testType === 'mock' && currentPhase === 'physics_chemistry'
              ? 'Submit Entire Test'
              : submitting
              ? 'Submitting...'
              : 'Submit Test'}
          </button>

          {testType === 'mock' && currentPhase === 'physics_chemistry' && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              Or submit Phase 1 early to start {phase2Label}
            </p>
          )}
        </div>
      </div>

      {/* Mobile bottom bar (visible only on small screens) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 flex gap-2 lg:hidden z-50">
        <button
          onClick={goPrevious}
          disabled={
            currentQuestionIndex === 0 &&
            (() => {
              const navigable = accessibleSubjects.filter(s => canNavigateTo(s) && !isSubjectLocked(s));
              return navigable.indexOf(activeSubject) === 0;
            })()
          }
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-600 text-white rounded text-sm disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>

        {testType === 'mock' && currentPhase === 'physics_chemistry' && (
          <button
            onClick={submitPhase1Early}
            className="flex-1 px-3 py-2 bg-amber-600 text-white rounded text-sm font-medium"
          >
            Submit P+C →
          </button>
        )}

        {!isLastQuestion() ? (
          <button
            onClick={goNext}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded text-sm"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmitConfirm}
            disabled={submitting}
            className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '...' : 'Submit'}
          </button>
        )}
      </div>
    </div>
  );
};

export default TakingTestView;