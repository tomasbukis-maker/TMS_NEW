import React, { useEffect, useRef } from 'react';
import './HTMLPreviewModal.css';

export interface HTMLPreview {
  title: string;
  htmlContent?: string; // Optional HTML content, jei naudojame url, tai nereikalingas
  url?: string; // Optional URL, jei norime naudoti iframe src vietoj htmlContent
}

interface HTMLPreviewModalProps {
  preview: HTMLPreview | null;
  onClose: () => void;
  onDownloadPDF?: () => void | Promise<void>;
  onSendEmail?: () => void | Promise<void>;
  onLanguageChange?: (lang: string) => void | Promise<void>;
  currentLang?: string;
}

const HTMLPreviewModal: React.FC<HTMLPreviewModalProps> = ({ 
  preview, 
  onClose, 
  onDownloadPDF, 
  onSendEmail,
  onLanguageChange,
  currentLang = 'lt'
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    if (!preview) {
      return;
    }

    setLoading(true);
    setError(null);

    const iframe = iframeRef.current;
    if (!iframe) {
      setLoading(false);
      return;
    }

    // Jei yra URL, naudoti iframe src
    if (preview.url) {
      iframe.src = preview.url;
      iframe.onload = () => {
        setLoading(false);
      };
      iframe.onerror = () => {
        setError('Nepavyko įkelti HTML turinio');
        setLoading(false);
      };
    } else if (preview.htmlContent) {
      // Jei yra htmlContent, įrašyti į iframe
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(preview.htmlContent);
          iframeDoc.close();
          setLoading(false);
        } else {
          // Fallback - naudoti srcdoc
          iframe.srcdoc = preview.htmlContent;
          iframe.onload = () => {
            setLoading(false);
          };
          iframe.onerror = () => {
            setError('Nepavyko įkelti HTML turinio');
            setLoading(false);
          };
        }
      } catch (err: any) {
        setError(err?.message || 'Nepavyko įkelti HTML turinio');
        setLoading(false);
      }
    } else {
      setError('Nėra HTML turinio');
      setLoading(false);
    }
  }, [preview]);

  // ESC klavišas uždaro modalą
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && preview) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [preview, onClose]);

  if (!preview) {
    return null;
  }

  return (
    <div className="html-preview-overlay" onClick={onClose}>
      <div className="html-preview-modal" onClick={(event) => event.stopPropagation()}>
        <header className="html-preview-header">
          <h3>{preview.title}</h3>
          <div className="html-preview-actions">
            {onLanguageChange && (
              <div className="html-preview-lang-switcher">
                <span className="html-preview-lang-label">Kalba / Language:</span>
                {(['lt', 'en', 'ru'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => onLanguageChange(lang)}
                    className={`html-preview-lang-btn ${currentLang === lang ? 'active' : ''}`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {onDownloadPDF && (
              <button 
                type="button" 
                onClick={onDownloadPDF} 
                className="html-preview-action-btn html-preview-download-pdf"
                title="Atsisiųsti PDF"
              >
                📥 Atsisiųsti PDF
              </button>
            )}
            {onSendEmail && (
              <button 
                type="button" 
                onClick={onSendEmail} 
                className="html-preview-action-btn html-preview-send-email"
                title="Siųsti el. paštu"
              >
                📧 Siųsti El. paštu
              </button>
            )}
            <button type="button" onClick={onClose} className="html-preview-close">
              ×
            </button>
          </div>
        </header>
        <div className="html-preview-body">
          {loading && <div className="html-preview-loading">Įkeliama…</div>}
          {error && (
            <div className="html-preview-error">
              {error}
              {preview.url && (
                <a href={preview.url} target="_blank" rel="noreferrer">
                  Atidaryti naujame lange
                </a>
              )}
            </div>
          )}
          {!loading && !error && (
            <iframe
              ref={iframeRef}
              className="html-preview-iframe"
              title={preview.title}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default HTMLPreviewModal;

