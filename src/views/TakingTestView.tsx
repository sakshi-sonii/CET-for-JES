import React from 'react';
import { Clock, CheckCircle, Circle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Test } from '../types';

interface TakingTestViewProps {
  test: Test;
  answers: Record<number, number>;
  markedForReview: Set<number>;
  shuffledOrder: number[];
  currentQuestionIndex: number;
  timeLeft: number;
  onAnswerChange: (index: number, answer: number) => void;
  onMarkReview: () => void;
  onClearAnswer: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onGoToQuestion: (index: number) => void;
}

const TakingTestView: React.FC<TakingTestViewProps> = ({
  test,
  answers,
  markedForReview,
  shuffledOrder,
  currentQuestionIndex,
  timeLeft,
  onAnswerChange,
  onMarkReview,
  onClearAnswer,
  onPrevious,
  onNext,
  onSubmit,
  onGoToQuestion,
}) => {
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentOriginalIdx = shuffledOrder[currentQuestionIndex];
  const currentQuestion = test.questions[currentOriginalIdx];

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = test.questions.length - answeredCount;
  const reviewCount = markedForReview.size;

  const getQuestionStatus = (idx: number): 'answered' | 'review' | 'unanswered' => {
    if (markedForReview.has(idx)) return 'review';
    if (answers[idx] !== undefined) return 'answered';
    return 'unanswered';
  };

  const handleSubmitConfirm = () => {
    if (unansweredCount > 0) {
      const confirmMsg = `You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`;
      if (!confirm(confirmMsg)) return;
    }
    onSubmit();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <div className="flex-1 flex flex-col">
        <nav className="bg-white shadow-sm border-b">
          <div className="px-4 py-3 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">{test.title}</h2>
              <p className="text-sm text-gray-600">{test.subject}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold ${timeLeft < 300 ? 'bg-red-100 text-red-800 animate-pulse' : 'bg-blue-100 text-blue-800'}`}>
                <Clock className="w-5 h-5" />
                <span className="font-mono text-lg">{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t flex justify-around text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium">{answeredCount} Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{unansweredCount} Not Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="font-medium">{reviewCount} Marked for Review</span>
            </div>
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="mb-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-gray-700">Question {currentQuestionIndex + 1} of {test.questions.length}</h3>
                  <button
                    onClick={onMarkReview}
                    className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium ${
                      markedForReview.has(currentQuestionIndex)
                        ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    {markedForReview.has(currentQuestionIndex) ? 'Marked' : 'Mark for Review'}
                  </button>
                </div>
                
                <div className="prose max-w-none">
                  <p className="text-lg text-gray-900 leading-relaxed">{currentQuestion.question}</p>
                  {currentQuestion.questionImage && (
                    <img 
                      src={currentQuestion.questionImage} 
                      alt="Question" 
                      className="mt-4 max-h-64 rounded-lg border shadow-sm"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {currentQuestion.options.map((option, idx) => (
                  <label
                    key={idx}
                    className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      answers[currentQuestionIndex] === idx
                        ? 'border-indigo-600 bg-indigo-50 shadow-md'
                        : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestionIndex}`}
                      checked={answers[currentQuestionIndex] === idx}
                      onChange={() => onAnswerChange(currentQuestionIndex, idx)}
                      className="mt-1 mr-4"
                    />
                    <div className="flex-1">
                      <span className="font-medium text-gray-700 mr-2">({String.fromCharCode(65 + idx)})</span>
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

              <div className="mt-8 flex justify-between items-center pt-6 border-t">
                <button
                  onClick={onClearAnswer}
                  disabled={answers[currentQuestionIndex] === undefined}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear Response
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={onPrevious}
                    disabled={currentQuestionIndex === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>

                  {currentQuestionIndex < test.questions.length - 1 ? (
                    <button
                      onClick={onNext}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmitConfirm}
                      className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                    >
                      Submit Test
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-80 bg-white border-l shadow-lg overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 z-10">
          <h3 className="font-bold text-gray-800 mb-3">Question Palette</h3>
          
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-500 text-white rounded flex items-center justify-center font-bold">1</div>
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-500 text-white rounded flex items-center justify-center font-bold">2</div>
              <span>Not Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-500 text-white rounded flex items-center justify-center font-bold">3</div>
              <span>Marked for Review</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-500 text-white rounded flex items-center justify-center font-bold shadow-lg ring-2 ring-indigo-300">4</div>
              <span>Current Question</span>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-5 gap-2">
            {shuffledOrder.map((_, idx) => {
              const status = getQuestionStatus(idx);
              const isCurrent = idx === currentQuestionIndex;
              
              return (
                <button
                  key={idx}
                  onClick={() => onGoToQuestion(idx)}
                  className={`w-10 h-10 rounded font-bold transition-all ${
                    isCurrent
                      ? 'bg-indigo-500 text-white shadow-lg ring-2 ring-indigo-300 scale-110'
                      : status === 'answered'
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : status === 'review'
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-red-500 text-white hover:bg-red-600'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleSubmitConfirm}
            className="w-full mt-6 px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg"
          >
            Submit Test
          </button>
        </div>
      </div>
    </div>
  );
};

export default TakingTestView;
