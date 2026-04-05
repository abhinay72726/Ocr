/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { FolderOpen, FileText, Image as ImageIcon, Download, Loader2, Trash2, AlertCircle, Copy, Check, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { utils, writeFile } from 'xlsx';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface ExtractedResult {
  fileName: string;
  numbers: string[];
  type: 'text' | 'image';
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

export default function App() {
  const [results, setResults] = useState<ExtractedResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractNumbersFromText = (text: string): string[] => {
    // Regex for numbers with more than 6 digits
    // Improved regex to handle various separators but strictly 7+ digits
    const regex = /\d{7,}/g;
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches)) : [];
  };

  const processImageWithGemini = async (file: File): Promise<string[]> => {
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Task: Extract all sequences of digits that are 7 characters or longer from this image. \nRules:\n1. Only return the numbers found.\n2. Separate multiple numbers with a single space.\n3. Do not include any other text, labels, or explanations.\n4. If no such numbers exist, return 'NONE'." },
              { inlineData: { data: base64Data, mimeType: file.type } }
            ]
          }
        ]
      });

      const text = response.text || "";
      if (text.trim().toUpperCase() === 'NONE') return [];
      return extractNumbersFromText(text);
    } catch (error) {
      console.error("Gemini Error:", error);
      throw new Error("AI extraction failed");
    }
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files) as File[];
    const validFiles = filesArray
      .filter(file => 
        file.type.startsWith('image/') || 
        file.name.toLowerCase().endsWith('.txt')
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (validFiles.length === 0) {
      alert("No valid .txt or image files found in the selection.");
      return;
    }

    const newResults: ExtractedResult[] = validFiles.map(file => ({
      fileName: file.name,
      numbers: [],
      type: file.type.startsWith('image/') ? 'image' : 'text',
      status: 'pending'
    }));

    setResults(prev => [...newResults, ...prev]);
    setIsProcessing(true);
    setProgress(0);

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      
      setResults(prev => prev.map(r => r.fileName === file.name ? { ...r, status: 'processing' } : r));

      try {
        let extracted: string[] = [];
        if (file.name.toLowerCase().endsWith('.txt')) {
          const text = await file.text();
          extracted = extractNumbersFromText(text);
        } else {
          extracted = await processImageWithGemini(file);
        }

        setResults(prev => prev.map(r => 
          r.fileName === file.name ? { ...r, numbers: extracted, status: 'completed' } : r
        ));
      } catch (error) {
        setResults(prev => prev.map(r => 
          r.fileName === file.name ? { ...r, status: 'error', error: (error as Error).message } : r
        ));
      }
      
      setProgress(Math.round(((i + 1) / validFiles.length) * 100));
    }

    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyToClipboard = () => {
    const content = results
      .filter(r => r.status === 'completed')
      .map(r => `${r.fileName} : ${r.numbers.join(', ')}`)
      .join('\n');
    
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadExcel = () => {
    const data = results
      .filter(r => r.status === 'completed')
      .map(r => ({
        "File Name": r.fileName,
        "Extracted Number": r.numbers.join(', ')
      }));
    
    if (data.length === 0) return;

    const worksheet = utils.json_to_sheet(data);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Extracted Numbers");
    writeFile(workbook, "extracted_numbers.xlsx");
  };

  const downloadResults = () => {
    const content = results
      .filter(r => r.status === 'completed')
      .map(r => `${r.fileName} : ${r.numbers.join(', ')}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted_numbers.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-indigo-600">Number Extractor Pro</h1>
          <p className="text-slate-500">Extract numbers with 7+ digits from text files and images</p>
        </header>

        {/* Action Bar */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          <div className="flex flex-wrap gap-4 justify-center items-center">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.webkitdirectory = true;
                  fileInputRef.current.click();
                }
              }}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
            >
              <FolderOpen size={20} />
              Select Folder
            </button>

            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.webkitdirectory = false;
                  fileInputRef.current.click();
                }
              }}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-100 rounded-xl font-medium hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={20} />
              Select Files
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelection}
              multiple
              className="hidden"
            />

            {results.length > 0 && !isProcessing && (
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-900 transition-colors shadow-lg shadow-slate-200"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                  {copied ? 'Copied!' : 'Copy Results'}
                </button>
                <button
                  onClick={downloadExcel}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 border-2 border-indigo-100 rounded-xl font-medium hover:bg-indigo-100 transition-colors shadow-lg shadow-indigo-50"
                >
                  <FileSpreadsheet size={20} />
                  Excel
                </button>
                <button
                  onClick={downloadResults}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
                >
                  <Download size={20} />
                  TXT
                </button>
                <button
                  onClick={clearResults}
                  className="flex items-center gap-2 px-4 py-3 text-slate-500 hover:text-rose-600 transition-colors"
                  title="Clear all"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                <span>Processing Files...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-indigo-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {results.map((result, index) => (
              <motion.div
                key={`${result.fileName}-${index}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-start gap-4"
              >
                <div className={`p-2 rounded-lg ${result.type === 'image' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                  {result.type === 'image' ? <ImageIcon size={20} /> : <FileText size={20} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-slate-800 truncate pr-4">{result.fileName}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {result.status === 'processing' && <Loader2 size={16} className="animate-spin text-indigo-500" />}
                      {result.status === 'error' && <AlertCircle size={16} className="text-rose-500" />}
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full uppercase tracking-wider ${
                        result.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                        result.status === 'processing' ? 'bg-indigo-50 text-indigo-600' :
                        result.status === 'error' ? 'bg-rose-50 text-rose-600' :
                        'bg-slate-50 text-slate-400'
                      }`}>
                        {result.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    {result.status === 'completed' ? (
                      <p className="text-slate-600 break-all font-mono text-sm bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {result.numbers.length > 0 ? result.numbers.join(', ') : <span className="text-slate-400 italic">No numbers found</span>}
                      </p>
                    ) : result.status === 'error' ? (
                      <p className="text-rose-500 text-sm italic">{result.error}</p>
                    ) : (
                      <div className="h-8 bg-slate-50 animate-pulse rounded-lg" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {results.length === 0 && !isProcessing && (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-3xl">
              <FolderOpen size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-400 font-medium">Select a folder to start extracting numbers</p>
              <p className="text-slate-300 text-sm">Supports .txt files and common image formats</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Mobile Hint */}
      <footer className="mt-12 text-center text-slate-400 text-xs">
        <p>Built with Google Gemini AI for advanced OCR extraction</p>
      </footer>
    </div>
  );
}
