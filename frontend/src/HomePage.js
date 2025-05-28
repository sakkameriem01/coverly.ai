import { Link } from "react-router-dom";
import { BiRocket } from "react-icons/bi";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-blue-200 flex flex-col">
      {/* Header */}
      <header className="bg-blue-800 text-white px-8 py-4 flex items-center shadow">
        <span className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span role="img" aria-label="logo">📝</span> Smart Cover Letter
        </span>
        <nav className="ml-auto flex gap-6">
          <a href="#" className="hover:underline opacity-80">Home</a>
          <a href="#" className="hover:underline opacity-80">About</a>
          <a href="#" className="hover:underline opacity-80">Settings</a>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-10 mt-16 mb-16 flex flex-col items-center space-y-8 animate-fade-in">
          <h1 className="text-4xl font-extrabold text-blue-800 mb-2 tracking-tight text-center">
            📝 Smart Cover Letter Generator
          </h1>
          <p className="text-lg text-gray-700 text-center max-w-xl">
            Instantly generate tailored, professional cover letters for any job application. Upload your resume, paste the job description, and let AI do the rest!
          </p>
          <ul className="text-gray-600 space-y-2 text-base">
            <li>✅ Fast, AI-powered cover letter creation</li>
            <li>✅ No signup required</li>
            <li>✅ Secure: your data never leaves your device</li>
            <li>✅ Free to use</li>
          </ul>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold text-lg shadow transition duration-200"
          >
            <BiRocket className="text-2xl" />
            Get Started
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-gray-500 py-4 text-sm">
        &copy; {new Date().getFullYear()} Meriem Sakka. All rights reserved.
      </footer>
      <style>{`
        .animate-fade-in { animation: fadeIn 0.7s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}