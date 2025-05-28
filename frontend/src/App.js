// Smart Cover Letter Generator - Frontend (React + Tailwind)


import React, { useState, useEffect } from "react";
import axios from "axios";
import { Toaster, toast } from "react-hot-toast";
import { BiCopy } from "react-icons/bi";
import { MdOutlineDone, MdOutlineDarkMode, MdOutlineLightMode, MdExpandMore, MdOutlineEdit, MdCheckCircle, MdErrorOutline, MdInfoOutline } from "react-icons/md";
import { BsMoon, BsSun } from "react-icons/bs"; // For moon/sun icons
import { LuBrain } from "react-icons/lu";
import { CheckCircle, AlertCircle, XCircle } from "react-icons/lu";
import { BsCircleFill } from "react-icons/bs";
import './App.css'; 

// Utility: Extract top N keywords from job description
function extractKeywords(text, topN = 8) {
  if (!text) return [];
  // Remove punctuation, split, filter out short/common words
  const stopWords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "but", "not", "have", "has", "will", "can", "all", "you", "your", "our", "they", "their", "job", "role", "work", "who", "what", "when", "where", "how", "why", "a", "an", "to", "of", "in", "on", "as", "by", "at", "is", "it", "be", "or", "we"
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

// Utility: Highlight keywords in the cover letter
function highlightKeywords(text, keywords) {
  if (!keywords.length) return text;
  // Build a regex for all keywords (word boundaries, case-insensitive)
  const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
  // Split and wrap matches
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <mark key={key++} className="bg-yellow-200 text-black rounded px-1">{match[0]}</mark>
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

const TONE_OPTIONS = [
  { value: "Formal", label: "Formal", icon: "💼", tooltip: "Straightforward and professional" },
  { value: "Friendly", label: "Friendly", icon: "😄", tooltip: "Warm and approachable" },
  { value: "Confident", label: "Confident", icon: "💪", tooltip: "Bold and self-assured" },
  { value: "Enthusiastic", label: "Enthusiastic", icon: "✨", tooltip: "Energetic and passionate" },
  { value: "Academic", label: "Academic", icon: "🤓", tooltip: "Objective and scholarly" },
  { value: "Calm", label: "Calm", icon: "🧘", tooltip: "Relaxed and composed" },
  { value: "Persuasive", label: "Persuasive", icon: "🔥", tooltip: "Convincing and motivating" },
  { value: "Analytical", label: "Analytical", icon: <LuBrain />, tooltip: "Logical and data-driven" },
  { value: "Leadership", label: "Leadership", icon: "🥇", tooltip: "Visionary and inspiring" },
  { value: "Storytelling", label: "Storytelling", icon: "💬", tooltip: "Narrative and engaging" },
  { value: "Custom", label: "Custom", icon: "📝", tooltip: "Define your own tone" }
];

function ToneSelector({ selectedTone, setSelectedTone, customTone, setCustomTone }) {
  return (
    <div>
      <label className="block mb-2 font-semibold text-base sm:text-lg">Tone</label>
      <div className="flex overflow-x-auto gap-2 pb-2">
        {TONE_OPTIONS.map((tone) => (
          <button
            key={tone.value}
            type="button"
            className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg border transition
              min-w-[72px] sm:min-w-[90px] text-xs sm:text-sm
              ${selectedTone === tone.value
                ? "border-blue-500 shadow-md bg-blue-50 dark:bg-gray-800"
                : "border-gray-200 bg-white dark:bg-gray-900 hover:border-blue-400"}
            `}
            title={tone.tooltip}
            onClick={() => setSelectedTone(tone.value)}
          >
            <span className="text-xl mb-1">{tone.icon}</span>
            <span className="font-medium">{tone.label}</span>
          </button>
        ))}
      </div>
      {selectedTone === "Custom" && (
        <input
          type="text"
          value={customTone}
          onChange={e => setCustomTone(e.target.value)}
          placeholder="Describe your tone (e.g. Persuasive, Humorous...)"
          className="mt-2 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 transition bg-white dark:bg-gray-800 dark:text-gray-100"
        />
      )}
    </div>
  );
}

// Add this helper for color classes
const SCORE_COLORS = {
  red: "border-red-500 bg-red-50 text-red-700",
  yellow: "border-yellow-400 bg-yellow-50 text-yellow-700",
  green: "border-green-500 bg-green-50 text-green-700"
};

const ICONS = {
  green: <BsCircleFill className="text-green-500 inline" size={18} />,
  yellow: <BsCircleFill className="text-yellow-400 inline" size={18} />,
  red: <BsCircleFill className="text-red-500 inline" size={18} />
};

// Add this above your App() function or with other constants
const LANGUAGE_OPTIONS = [
  { value: "English", label: "English", icon: "🇺🇸" },
  { value: "French", label: "Français", icon: "🇫🇷" },
  { value: "Arabic", label: "العربية", icon: "🇸🇦" }
];

export default function App() {
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileCache, setResumeFileCache] = useState(null); // cache for regeneration
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionCache, setJobDescriptionCache] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dark, setDark] = useState(false);
  const [selectedTone, setSelectedTone] = useState("Formal");
  const [customTone, setCustomTone] = useState("");
  const [jobFitScore, setJobFitScore] = useState(null);
  const [language, setLanguage] = useState("English");
  const [editMode, setEditMode] = useState(false);
  const [editedLetter, setEditedLetter] = useState('');
  const [prevLetter, setPrevLetter] = useState('');

  // Extract keywords whenever jobDescription changes
  const keywords = extractKeywords(jobDescription);

  // Apply/remove dark class on body
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  // When user uploads a resume
  const handleResumeUpload = (file) => {
    setResumeFile(file);
    setResumeFileCache(file); // cache for regeneration
  };

  // When user enters job description
  const handleJobDescriptionChange = (desc) => {
    setJobDescription(desc);
    setJobDescriptionCache(desc); // cache for regeneration
  };

  const handleGenerate = async (regenerate = false) => {
    // Use cached values if regenerating and no new input
    const resumeToSend = resumeFile || resumeFileCache;
    const jobDescToSend = jobDescription || jobDescriptionCache;

    if (!resumeToSend || !jobDescToSend) {
      toast.error("Please upload a resume and enter job description.");
      return;
    }

    const formData = new FormData();
    formData.append('resume', resumeToSend);
    formData.append('job_description', jobDescToSend);
    formData.append('tone', selectedTone === "Custom" && customTone ? customTone : selectedTone);
    formData.append('language', language);
    if (regenerate && editedLetter) {
      formData.append('edited_letter', editedLetter);
    }

    setLoading(true);
    try {
      const res = await axios.post('http://localhost:5000/generate-cover-letter', formData);
      setCoverLetter(res.data.cover_letter);
      setJobFitScore(res.data.job_fit_score);
      setEditMode(false);
      setCopied(false);
      setEditedLetter('');
      toast.success(regenerate ? "Cover letter regenerated!" : "Cover letter generated!");
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Smooth scroll to output section after generation
  const outputRef = React.useRef(null);
  useEffect(() => {
    if (coverLetter && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [coverLetter]);

  // Example for rendering grouped requirements
  function renderGroupedRequirements(grouped, color, icon) {
    return Object.entries(grouped).map(([cat, items]) => (
      <div key={cat} className="mb-2">
        <div className={`font-semibold mb-1 flex items-center gap-1 ${color}`}>
          {icon} {cat}
        </div>
        <ul className="space-y-1">
          {items.map((req, i) => (
            <li key={i} className={`flex items-center gap-1 text-sm ${color}`}>
              {icon} {req}
            </li>
          ))}
        </ul>
      </div>
    ));
  }

  return (
    <>
      <Toaster position="top-right" />
      {/* Header */}
      <header
  className="fixed top-0 left-0 w-full z-50 flex items-center shadow-lg backdrop-blur-md"
  style={{
    background: "rgba(255,255,255,0.8)",
    paddingTop: "1.5rem",
    paddingBottom: "1.5rem",
    paddingLeft: "2rem",
    paddingRight: "2rem",
    minHeight: "110px", // increase header height for larger logo
    boxSizing: "border-box",
    fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif",
    borderBottom: "1px solid #e5e7eb"
  }}
>
  <span className="flex items-center gap-4">
    <img
      src="/logo.png"
      alt="COVRLY.AI Logo"
      className="h-[80px] w-auto" // increase height to 80px
      style={{ maxHeight: 80 }}
    />
    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-blue-900">
    </span>
  </span>
  <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
    <button
      onClick={() => setDark(d => !d)}
      className="ml-2 sm:ml-4 p-2 rounded-full bg-blue-700 hover:bg-blue-600 transition text-xl shadow-md hover:scale-110 duration-200"
      title={dark ? "Light mode" : "Dark mode"}
      style={{ transition: "background 0.2s, transform 0.2s" }}
    >
      {dark ? <MdOutlineLightMode /> : <MdOutlineDarkMode />}
    </button>
  </nav>
</header>

      {/* Main Layout */}
      <div
        className="main-content min-h-screen bg-gradient-to-br from-blue-100 to-blue-200 dark:from-gray-900 dark:to-gray-800 flex flex-col"
        style={{ fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif" }}
      >
        {/* Responsive Grid: Form (left) and Output (right, now wider) */}
        <div className="flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto gap-8 px-2 sm:px-4 md:px-8 py-6">
          {/* Left: Form */}
          <section className="w-full lg:w-[46%] flex flex-col justify-center items-center">
            <div className="bg-white dark:bg-gray-900 dark:text-gray-100 rounded-2xl shadow-xl w-full max-w-2xl p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8 animate-fade-in transition-all duration-300 hover:shadow-2xl">
              <h2 className="text-xl sm:text-2xl font-bold text-blue-700 mb-2 sm:mb-4 flex items-center gap-2">
                <span role="img" aria-label="form"></span> Generate Your Cover Letter
              </h2>
              <div
                className={`w-full border-2 border-dashed rounded-md p-4 sm:p-6 flex flex-col items-center justify-center cursor-pointer transition focus:ring-2 focus:ring-blue-300
                  ${resumeFile ? "border-green-400 bg-green-50" : "border-gray-300 bg-white dark:bg-gray-900 hover:bg-blue-50"}`}
                onDragOver={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type === "application/pdf") {
                    setResumeFile(file);
                  } else {
                    toast.error("Please upload a PDF file.");
                  }
                }}
                onClick={() => document.getElementById("resume-upload").click()}
                style={{ transition: "border 0.2s, background 0.2s" }}
              >
                <input
                  id="resume-upload"
                  type="file"
                  accept=".pdf"
                  style={{ display: "none" }}
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file && file.type === "application/pdf") {
                      setResumeFile(file);
                    } else {
                      toast.error("Please upload a PDF file.");
                    }
                  }}
                />
                <span className="text-2xl sm:text-3xl mb-2">📄</span>
                <span className="font-medium text-gray-700 text-center text-sm sm:text-base">
                  {resumeFile ? (
                    <span className="text-green-700">{resumeFile.name}</span>
                  ) : (
                    <>Drag & drop your resume PDF here, or <span className="underline text-blue-600">browse</span></>
                  )}
                </span>
              </div>
              <div>
                <label className="block mb-2 font-semibold text-base sm:text-lg">Job Description</label>
                <textarea
                  rows={Math.max(6, Math.min(12, Math.ceil(jobDescription.length / 80)))}
                  value={jobDescription}
                  onChange={e => setJobDescription(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-300 resize-y min-h-[120px] transition text-sm sm:text-base"
                  placeholder="Paste the job description here..."
                  style={{ fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif" }}
                ></textarea>
                <div className="flex justify-between items-center mt-1 text-xs sm:text-sm">
                  <span className="text-gray-500">
                    {jobDescription.length} characters
                  </span>
                </div>
              </div>
              {/* Language Selector */}
              <div className="mb-4">
                <label className="block mb-2 font-semibold text-base sm:text-lg">Select Language</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 transition bg-white dark:bg-gray-800 dark:text-gray-100"
                  style={{ fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif" }}
                >
                  {LANGUAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Tone Selector */}
              <ToneSelector
                selectedTone={selectedTone}
                setSelectedTone={setSelectedTone}
                customTone={customTone}
                setCustomTone={setCustomTone}
              />
              <button
                onClick={() => handleGenerate(!!coverLetter)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 sm:px-6 sm:py-3 rounded-lg font-semibold transition duration-200 flex items-center justify-center shadow text-base sm:text-lg focus:ring-2 focus:ring-blue-300 active:scale-95"
                style={{ transition: "background 0.2s, transform 0.2s" }}
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  <span>Generate Cover Letter</span>
                )}
              </button>
            </div>
          </section>

          {/* Divider for desktop, hidden on mobile */}
          <div className="hidden lg:flex flex-col justify-center items-center px-2">
            <div className="my-8 w-px h-[80%] bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>

          {/* Right: Output (now much wider) */}
          <section
            ref={outputRef}
            className="w-full lg:w-[54%] flex flex-col justify-center items-center"
          >
            <div className="bg-white dark:bg-gray-900 dark:text-gray-100 rounded-2xl shadow-xl w-full max-w-5xl p-4 sm:p-6 md:p-10 animate-slide-in space-y-4 min-h-[320px] sm:min-h-[400px] flex flex-col transition-all duration-300 hover:shadow-2xl">
              <h2 className="text-lg sm:text-2xl font-bold mb-2 text-blue-700 text-center" style={{ fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif" }}>Tailored Just for You 🖊️✨</h2>
              {coverLetter ? (
                <>
                  {/* Edit Mode */}
                  {editMode ? (
                    <>
                      <textarea
                        value={editedLetter}
                        onChange={e => setEditedLetter(e.target.value)}
                        className="w-full min-h-[200px] border rounded-lg p-3 text-sm sm:text-base bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-300 transition"
                        style={{
                          direction: language === "Arabic" ? "rtl" : "ltr",
                          textAlign: language === "Arabic" ? "right" : "left"
                        }}
                      />
                      {/* No cancel or regenerate button */}
                      {prevLetter && (
                        <div className="mt-4 text-xs text-gray-500">
                          <span className="font-semibold">Previous version:</span>
                          <pre className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 rounded p-2 mt-1 border">{prevLetter}</pre>
                        </div>
                      )}
                      <div className="flex justify-center gap-3 mt-4">
                        <button
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
                          onClick={() => {
                            setCoverLetter(editedLetter);
                            setPrevLetter(coverLetter);
                            setEditMode(false);
                          }}
                        >
                          Save
                        </button>
                        <button
                          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold transition"
                          onClick={() => setEditMode(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <pre
                        className={`whitespace-pre-wrap text-gray-800 font-mono flex-1 transition-all duration-300 rounded-lg border p-3 bg-gray-50 ${
                          expanded ? "max-h-[700px]" : "max-h-80"
                        } overflow-auto text-xs sm:text-base`}
                        style={{
                          fontFamily: "inherit",
                          direction: language === "Arabic" ? "rtl" : "ltr",
                          textAlign: language === "Arabic" ? "right" : "left"
                        }}
                      >
                        {highlightKeywords(coverLetter, keywords)}
                      </pre>
                      <div className="flex justify-center gap-2">
                        <button
                          className="mt-2 flex items-center text-blue-600 underline text-2xl transition"
                          onClick={() => {
                            navigator.clipboard.writeText(coverLetter);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1000);
                          }}
                          title={copied ? "Copied!" : "Copy to Clipboard"}
                        >
                          {copied ? <MdOutlineDone /> : <BiCopy />}
                        </button>
                        <button
                          className="mt-2 ml-2 text-blue-500 underline text-base flex items-center transition-transform"
                          onClick={() => setExpanded((e) => !e)}
                          title={expanded ? "Collapse" : "Expand"}
                        >
                          {expanded ? (
                            <span className="transition-transform duration-200 rotate-180"><MdExpandMore size={22} /></span>
                          ) : (
                            <MdExpandMore size={22} />
                          )}
                        </button>
                        {/* Edit Icon Button only */}
                        <button
                          className="mt-2 ml-2 text-blue-600 underline text-2xl flex items-center transition"
                          onClick={() => {
                            setEditedLetter(coverLetter);
                            setEditMode(true);
                          }}
                          title="Edit"
                        >
                          <MdOutlineEdit />
                        </button>
                      </div>
                    </>
                  )}
                  {/* --- Job-Fit Score Card --- */}
                  {jobFitScore && (
                    <div
                      className={`mt-4 mx-auto max-w-xs w-full rounded-xl border-2 p-5 flex flex-col items-center text-center shadow transition bg-white dark:bg-gray-900 ${SCORE_COLORS[jobFitScore.border_color]}`}
                    >
                      <div className="text-3xl mb-2">{jobFitScore.match_icon}</div>
                      <div className="text-lg font-bold mb-1">Job-Fit Score:</div>
                      <div className="text-4xl font-extrabold mb-1">{jobFitScore.score}%</div>
                      <div className="text-base font-semibold mb-2">{jobFitScore.match_level}</div>
                      {jobFitScore.explanation && Array.isArray(jobFitScore.explanation) && (
                        <>
                          {jobFitScore.explanation.map((line, idx) => (
                            <div key={idx} className="text-sm mb-1">{line}</div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  {/* --- Keyword Match Details --- */}
                  {jobFitScore && jobFitScore.keywords && (
                    <div className="mt-4 w-full max-w-md mx-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MdInfoOutline className="text-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-200">
                          Matched keywords are found in your resume and the job post. Missing ones are what employers might expect but don’t appear in your resume.
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full mb-2">
                        <div className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-500 ${
                              jobFitScore.score >= 75
                                ? "bg-green-500"
                                : jobFitScore.score >= 50
                                ? "bg-yellow-400"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${jobFitScore.score}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-right text-gray-500 mt-1">{jobFitScore.score}% match</div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Matched */}
                        <div className="flex-1 min-w-[120px]">
                          <div className="flex items-center gap-1 font-semibold text-green-600 mb-1">
                            <MdCheckCircle className="text-green-500" /> Matched Keywords
                          </div>
                          <div className="max-h-32 overflow-y-auto pr-1">
                            {jobFitScore.keywords.matched.length > 0 ? (
                              <ul className="space-y-1">
                                {jobFitScore.keywords.matched.map((kw, i) => (
                                  <li key={i} className="flex items-center gap-1 text-green-700 text-sm">
                                    <MdCheckCircle className="text-green-400" /> {kw}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-xs text-gray-400">No matches</div>
                            )}
                          </div>
                        </div>
                        {/* Missing */}
                        <div className="flex-1 min-w-[120px]">
                          <div className="flex items-center gap-1 font-semibold text-red-600 mb-1">
                            <MdErrorOutline className="text-red-500" /> Missing Keywords
                          </div>
                          <div className="max-h-32 overflow-y-auto pr-1">
                            {jobFitScore.keywords.missing.length > 0 ? (
                              <ul className="space-y-1">
                                {jobFitScore.keywords.missing.map((kw, i) => (
                                  <li key={i} className="flex items-center gap-1 text-red-700 text-sm">
                                    <MdErrorOutline className="text-red-400" /> {kw}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-xs text-gray-400">None missing</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* --- Requirement Match Details --- */}
                  {jobFitScore && jobFitScore.requirements && (
                    <div className="mt-4 w-full max-w-md mx-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MdInfoOutline className="text-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-200">
                          Matched requirements are found in your resume and the job post. Missing ones are what employers might expect but don’t appear in your resume.
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full mb-2">
                        <div className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-500 ${
                              jobFitScore.score >= 75
                                ? "bg-green-500"
                                : jobFitScore.score >= 50
                                ? "bg-yellow-400"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${jobFitScore.score}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-right text-gray-500 mt-1">{jobFitScore.score}% match</div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Matched */}
                        <div className="flex-1 min-w-[120px] max-h-40 overflow-y-auto pr-1">
                          {renderGroupedRequirements(jobFitScore.requirements.matched, "text-green-700", <MdCheckCircle className="text-green-400" />)}
                        </div>
                        {/* Missing */}
                        <div className="flex-1 min-w-[120px] max-h-40 overflow-y-auto pr-1">
                          {renderGroupedRequirements(jobFitScore.requirements.missing, "text-red-700", <MdErrorOutline className="text-red-400" />)}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-gray-400 text-center mt-12 text-sm sm:text-base">Your generated cover letter will appear here.</div>
              )}
            </div>
          </section>
        </div>
        {/* Divider for mobile/tablet */}
        <div className="lg:hidden my-6 w-full flex items-center">
          <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
        </div>
      </div>
    </>
  );
}