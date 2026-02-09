import React, { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle, Circle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Test, TestSection } from '../types';

// Phase 1: Physics + Chemistry (90 min combined)
// Phase 2: Maths (90 min, only available after Phase 1 time expires or manually moved)
type TestPhase = 'physics_chemistry' | 'transition' | 'maths';

interface TakingTestViewProps {
  test: Test;
  onSubmit: (answers: Record<string, number>) => void;
  onBack: () => void;
}

const TakingTestView: React.FC<TakingTestViewProps> = ({
  test,
  onSubmit,
  // onBack,
}) => {
  // answers keyed by "{subject}_{questionIndex}" e.g. "physics_0", "maths_3"
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [currentPhase, setCurrentPhase] = useState<TestPhase>('physics_chemistry');
  const [activeSubject, setActiveSubject] = useState<string>('physics');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

  // Timers in seconds
  const [phaseOneTimeLeft, setPhaseOneTimeLeft] = useState<number>(
    (test.sectionTimings?.physicsChemistry || 90) * 60
  );
  const [phaseTwoTimeLeft, setPhaseTwoTimeLeft] = useState<number>(
    (test.sectionTimings?.maths || 90) * 60
  );

  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const sections = test.sections || [];
  // const physicsSection = sections.find(s => s.subject === 'physics');
  // const chemistrySection = sections.find(s => s.subject === 'chemistry');
  // const mathsSection = sections.find(s => s.subject === 'maths');

  // Get the currently active section
  const getActiveSection = (): TestSection | undefined => {
    return sections.find(s => s.subject === activeSubject);
  };

  const activeSection = getActiveSection();
  const activeQuestions = activeSection?.questions || [];

  // All subjects accessible in current phase
  const getAccessibleSubjects = (): string[] => {
    if (currentPhase === 'physics_chemistry') {
      return ['physics', 'chemistry'];
    }
    // In maths phase, all sections visible but physics/chemistry are read-only
    return ['physics', 'chemistry', 'maths'];
  };

  const accessibleSubjects = getAccessibleSubjects();

  const isSubjectReadOnly = (subject: string): boolean => {
    if (currentPhase === 'maths' && (subject === 'physics' || subject === 'chemistry')) {
      return true;
    }
    if (currentPhase === 'physics_chemistry' && subject === 'maths') {
      return true; // locked, shouldn't even be visible
    }
    return false;
  };

  const isSubjectLocked = (subject: string): boolean => {
    return currentPhase === 'physics_chemistry' && subject === 'maths';
  };

  // ========================
  // TIMER
  // ========================
  useEffect(() => {
    if (currentPhase === 'transition') return;

    const timer = setInterval(() => {
      if (currentPhase === 'physics_chemistry') {
        setPhaseOneTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setCurrentPhase('transition');
            return 0;
          }
          return prev - 1;
        });
      } else if (currentPhase === 'maths') {
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
    }, 1000);

    return () => clearInterval(timer);
  }, [currentPhase]);

  // ========================
  // HANDLERS
  // ========================
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const answerKey = (subject: string, qIdx: number) => `${subject}_${qIdx}`;

  const setAnswer = (subject: string, qIdx: number, optionIdx: number) => {
    if (isSubjectReadOnly(subject)) return;
    const key = answerKey(subject, qIdx);
    setAnswers(prev => ({ ...prev, [key]: optionIdx }));
  };

  const clearAnswer = () => {
    if (!activeSection || isSubjectReadOnly(activeSubject)) return;
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
    if (isSubjectLocked(subject)) return;
    setActiveSubject(subject);
    setCurrentQuestionIndex(qIdx);
  };

  const goNext = () => {
    if (currentQuestionIndex < activeQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Move to next accessible subject
      const currentSubjectIdx = accessibleSubjects.indexOf(activeSubject);
      if (currentSubjectIdx < accessibleSubjects.length - 1) {
        const nextSubject = accessibleSubjects[currentSubjectIdx + 1];
        if (!isSubjectLocked(nextSubject)) {
          setActiveSubject(nextSubject);
          setCurrentQuestionIndex(0);
        }
      }
    }
  };

  const goPrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    } else {
      // Move to previous accessible subject
      const currentSubjectIdx = accessibleSubjects.indexOf(activeSubject);
      if (currentSubjectIdx > 0) {
        const prevSubject = accessibleSubjects[currentSubjectIdx - 1];
        if (!isSubjectLocked(prevSubject)) {
          const prevSection = sections.find(s => s.subject === prevSubject);
          setActiveSubject(prevSubject);
          setCurrentQuestionIndex((prevSection?.questions?.length || 1) - 1);
        }
      }
    }
  };

  const startMathsPhase = () => {
    setCurrentPhase('maths');
    setActiveSubject('maths');
    setCurrentQuestionIndex(0);
  };

  const handleSubmit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    onSubmit(answers);
  };

  const handleSubmitConfirm = () => {
    const totalQ = sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    const answeredQ = Object.keys(answers).length;
    const unanswered = totalQ - answeredQ;

    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} unanswered question(s). Are you sure you want to submit?`)) {
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
  const isCurrentReadOnly = isSubjectReadOnly(activeSubject);

  const currentTimeLeft = currentPhase === 'physics_chemistry' ? phaseOneTimeLeft : phaseTwoTimeLeft;
  const isTimeWarning = currentTimeLeft < 300;

  const getSectionTabColor = (subject: string, isActive: boolean) => {
    if (isSubjectLocked(subject)) return 'bg-gray-200 text-gray-400 cursor-not-allowed';
    if (isActive) {
      switch (subject) {
        case 'physics': return 'bg-blue-600 text-white';
        case 'chemistry': return 'bg-green-600 text-white';
        case 'maths': return 'bg-purple-600 text-white';
      }
    }
    if (isSubjectReadOnly(subject)) {
      return 'bg-gray-100 text-gray-500 border border-gray-300';
    }
    switch (subject) {
      case 'physics': return 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100';
      case 'chemistry': return 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100';
      case 'maths': return 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100';
    }
    return 'bg-gray-50 text-gray-700';
  };

  const getStatusButtonColor = (status: string, isCurrent: boolean) => {
    if (isCurrent) return 'bg-indigo-500 text-white shadow-lg ring-2 ring-indigo-300 scale-110';
    switch (status) {
      case 'answered': return 'bg-green-500 text-white hover:bg-green-600';
      case 'review': return 'bg-yellow-500 text-white hover:bg-yellow-600';
      default: return 'bg-red-500 text-white hover:bg-red-600';
    }
  };

  // ========================
  // TRANSITION SCREEN
  // ========================
  if (currentPhase === 'transition') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="max-w-lg mx-auto p-8">
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-8 text-center shadow-lg">
            <div className="text-5xl mb-4">⏱️</div>
            <h2 className="text-2xl font-bold text-yellow-800 mb-4">
              Physics & Chemistry Time is Up!
            </h2>
            <p className="text-gray-700 mb-2">
              Your 90 minutes for Physics and Chemistry are over.
            </p>
            <p className="text-gray-700 mb-4">
              Your answers for Physics and Chemistry have been saved and are now locked.
            </p>

            {/* Summary of Phase 1 */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {['physics', 'chemistry'].map(subject => {
                const stats = getSectionStats(subject);
                return (
                  <div key={subject} className="bg-white rounded-lg p-3 border">
                    <p className="font-semibold capitalize text-sm">{subject}</p>
                    <p className="text-lg font-bold text-green-600">{stats.answered}/{stats.total}</p>
                    <p className="text-xs text-gray-500">answered</p>
                  </div>
                );
              })}
            </div>

            <p className="text-gray-600 mb-6">
              Click below to start the <strong>Mathematics section (90 minutes)</strong>.
            </p>

            <button
              onClick={startMathsPhase}
              className="px-8 py-3 bg-purple-600 text-white text-lg font-semibold rounded-lg hover:bg-purple-700 transition shadow-md"
            >
              Start Mathematics Section →
            </button>
          </div>
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
      <div className="flex-1 flex flex-col">
        {/* Top nav */}
        <nav className="bg-white shadow-sm border-b">
          <div className="px-4 py-3 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{test.title}</h2>
              <p className="text-sm text-gray-600">
                {currentPhase === 'physics_chemistry'
                  ? 'Part 1: Physics + Chemistry'
                  : 'Part 2: Mathematics (Physics & Chemistry locked)'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Phase timer */}
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${
                  isTimeWarning
                    ? 'bg-red-100 text-red-800 animate-pulse'
                    : currentPhase === 'physics_chemistry'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                <Clock className="w-5 h-5" />
                <div>
                  <div className="text-xs">
                    {currentPhase === 'physics_chemistry' ? 'Phy + Chem' : 'Maths'}
                  </div>
                  <span className="font-mono text-lg">{formatTime(currentTimeLeft)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section tabs */}
          <div className="px-4 py-2 bg-gradient-to-r from-blue-50 via-green-50 to-purple-50 border-t flex gap-3 overflow-x-auto">
            {sections.map(section => {
              const stats = getSectionStats(section.subject);
              const isActive = activeSubject === section.subject;
              const locked = isSubjectLocked(section.subject);
              const readOnly = isSubjectReadOnly(section.subject);
              const marksPerQ = section.marksPerQuestion || (section.subject === 'maths' ? 2 : 1);

              return (
                <button
                  key={section.subject}
                  onClick={() => {
                    if (!locked) {
                      setActiveSubject(section.subject);
                      setCurrentQuestionIndex(0);
                    }
                  }}
                  disabled={locked}
                  className={`px-4 py-2 rounded-lg transition-all ${getSectionTabColor(
                    section.subject,
                    isActive
                  )}`}
                >
                  <div className="font-bold text-sm capitalize">
                    {section.subject}
                    {locked && ' 🔒'}
                    {readOnly && ' (locked)'}
                  </div>
                  <div className="text-xs">
                    {stats.answered}/{stats.total} answered • {marksPerQ}m/Q
                  </div>
                </button>
              );
            })}
          </div>

          {/* Stats bar */}
          <div className="px-4 py-2 bg-gray-50 border-t flex justify-around text-sm">
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
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* Read-only banner */}
            {isCurrentReadOnly && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4 text-sm">
                ⚠️ This section's time has ended. Your answers are locked and cannot be changed.
              </div>
            )}

            <div className="bg-white rounded-lg shadow-lg p-8">
              {/* Question header */}
              <div className="mb-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-gray-700">
                    Question {currentQuestionIndex + 1} of {activeQuestions.length}
                    <span className="ml-2 text-sm font-normal capitalize">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          activeSubject === 'physics'
                            ? 'bg-blue-100 text-blue-800'
                            : activeSubject === 'chemistry'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {activeSubject} •{' '}
                        {activeSection?.marksPerQuestion || (activeSubject === 'maths' ? 2 : 1)} mark
                        {(activeSection?.marksPerQuestion || 1) > 1 ? 's' : ''}
                      </span>
                    </span>
                  </h3>
                  {!isCurrentReadOnly && (
                    <button
                      onClick={toggleMarkReview}
                      className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium ${
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
                    {currentQuestion?.question}
                  </p>
                  {currentQuestion?.questionImage && (
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
                {currentQuestion?.options.map((option, idx) => (
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
                      className="mt-1 mr-4"
                    />
                    <div className="flex-1">
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
              <div className="mt-8 flex justify-between items-center pt-6 border-t">
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
                      accessibleSubjects.indexOf(activeSubject) === 0
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>

                  {/* Next or Submit */}
                  {currentQuestionIndex < activeQuestions.length - 1 ||
                  accessibleSubjects.indexOf(activeSubject) <
                    accessibleSubjects.length - 1 ? (
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
                      className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : 'Submit Test'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar — Question Palette */}
      <div className="w-80 bg-white border-l shadow-lg overflow-y-auto">
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

            const headerBg = locked
              ? 'bg-gray-100 text-gray-400'
              : isActiveSec
              ? section.subject === 'physics'
                ? 'bg-blue-100 text-blue-800'
                : section.subject === 'chemistry'
                ? 'bg-green-100 text-green-800'
                : 'bg-purple-100 text-purple-800'
              : 'bg-gray-50 text-gray-600';

            return (
              <div key={section.subject} className="mb-5">
                <div className={`font-bold text-sm mb-2 px-3 py-2 rounded capitalize ${headerBg}`}>
                  {section.subject}
                  {locked && ' 🔒'}
                  {readOnly && ' (locked)'}
                  <span className="font-normal ml-2 text-xs">
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

          <button
            onClick={handleSubmitConfirm}
            disabled={submitting}
            className="w-full mt-6 px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Test'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TakingTestView;