'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CandidateUploadModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a resume document to upload.');
      return;
    }

    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (fileExt !== '.pdf' && fileExt !== '.docx') {
      setError('Unsupported format. Only PDF and DOCX documents are allowed.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response = await fetch('/api/candidates', {
        method: 'POST',
        body: formData,
        headers: {
          // Playwright tests set the Referer/Origin headers.
          // In standard browser environment, Origin is handled automatically.
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to upload candidate resume.');
      }

      // Reset state and close modal
      setFile(null);
      setIsOpen(false);
      
      // Refresh Next.js page data
      router.refresh();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errMsg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)} 
        className="btn btn-primary" 
        style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
        id="btn-upload-resume"
      >
        Upload Resume
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', margin: '0 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Upload Candidate Resume</h3>
              <button 
                onClick={() => { setIsOpen(false); setFile(null); setError(null); }} 
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'hsl(var(--foreground) / 0.5)' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpload}>
              {error && (
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: 'hsl(var(--danger) / 0.1)', 
                  border: '1px solid hsl(var(--danger) / 0.2)', 
                  borderRadius: 'var(--radius-sm)', 
                  color: 'hsl(var(--danger))', 
                  fontSize: '0.875rem', 
                  marginBottom: '1rem' 
                }}>
                  {error}
                </div>
              )}

              <div style={{ 
                border: '2px dashed hsl(var(--border))', 
                borderRadius: 'var(--radius-md)', 
                padding: '2rem', 
                textAlign: 'center', 
                backgroundColor: 'hsl(var(--secondary) / 0.3)',
                marginBottom: '1.5rem'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📤</div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, margin: '0 0 0.25rem' }}>
                  Select PDF or Word file
                </p>
                <p style={{ fontSize: '0.75rem', color: 'hsl(var(--foreground) / 0.5)', margin: '0 0 1rem' }}>
                  Maximum file size: 5MB
                </p>
                
                <input 
                  type="file" 
                  accept=".pdf,.docx" 
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="resume-file-input"
                />
                
                <label 
                  htmlFor="resume-file-input" 
                  className="btn btn-secondary" 
                  style={{ fontSize: '0.825rem', padding: '0.375rem 0.75rem', cursor: 'pointer', display: 'inline-block' }}
                >
                  Choose File
                </label>

                {file && (
                  <div style={{ marginTop: '1rem', fontSize: '0.875rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>
                    Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button" 
                  onClick={() => { setIsOpen(false); setFile(null); setError(null); }}
                  className="btn btn-secondary" 
                  style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
                  disabled={isUploading || !file}
                  id="btn-submit-upload"
                >
                  {isUploading ? 'Uploading...' : 'Upload & Parse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
