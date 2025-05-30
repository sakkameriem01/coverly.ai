// Smart Cover Letter Generator - Frontend (React + Tailwind)

import React, { useState, useEffect } from "react";
import axios from "axios";
import { Toaster, toast } from "react-hot-toast";
import { BiCopy } from "react-icons/bi";
import { MdOutlineDone, MdOutlineDarkMode, MdOutlineLightMode, MdExpandMore, MdOutlineEdit, MdCheckCircle, MdErrorOutline, MdInfoOutline, MdOutlineDelete, MdDriveFileRenameOutline, MdOutlineFileDownload } from "react-icons/md";
import { LuBrain, LuHistory } from "react-icons/lu";
import { BsCircleFill, BsArrowRepeat } from "react-icons/bs";
import { IoLanguageOutline } from "react-icons/io5";
import { FaStar } from "react-icons/fa";
import jsPDF from "jspdf"; // npm install jspdf
import './App.css';
import { useTranslation } from 'react-i18next';
import './i18n';

// --- Utility Functions ---

function extractKeywords(text, topN = 8) {
  if (!text) return [];
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

function highlightKeywords(text, keywords) {
  if (!keywords.length) return text;
  const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
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
  { value: "formal", icon: "💼" },
  { value: "friendly", icon: "😄" },
  { value: "confident", icon: "💪" },
  { value: "enthusiastic", icon: "✨" },
  { value: "academic", icon: "🤓" },
  { value: "calm", icon: "🧘" },
  { value: "persuasive", icon: "🔥" },
  { value: "analytical", icon: "🧠" },
  { value: "leadership", icon: "🥇" },
  { value: "storytelling", icon: "💬" },
  { value: "custom", icon: "📝" }
];

function ToneSelector({ selectedTone, setSelectedTone, customTone, setCustomTone }) {
  const { t } = useTranslation();
  
  return (
    <div>
      <label className="block mb-2 font-semibold text-base sm:text-lg">{t('form.tone.label')}</label>
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
            title={t(`form.tone.options.${tone.value}.tooltip`)}
            onClick={() => setSelectedTone(tone.value)}
          >
            <span className="text-xl mb-1">{tone.icon}</span>
            <span className="font-medium">{t(`form.tone.options.${tone.value}.label`)}</span>
          </button>
        ))}
      </div>
      {selectedTone === "custom" && (
        <input
          type="text"
          value={customTone}
          onChange={e => setCustomTone(e.target.value)}
          placeholder={t('form.tone.customPlaceholder')}
          className="mt-2 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 transition bg-white dark:bg-gray-800 dark:text-gray-100"
        />
      )}
    </div>
  );
}

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

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "ar", label: "العربية" }
];

function getCoverLetterScore(jobDescription, coverLetter) {
  const jobKeywords = extractKeywords(jobDescription, 12);
  if (!coverLetter || !jobDescription || jobKeywords.length === 0) return { score: 0, stars: 0, message: "Not enough data to rate." };
  let matchCount = 0;
  jobKeywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(coverLetter)) matchCount++;
  });
  const percent = Math.round((matchCount / jobKeywords.length) * 100);
  let stars = 1;
  let message = "Needs improvement. Try to include more relevant details.";
  if (percent >= 90) {
    stars = 5;
    message = "Excellent! Your letter aligns perfectly with the job description.";
  } else if (percent >= 70) {
    stars = 4;
    message = "Great match! Your letter aligns well with the job description.";
  } else if (percent >= 50) {
    stars = 3;
    message = "Good start, but you can improve the match further.";
  } else if (percent >= 30) {
    stars = 2;
    message = "Some relevant content, but more alignment is needed.";
  }
  return { score: percent, stars, message };
}

async function fetchCompanyName(jobDescription) {
  if (!jobDescription) return "";
  try {
    const res = await fetch("http://localhost:5000/extract-company-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_description: jobDescription }),
    });
    const data = await res.json();
    return data.company_name || "";
  } catch {
    return "";
  }
}

function saveLetterToHistory(letter, jobDescription, meta = {}) {
  const history = JSON.parse(localStorage.getItem("coverLetterHistory") || "[]");
  const entry = {
    id: meta.id || Date.now(),
    name: meta.name || `Cover Letter ${new Date().toLocaleString()}`,
    letter,
    jobDescription,
    created: meta.created || new Date().toISOString(),
    tone: meta.tone || meta.selectedTone || "Formal",
    jobType: meta.jobType || "N/A",
    company: meta.company || "",
  };
  const idx = history.findIndex(e => e.id === entry.id);
  if (idx !== -1) history[idx] = entry;
  else history.unshift(entry);
  localStorage.setItem("coverLetterHistory", JSON.stringify(history));
}

// --- Main App Component ---

export default function App() {
  const { t, i18n } = useTranslation();
  // --- State ---
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileCache, setResumeFileCache] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionCache, setJobDescriptionCache] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dark, setDark] = useState(false);
  const [selectedTone, setSelectedTone] = useState("formal");
  const [customTone, setCustomTone] = useState("");
  const [jobFitScore, setJobFitScore] = useState(null);
  const [language, setLanguage] = useState(i18n.language || 'en');
  const [editMode, setEditMode] = useState(false);
  const [editedLetter, setEditedLetter] = useState('');
  const [prevLetter, setPrevLetter] = useState('');
  const [rating, setRating] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(getHistory());
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [currentHistoryId, setCurrentHistoryId] = useState(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobTitleEdit, setJobTitleEdit] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyNameEdit, setCompanyNameEdit] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [editJobTypeId, setEditJobTypeId] = useState(null);
  const [editJobTypeValue, setEditJobTypeValue] = useState("");
  const [editCompanyId, setEditCompanyId] = useState(null);
  const [editCompanyValue, setEditCompanyValue] = useState("");

  // --- Derived ---
  const keywords = extractKeywords(jobDescription);

  // --- Effects ---
  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  // --- Handlers ---
  const handleResumeUpload = (file) => {
    setResumeFile(file);
    setResumeFileCache(file);
  };

  const handleJobDescriptionChange = (desc) => {
    setJobDescription(desc);
    setJobDescriptionCache(desc);
  };

  const handleGenerate = async (regenerate = false) => {
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
    formData.append('generation_seed', `${Date.now()}-${Math.random()}`);
    if (regenerate && editedLetter) {
      formData.append('edited_letter', editedLetter);
    }
    setLoading(true);
    setError(null);
    setCoverLetter(null);
    setJobFitScore(null);
    try {
      const res = await axios.post('http://localhost:5000/generate-cover-letter', formData);
      setCoverLetter(res.data.cover_letter);
      setJobFitScore(res.data.job_fit_score);
      setEditMode(false);
      setCopied(false);
      setEditedLetter('');
      toast.success(regenerate ? "Cover letter regenerated!" : "Cover letter generated!");
      const newId = Date.now();
      saveLetterToHistory(
        res.data.cover_letter,
        jobDescToSend,
        { tone: selectedTone, jobType: jobTitle, company: companyName, id: newId }
      );
      setCurrentHistoryId(newId);
      setHistory(getHistory());
    } catch (err) {
      console.error(err);
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // --- Scroll to output after generation ---
  const outputRef = React.useRef(null);
  useEffect(() => {
    if (coverLetter && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [coverLetter]);

  // --- Calculate rating after generation ---
  useEffect(() => {
    if (coverLetter && jobDescription) {
      setRating(getCoverLetterScore(jobDescription, coverLetter));
    } else {
      setRating(null);
    }
  }, [coverLetter, jobDescription]);

  // --- Save to history on new letter ---
  useEffect(() => {
    if (coverLetter && jobDescription && currentHistoryId === null) {
      const newId = Date.now();
      saveLetterToHistory(coverLetter, jobDescription, { tone: selectedTone, jobType: jobTitle, company: companyName, id: newId });
      setCurrentHistoryId(newId);
      setHistory(getHistory());
    }
  }, [coverLetter]);

  // --- Fetch job title and company from backend ---
  useEffect(() => {
    if (jobDescription) {
      fetchJobTitle(jobDescription).then(title => {
        setJobTitle(title);
      });
      fetchCompanyName(jobDescription).then(name => {
        setCompanyName(name);
      });
    } else {
      setJobTitle("");
      setCompanyName("");
    }
  }, [jobDescription]);

  async function fetchJobTitle(jobDescription) {
    if (!jobDescription) return "";
    try {
      const res = await fetch("http://localhost:5000/extract-job-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: jobDescription, language: language }),
      });
      const data = await res.json();
      return data.job_title || "";
    } catch {
      return "";
    }
  }

  function renderGroupedRequirements(grouped, color, icon, isMissing = false, isMatched = false) {
    return Object.entries(grouped).map(([cat, items]) => (
      <div key={cat} className="mb-2">
        <div className={`font-semibold mb-1 flex items-center gap-1 ${color}`}>
          {icon} {t(`jobFit.${cat.toLowerCase()}`)}
        </div>
        <ul className="space-y-1">
          {items.map((req, i) => (
            <li
              key={i}
              className={`flex items-center gap-1 text-sm ${color}`}
              style={
                isMissing
                  ? { background: "#FDECEC", borderRadius: "8px", padding: "2px 8px" }
                  : isMatched
                  ? { color: "#3C6F4A" }
                  : undefined
              }
            >
              {icon} {req}
            </li>
          ))}
        </ul>
      </div>
    ));
  }

  // --- History Modal ---
  function HistoryModal() {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
        <div className="history-panel relative">
          <button
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            onClick={() => setHistoryOpen(false)}
            title={t('history.actions.cancel')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="history-title">{t('history.title')}</h2>
          {history.length === 0 ? (
            <div className="text-gray-500 text-center">{t('history.empty')}</div>
          ) : (
            <ul className="space-y-4 max-h-[60vh] overflow-y-auto">
              {history.map(entry => (
                <li key={entry.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                      <span className={`font-semibold ${language === 'ar' ? 'text-lg' : ''}`}>{entry.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{new Date(entry.created).toLocaleString()}</span>
                    </div>
                    <div className="flex gap-3 mb-1 text-xs">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">{entry.tone}</span>
                      {editJobTypeId === entry.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="border rounded px-2 py-1"
                            value={editJobTypeValue}
                            onChange={e => {
                              e.preventDefault();
                              setEditJobTypeValue(e.target.value);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const history = getHistory();
                                const idx = history.findIndex(e => e.id === entry.id);
                                if (idx !== -1) {
                                  history[idx].jobType = editJobTypeValue;
                                  localStorage.setItem("coverLetterHistory", JSON.stringify(history));
                                  setHistory(history);
                                }
                                setEditJobTypeId(null);
                              } else if (e.key === 'Escape') {
                                setEditJobTypeId(null);
                              }
                            }}
                            maxLength={50}
                            autoFocus
                          />
                          <button
                            className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                            onClick={() => {
                              const history = getHistory();
                              const idx = history.findIndex(e => e.id === entry.id);
                              if (idx !== -1) {
                                history[idx].jobType = editJobTypeValue;
                                localStorage.setItem("coverLetterHistory", JSON.stringify(history));
                                setHistory(history);
                              }
                              setEditJobTypeId(null);
                            }}
                          >
                            {t('history.actions.save')}
                          </button>
                          <button
                            className="text-gray-500 px-2 text-xs"
                            onClick={() => setEditJobTypeId(null)}
                          >
                            {t('history.actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <span 
                          className="px-2 py-1 bg-green-100 text-green-700 rounded cursor-pointer hover:bg-green-200"
                          onClick={() => {
                            setEditJobTypeId(entry.id);
                            setEditJobTypeValue(entry.jobType || "");
                          }}
                        >
                          {entry.jobType || t('history.addJobType')}
                        </span>
                      )}
                      {editCompanyId === entry.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="border rounded px-2 py-1"
                            value={editCompanyValue}
                            onChange={e => {
                              e.preventDefault();
                              setEditCompanyValue(e.target.value);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const history = getHistory();
                                const idx = history.findIndex(e => e.id === entry.id);
                                if (idx !== -1) {
                                  history[idx].company = editCompanyValue;
                                  localStorage.setItem("coverLetterHistory", JSON.stringify(history));
                                  setHistory(history);
                                }
                                setEditCompanyId(null);
                              } else if (e.key === 'Escape') {
                                setEditCompanyId(null);
                              }
                            }}
                            maxLength={50}
                            autoFocus
                          />
                          <button
                            className="bg-yellow-600 text-white px-2 py-1 rounded text-xs"
                            onClick={() => {
                              const history = getHistory();
                              const idx = history.findIndex(e => e.id === entry.id);
                              if (idx !== -1) {
                                history[idx].company = editCompanyValue;
                                localStorage.setItem("coverLetterHistory", JSON.stringify(history));
                                setHistory(history);
                              }
                              setEditCompanyId(null);
                            }}
                          >
                            {t('history.actions.save')}
                          </button>
                          <button
                            className="text-gray-500 px-2 text-xs"
                            onClick={() => setEditCompanyId(null)}
                          >
                            {t('history.actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <span 
                          className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded cursor-pointer hover:bg-yellow-200"
                          onClick={() => {
                            setEditCompanyId(entry.id);
                            setEditCompanyValue(entry.company || "");
                          }}
                        >
                          {entry.company || t('history.addCompany')}
                        </span>
                      )}
                    </div>
                    <div className={`text-xs text-gray-700 dark:text-gray-200 italic mb-1 ${language === 'ar' ? 'text-sm' : ''}`}>
                      {entry.letter.slice(0, 80).replace(/\n/g, " ")}{entry.letter.length > 80 ? "..." : ""}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:items-end">
                    {renameId === entry.id ? (
                      <div className="flex gap-2 items-center mb-2">
                        <input
                          className="border rounded px-2 py-1 flex-1"
                          value={renameValue}
                          onChange={e => {
                            e.preventDefault();
                            setRenameValue(e.target.value);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              renameLetterInHistory(entry.id, renameValue);
                              setRenameId(null);
                              setHistory(getHistory());
                            } else if (e.key === 'Escape') {
                              setRenameId(null);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className="bg-blue-600 text-white px-3 py-1 rounded"
                          onClick={() => {
                            renameLetterInHistory(entry.id, renameValue);
                            setRenameId(null);
                            setHistory(getHistory());
                          }}
                        >{t('history.actions.save')}</button>
                        <button
                          className="text-gray-500 px-2"
                          onClick={() => setRenameId(null)}
                        >{t('history.actions.cancel')}</button>
                      </div>
                    ) : (
                      <div className="flex justify-center gap-4 mt-4">
                        <button
                          className="text-blue-600 hover:text-blue-700 transition-colors"
                          onClick={() => {
                            deleteLetterFromHistory(entry.id);
                            setHistory(getHistory());
                          }}
                          title={t('history.actions.delete')}
                        >
                          <MdOutlineDelete size={24} />
                        </button>
                        <button
                          className="text-green-600 hover:text-green-700 transition-colors"
                          onClick={() =>
                            downloadLetterAsPDF(
                              entry.letter,
                              undefined,
                              entry.jobType,
                              entry.company
                            )
                          }
                          title={t('history.actions.download')}
                        >
                          <MdOutlineFileDownload size={24} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const handleLanguageChange = (newLanguage) => {
    const langCode = newLanguage.toLowerCase();
    setLanguage(langCode);
    i18n.changeLanguage(langCode);
    setLanguageDropdownOpen(false);
    
    // Update document direction for RTL languages
    document.documentElement.dir = langCode === 'ar' ? 'rtl' : 'ltr';
    
    // Show success message
    const langLabel = LANGUAGE_OPTIONS.find(opt => opt.value === langCode)?.label;
    toast.success(t('header.languageChanged', { language: langLabel }));
  };

  // --- Render ---
  return (
    <>
      <Toaster position="top-right" />
      {/* Header */}
      <header className="app-header">
        <div className="flex justify-between items-center w-full">
          <span className="flex items-center">
            <img
              src={dark ? "/logo-dark.png" : "/logo.png"}
              alt="COVRLY.AI Logo"
              className="h-[110px] w-auto"
            />
          </span>
          <nav className="flex gap-4 sm:gap-6 items-center">
            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition text-2xl shadow-md hover:scale-110 duration-200 flex items-center justify-center"
              title={dark ? t('header.lightMode') : t('header.darkMode')}
              style={{ transition: "background 0.2s, transform 0.2s" }}
            >
              {dark ? <MdOutlineLightMode size={32} /> : <MdOutlineDarkMode size={32} />}
            </button>
            <button
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition text-2xl shadow-md flex items-center justify-center relative"
              title={t('header.languages')}
              style={{ transition: "background 0.2s, transform 0.2s" }}
              onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
            >
              <IoLanguageOutline size={28} />
              {languageDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700">
                  {LANGUAGE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm ${
                        language === opt.value ? 'bg-blue-50 dark:bg-blue-900' : ''
                      }`}
                      onClick={() => handleLanguageChange(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </button>
            <button
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition text-2xl shadow-md flex items-center justify-center"
              title={t('header.history')}
              style={{ transition: "background 0.2s, transform 0.2s" }}
              onClick={() => setHistoryOpen(true)}
            >
              <LuHistory size={28} />
            </button>
          </nav>
        </div>
      </header>
      {/* Main Layout */}
      <div
        className="main-content min-h-screen bg-gradient-to-br from-blue-100 to-blue-200 dark:from-gray-900 dark:to-gray-800 flex flex-col"
        style={{ fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif" }}
      >
        <div className="flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto gap-8 px-2 sm:px-4 md:px-8 py-6">
          {/* Left: Form */}
          <section className="w-full lg:w-[46%] flex flex-col justify-center items-center">
            <div className="form-container">
              <h2 className="form-title">{t('form.title')}</h2>
              <div
                className={`cv-upload-container w-full border-2 border-dashed rounded-md p-4 sm:p-6 flex flex-col items-center justify-center cursor-pointer transition focus:ring-2 focus:ring-blue-300
                  ${resumeFile ? "border-green-400 bg-green-50" : "border-gray-300"}`}
                onDragOver={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files[0];
                  if (file && (
                    file.type === "application/pdf" ||
                    file.type === "image/png" ||
                    file.type === "image/jpeg" ||
                    file.type === "image/jpg"
                  )) {
                    setResumeFile(file);
                  } else {
                    toast.error(t('form.resumeUpload.error'));
                  }
                }}
                onClick={() => document.getElementById("resume-upload").click()}
              >
                <input
                  id="resume-upload"
                  type="file"
                  accept=".pdf, .png, .jpg, .jpeg, image/png, image/jpeg"
                  style={{ display: "none" }}
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file && (
                      file.type === "application/pdf" ||
                      file.type === "image/png" ||
                      file.type === "image/jpeg" ||
                      file.type === "image/jpg"
                    )) {
                      setResumeFile(file);
                    } else {
                      toast.error(t('form.resumeUpload.error'));
                    }
                  }}
                />
                <span className="text-2xl sm:text-3xl mb-2">📄</span>
                <span className="font-medium text-gray-700 text-center text-sm sm:text-base">
                  {resumeFile ? (
                    <span className="text-green-700">{resumeFile.name}</span>
                  ) : (
                    t('form.resumeUpload.dragDrop')
                  )}
                </span>
              </div>
              <div>
                <label className="block mb-2 font-semibold text-base sm:text-lg">{t('form.jobDescription.label')}</label>
                <textarea
                  rows={Math.max(6, Math.min(12, Math.ceil(jobDescription.length / 80)))}
                  value={jobDescription}
                  onChange={e => setJobDescription(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-300 resize-y min-h-[120px] transition text-sm sm:text-base"
                  placeholder={t('form.jobDescription.placeholder')}
                  style={{ fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif" }}
                ></textarea>
                <div className="flex justify-between items-center mt-1 text-xs sm:text-sm">
                  <span className="text-gray-500">
                    {jobDescription.length} {t('form.jobDescription.characters')}
                  </span>
                </div>
                {jobTitle && !jobTitleEdit && (
                  <div className="my-2 p-2 bg-green-50 border border-green-200 rounded text-green-800 text-sm flex items-center gap-2">
                    <span>
                      {t('form.jobDescription.detectedTitle')} <b>{jobTitle}</b> —{" "}
                      <span
                        className="underline cursor-pointer"
                        onClick={() => setJobTitleEdit(true)}
                      >
                        {t('form.jobDescription.editTitle')}
                      </span>
                    </span>
                  </div>
                )}
                {jobTitleEdit && (
                  <div className="my-2 flex items-center gap-2">
                    <input
                      className="border rounded px-2 py-1"
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      maxLength={50}
                    />
                    <button
                      className="bg-green-600 text-white px-3 py-1 rounded"
                      onClick={() => {
                        setJobTitleEdit(false);
                        if (currentHistoryId) {
                          saveLetterToHistory(
                            coverLetter,
                            jobDescription,
                            { tone: selectedTone, jobType: jobTitle, company: companyName, id: currentHistoryId }
                          );
                          setHistory(getHistory());
                        }
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                )}
                {companyName && !companyNameEdit && (
                  <div className="my-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm flex items-center gap-2">
                    <span>
                      {t('form.jobDescription.detectedCompany')} <b>{companyName}</b> —{" "}
                      <span
                        className="underline cursor-pointer"
                        onClick={() => setCompanyNameEdit(true)}
                      >
                        {t('form.jobDescription.editCompany')}
                      </span>
                    </span>
                  </div>
                )}
                {companyNameEdit && (
                  <div className="my-2 flex items-center gap-2">
                    <input
                      className="border rounded px-2 py-1"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      maxLength={50}
                    />
                    <button
                      className="bg-yellow-600 text-white px-3 py-1 rounded"
                      onClick={() => {
                        setCompanyNameEdit(false);
                        if (currentHistoryId) {
                          saveLetterToHistory(
                            coverLetter,
                            jobDescription,
                            { tone: selectedTone, jobType: jobTitle, company: companyName, id: currentHistoryId }
                          );
                          setHistory(getHistory());
                        }
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
              {/* Cover Letter Language Selector */}
              <div>
                <label className="block mb-2 font-semibold text-base sm:text-lg">{t('form.coverLetterLanguage.label')}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300 transition text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                >
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
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
                    {t('form.generate.generating')}
                  </span>
                ) : (
                  <span>{t('form.generate.generate')}</span>
                )}
              </button>
            </div>
          </section>
          {/* Divider for desktop, hidden on mobile */}
          <div className="hidden lg:flex flex-col justify-center items-center px-2">
            <div className="my-8 w-px h-[80%] bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
          {/* Right: Output */}
          <section
            ref={outputRef}
            className="w-full lg:w-[54%] flex flex-col justify-center items-center"
          >
            <div className="output-section">
              <h2 className="output-title">
                {t('output.title')}
              </h2>
              {coverLetter ? (
                <>
                  {/* Edit Mode */}
                  {editMode ? (
                    <>
                      <div className="output-content">
                        <textarea
                          value={editedLetter}
                          onChange={e => setEditedLetter(e.target.value)}
                          className="w-full min-h-[350px] sm:min-h-[400px] border rounded-lg p-3 text-sm sm:text-base bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-300 transition"
                          style={{
                            direction: language === "Arabic" ? "rtl" : "ltr",
                            textAlign: language === "Arabic" ? "right" : "left",
                            fontSize: "1.1rem"
                          }}
                        />
                        {prevLetter && (
                          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                            <span className="font-semibold" style={{ fontSize: "1.1em" }}>{t('previousVersion')}:</span>
                            <pre
                              className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 rounded p-2 mt-1 border max-h-40 overflow-y-auto"
                              style={{
                                fontSize: "1.08em",
                                fontFamily: "'Inter', 'Poppins', 'Roboto', sans-serif"
                              }}
                            >
                              {prevLetter}
                            </pre>
                          </div>
                        )}
                      </div>
                      <div className="output-actions">
                        <button
                          onClick={() => {
                            setCoverLetter(editedLetter);
                            setPrevLetter(coverLetter);
                            setEditMode(false);
                            if (currentHistoryId) {
                              saveLetterToHistory(
                                editedLetter,
                                jobDescription,
                                { tone: selectedTone, jobType: jobTitle, company: companyName, id: currentHistoryId }
                              );
                              setHistory(getHistory());
                            }
                          }}
                        >
                          {t('save')}
                        </button>
                        <button
                          onClick={() => setEditMode(false)}
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="output-content">
                        <pre
                          className={`whitespace-pre-wrap font-mono flex-1 transition-all duration-300 rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 ${
                            expanded ? "max-h-[900px]" : "max-h-[400px]"
                          } min-h-[320px] sm:min-h-[400px] w-full text-xs sm:text-base overflow-auto`}
                          style={{
                            fontFamily: "inherit",
                            direction: language === "Arabic" ? "rtl" : "ltr",
                            textAlign: language === "Arabic" ? "right" : "left",
                            color: dark ? "#fff" : "#222"
                          }}
                        >
                          {highlightKeywords(coverLetter, keywords)}
                        </pre>
                      </div>
                      <div className="output-actions">
                        <div className="flex justify-center gap-4 mt-4">
                          <button
                            className="text-blue-600 hover:text-blue-700 transition-colors"
                            onClick={() => {
                              navigator.clipboard.writeText(coverLetter);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 1000);
                            }}
                            title={copied ? t('copied') : t('copyClipboard')}
                          >
                            {copied ? <MdOutlineDone size={24} /> : <BiCopy size={24} />}
                          </button>
                          <button
                            className="text-blue-500 hover:text-blue-600 transition-colors"
                            onClick={() => setExpanded((e) => !e)}
                            title={expanded ? t('collapse') : t('expand')}
                          >
                            {expanded ? (
                              <span className="transition-transform duration-200 rotate-180"><MdExpandMore size={24} /></span>
                            ) : (
                              <MdExpandMore size={24} />
                            )}
                          </button>
                          <button
                            className="text-blue-600 hover:text-blue-700 transition-colors"
                            onClick={() => {
                              setEditedLetter(coverLetter);
                              setEditMode(true);
                            }}
                            title={t('edit')}
                          >
                            <MdOutlineEdit size={24} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  {/* Job-Fit Score Card */}
                  {jobFitScore && (
                    <div className={`mt-4 mx-auto max-w-lg w-full rounded-xl border-2 p-5 flex flex-col items-center text-center shadow transition bg-white dark:bg-gray-900 ${SCORE_COLORS[jobFitScore.border_color]}`}>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-3xl">{jobFitScore.match_icon}</span>
                        <span className={`text-lg font-bold ${language === 'ar' ? 'text-xl' : ''}`}>{t('jobFit.title')}:</span>
                        <span className={`text-4xl font-extrabold ml-2 ${language === 'ar' ? 'text-5xl' : ''}`}>{jobFitScore.score}%</span>
                      </div>
                      <div className={`text-base font-semibold mb-2 ${language === 'ar' ? 'text-lg' : ''}`}>{t(`jobFit.${jobFitScore.match_level}`)}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-200">
                        {t('jobFit.resumeMatchPercentage', { score: jobFitScore.score })}
                        <br />
                        {t(`jobFit.${jobFitScore.explanation[1]}`)}
                      </div>
                    </div>
                  )}
                  {/* Requirement Match Details */}
                  {jobFitScore && jobFitScore.requirements && (
                    <div className="mt-4 w-full max-w-md mx-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MdInfoOutline className="text-blue-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-200">
                          {t('jobFit.requirementsExplanation')}
                        </span>
                      </div>
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
                        <div className="text-xs text-right text-gray-500 mt-1">{jobFitScore.score}% {t('match')}</div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 min-w-[120px] max-h-40 overflow-y-auto pr-1">
                          {renderGroupedRequirements(
                            jobFitScore.requirements.matched,
                            "text-green-700",
                            <MdCheckCircle className="text-green-400" />,
                            false,
                            true
                          )}
                        </div>
                        <div className="flex-1 min-w-[120px] max-h-40 overflow-y-auto pr-1">
                          {renderGroupedRequirements(
                            jobFitScore.requirements.missing,
                            "text-red-700",
                            <MdErrorOutline className="text-red-400" />,
                            true
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Cover Letter Rating */}
                  {coverLetter && rating && (
                    <div className="mt-6 flex flex-col items-center justify-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow p-4 max-w-md mx-auto">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-semibold">{t('coverLetterRating.title')}:</span>
                        <span className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <FaStar
                              key={i}
                              className={i < rating.stars ? "text-yellow-400" : "text-gray-300"}
                              size={22}
                            />
                          ))}
                        </span>
                        <span className="ml-2 text-base font-bold text-blue-700">{rating.score}/100</span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-200 text-center">
                        {rating.stars === 5 && t('coverLetterRating.ratingMessage.excellent')}
                        {rating.stars === 4 && t('coverLetterRating.ratingMessage.great')}
                        {rating.stars === 3 && t('coverLetterRating.ratingMessage.good')}
                        {rating.stars === 2 && t('coverLetterRating.ratingMessage.fair')}
                        {rating.stars === 1 && t('coverLetterRating.ratingMessage.poor')}
                      </div>
                      <button
                        className="mt-3 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition text-sm shadow active:scale-95 flex items-center justify-center"
                        onClick={() => handleGenerate(true)}
                        title={t('output.actions.regenerate')}
                      >
                        <BsArrowRepeat size={24} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="output-empty">{t('output.empty')}</div>
              )}
            </div>
          </section>
        </div>
        <div className="lg:hidden my-6 w-full flex items-center">
          <hr className="flex-grow border-t border-gray-300 dark:border-gray-700" />
        </div>
      </div>
      {/* Footer */}
      <footer className="app-footer dark:app-footer-dark">
        {t('footer.copyright')}
      </footer>
      {/* History Modal */}
      {historyOpen && <HistoryModal />}
    </>
  );
}

// --- Local Storage Helpers ---

function getHistory() {
  return JSON.parse(localStorage.getItem("coverLetterHistory") || "[]");
}

function renameLetterInHistory(id, newName) {
  const history = getHistory();
  const idx = history.findIndex(e => e.id === id);
  if (idx !== -1) {
    history[idx].name = newName;
    localStorage.setItem("coverLetterHistory", JSON.stringify(history));
  }
}

function deleteLetterFromHistory(id) {
  const history = getHistory();
  localStorage.setItem("coverLetterHistory", JSON.stringify(history.filter(e => e.id !== id)));
}

// --- PDF Download Helper ---

function downloadLetterAsPDF(letter, name = "cover-letter.pdf", jobTitle = "", company = "") {
  let fileName = name && name.trim() ? name.trim() : undefined;
  if (!fileName) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const clean = str =>
      (str || "")
        .replace(/[^a-zA-Z0-9]+/g, "")
        .slice(0, 30);
    fileName = `CoverLetter_${clean(jobTitle) || "Custom"}_${clean(company) || "Custom"}_${dateStr}`;
  }
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    fileName += ".pdf";
  }
  const doc = new jsPDF({
    unit: "pt",
    format: "a4"
  });
  const margin = 72;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  let y = margin;
  if (company || jobTitle) {
    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.text(jobTitle || "Cover Letter", margin, y);
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    y += 22;
    if (company) {
      doc.setFont("times", "italic");
      doc.text(company, margin, y);
      doc.setFont("times", "normal");
      y += 18;
    }
    y += 8;
  }
  const lineSpacing = 1.3;
  const lines = doc.splitTextToSize(letter, usableWidth);
  for (let i = 0; i < lines.length; i++) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines[i], margin, y);
    y += 12 * lineSpacing;
  }
  doc.save(fileName);
}