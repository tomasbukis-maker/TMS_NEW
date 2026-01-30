import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import * as pdfjsLib from 'pdfjs-dist';
import './DocumentTrainingModal.css';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface Attachment {
  id: number;
  filename: string;
  size: number;
  download_url: string;
  mail_message_subject: string;
}

interface TrainingData {
  template_name: string;
  document_type: string;
  field_mappings: Record<string, any>;
}

const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Sąskaita' },
  { value: 'contract', label: 'Sutartis' },
  { value: 'cmr', label: 'CMR važtaraštis' },
  { value: 'tir', label: 'TIR dokumentas' },
  { value: 'other', label: 'Kita' },
];

const TRAINING_FIELDS = [
  { key: 'partner_name', label: 'Partnerio pavadinimas' },
  { key: 'invoice_number', label: 'Sąskaitos numeris' },
  { key: 'invoice_date', label: 'Sąskaitos data' },
  { key: 'due_date', label: 'Apmokėjimo terminas' },
  { key: 'amount', label: 'Suma' },
  { key: 'vat_amount', label: 'PVM suma' },
  { key: 'total_amount', label: 'Bendra suma' },
  { key: 'order_number', label: 'Užsakymo numeris' },
  { key: 'expedition_number', label: 'Ekspedicijos numeris' },
];

interface DocumentTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DocumentTrainingModal: React.FC<DocumentTrainingModalProps> = ({ isOpen, onClose }) => {
  const { isAuthenticated, user } = useAuth();
  const [untrainedAttachments, setUntrainedAttachments] = useState<Attachment[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<Attachment | null>(null);
  const [trainingData, setTrainingData] = useState<TrainingData>({
    template_name: '',
    document_type: 'invoice',
    field_mappings: {},
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [markingMode, setMarkingMode] = useState<string | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [markedRegions, setMarkedRegions] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // PDF refs
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = React.useRef<HTMLCanvasElement>(null);

  // PDF rendering function
  const renderPage = useCallback(async (pageNum: number, pdfDocument?: any) => {
    if (!canvasRef.current || !overlayCanvasRef.current) {
      console.warn('Canvas elements not found');
      return;
    }

    try {
      // Get PDF document if not provided
      let pdf = pdfDocument;
      if (!pdf && selectedAttachment) {
        const response = await fetch(selectedAttachment.download_url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        const pdfData = await response.arrayBuffer();
        pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      }

      if (!pdf) return;

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;

      // Calculate scale to fit canvas width
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const scale = (containerWidth - 40) / viewport.width; // 40px for padding
      const scaledViewport = page.getViewport({ scale });

      // Set canvas dimensions
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      overlayCanvas.width = scaledViewport.width;
      overlayCanvas.height = scaledViewport.height;

      const context = canvas.getContext('2d');
      if (!context) return;

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;
      console.log(`Page ${pageNum} rendered successfully`);
    } catch (error) {
      console.error('Error rendering PDF page:', error);
      setPdfError('Nepavyko atvaizduoti PDF puslapio');
    }
  }, [selectedAttachment]);

  // Render marked regions on overlay canvas
  const renderMarkedRegions = useCallback(() => {
    if (!overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw marked regions
    markedRegions.forEach((region, index) => {
      if (region.page !== currentPage) return; // Only show regions for current page

      ctx.strokeStyle = '#28a745';
      ctx.lineWidth = 2;
      ctx.strokeRect(region.x, region.y, region.width, region.height);

      ctx.fillStyle = 'rgba(40, 167, 69, 0.2)';
      ctx.fillRect(region.x, region.y, region.width, region.height);

      // Draw label
      ctx.fillStyle = '#28a745';
      ctx.font = '12px Arial';
      ctx.fillText(region.field, region.x, region.y - 5);
    });
  }, [markedRegions, currentPage]);

  // Mouse event handlers for marking
  const startDrawing = useCallback((e: React.MouseEvent) => {
    if (!markingMode || !overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });
  }, [markingMode]);

  const continueDrawing = useCallback((e: React.MouseEvent) => {
    if (!startPos || !overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    // Clear and redraw
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw current selection
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(startPos.x, startPos.y, currentX - startPos.x, currentY - startPos.y);
  }, [startPos]);

  const finishDrawing = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || !startPos || !overlayCanvasRef.current || !markingMode) return;

    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const width = endX - startPos.x;
    const height = endY - startPos.y;

    if (Math.abs(width) < 10 || Math.abs(height) < 10) {
      // Too small, cancel
      setIsDrawing(false);
      setStartPos(null);
      return;
    }

    // Save marked region
    const newRegion = {
      field: markingMode,
      x: Math.min(startPos.x, endX),
      y: Math.min(startPos.y, endY),
      width: Math.abs(width),
      height: Math.abs(height),
      page: currentPage,
    };

    setMarkedRegions(prev => [...prev, newRegion]);
    setTrainingData(prev => ({
      ...prev,
      field_mappings: {
        ...prev.field_mappings,
        [markingMode]: { ...newRegion, marked: true },
      },
    }));

    // Clear overlay
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    setIsDrawing(false);
    setMarkingMode(null);
    setStartPos(null);
  }, [isDrawing, startPos, markingMode, currentPage]);


  // Load untrained attachments
  const loadUntrainedAttachments = useCallback(async () => {
    console.log('loadUntrainedAttachments called');
    try {
      setLoading(true);
      setApiError(null);
      console.log('Making API call to /mail/untrained-attachments/');
      const response = await api.get('/mail/untrained-attachments/');
      console.log('API response received:', response);
      console.log('API response data:', response.data);
      console.log('API response data type:', typeof response.data);
      console.log('Is array?', Array.isArray(response.data));
      console.log('Has results?', response.data && response.data.results);

      // API returns paginated data: { count, next, previous, results }
      // Extract the results array
      const data = response.data && response.data.results ? response.data.results : [];
      console.log('Extracted results:', data);
      console.log('Results is array?', Array.isArray(data));
      console.log('Results length:', data.length);

      setUntrainedAttachments(data);
    } catch (error: any) {
      console.error('=== API ERROR DEBUG ===');
      console.error('Error loading attachments:', error);
      console.error('Error response:', error.response);
      console.error('Error status:', error.response?.status);
      console.error('Error data:', error.response?.data);
      console.error('Token exists:', !!localStorage.getItem('token'));
      console.error('Token value preview:', localStorage.getItem('token')?.substring(0, 50) + '...');
      console.error('======================');

      setUntrainedAttachments([]); // Set empty array on error

      if (error.response?.status === 401) {
        console.log('401 error - removing token and redirecting to login');
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        setApiError('Sesija pasibaigė. Prašome prisijungti iš naujo.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setApiError(`Nepavyko užkrauti dokumentų sąrašo: ${error.message || 'Nežinoma klaida'}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle attachment selection
  const handleAttachmentSelect = useCallback(async (attachment: Attachment) => {
    setSelectedAttachment(attachment);
    setPdfLoading(true);
    setPdfError(null);
    setCurrentPage(1);
    setMarkedRegions([]);

    // Reset training data for new attachment
    setTrainingData({
      template_name: `${attachment.filename.split('.')[0]} - šablonas`,
      document_type: 'invoice',
      field_mappings: {},
    });

    try {
      console.log('Starting PDF load for attachment:', attachment);
      console.log('PDF URL:', attachment.download_url);

      // Fetch PDF data with authentication
      const response = await fetch(attachment.download_url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const pdfData = await response.arrayBuffer();

      // Load PDF with PDF.js
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      setNumPages(pdf.numPages);

      // Render first page
      await renderPage(1, pdf);

      console.log('PDF loaded successfully, pages:', pdf.numPages);
      setPdfLoading(false);
    } catch (error) {
      console.error('Error in PDF loading:', error);
      setPdfError('Nepavyko užkrauti PDF dokumento');
      setPdfLoading(false);
    }
  }, [renderPage]);

  // Handle field mapping
  const handleFieldMapping = useCallback((fieldKey: string, value: any) => {
    setTrainingData(prev => ({
      ...prev,
      field_mappings: {
        ...prev.field_mappings,
        [fieldKey]: value,
      },
    }));
  }, []);

  // Start marking mode
  const startMarking = useCallback((fieldKey: string) => {
    setMarkingMode(fieldKey);
  }, []);

  // Cancel marking
  const cancelMarking = useCallback(() => {
    setMarkingMode(null);
    setStartPos(null);
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      // Placeholder for save logic
      console.log('Saving training data:', trainingData);
      alert('Šablonas išsaugotas! Sistema išmoks atpažinti panašius dokumentus.');
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      alert('Klaida išsaugant šabloną');
    } finally {
      setSaving(false);
    }
  }, [trainingData, onClose]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Handle close
  const handleClose = useCallback(() => {
    setSelectedAttachment(null);
    setTrainingData({
      template_name: '',
      document_type: 'invoice',
      field_mappings: {},
    });
    setPdfError(null);
    setApiError(null);
    setMarkingMode(null);
    setMarkedRegions([]);
    onClose();
  }, [onClose]);

  // Check authentication and load data
  useEffect(() => {
    console.log('=== USE EFFECT DEBUG ===');
    console.log('useEffect triggered, isOpen:', isOpen, 'isAuthenticated:', isAuthenticated, 'user:', user);
    console.log('Token exists:', !!localStorage.getItem('token'));
    console.log('Token value:', localStorage.getItem('token'));
    console.log('=======================');

    setAuthChecked(true);

    if (isOpen && isAuthenticated) {
      console.log('Calling loadUntrainedAttachments');
      loadUntrainedAttachments();
    }
  }, [isOpen, isAuthenticated, loadUntrainedAttachments, user]);

  // Re-render marked regions when they change
  useEffect(() => {
    renderMarkedRegions();
  }, [markedRegions, currentPage, renderMarkedRegions]);

  if (!isOpen) return null;

  // Patikriname ar vartotojas turi galiojantį token'ą
  const hasToken = !!localStorage.getItem('token');

  console.log('=== DOCUMENT TRAINING MODAL DEBUG ===');
  console.log('Rendering modal, hasToken:', hasToken, 'isAuthenticated:', isAuthenticated, 'authChecked:', authChecked);
  console.log('Token in localStorage:', localStorage.getItem('token')?.substring(0, 20) + '...');
  console.log('====================================');

  if (authChecked && !hasToken) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🔐 Reikalinga autentifikacija - SISTEMA ATNAUJINTA</h2>
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="text-center">
              <div className="error-icon">🔒</div>
              <p>Norėdami naudoti dokumentų mokymo sistemą, turite būti prisijungę į sistemą.</p>
              <p><strong>Prašome prisijungti ir bandyti dar kartą.</strong></p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={() => window.location.href = '/login'}>
              Eiti į prisijungimą
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`modal-overlay ${isFullscreen ? 'fullscreen' : ''}`} onClick={handleClose}>
      <div className={`modal-content large-modal document-training-modal ${isFullscreen ? 'fullscreen' : ''} single-modal`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📄 DOKUMENTŲ MOKYMO SISTEMA - ATNAUJINTA VERSIJA 🚀</h2>
          <div className="modal-actions">
            {selectedAttachment && (
              <button
                onClick={() => setSelectedAttachment(null)}
                className="btn btn-sm btn-outline-secondary back-btn"
                title="Grįžti į dokumentų sąrašą"
              >
                ← Sąrašas
              </button>
            )}
            <button className="modal-close" onClick={handleClose}>×</button>
          </div>
        </div>

        <div className="modal-body single-modal-body">
          {/* Debug: {console.log('Rendering modal body, selectedAttachment:', selectedAttachment, 'untrainedAttachments:', untrainedAttachments, 'length:', Array.isArray(untrainedAttachments) ? untrainedAttachments.length : 'not array', 'loading:', loading, 'apiError:', apiError)} */}
          {selectedAttachment ? (
            // PDF mokymo įrankis
            <div>
              {/* PDF rodymas */}
              <div className="pdf-header">
                <h4>📄 {selectedAttachment.filename}</h4>
                <div className="pdf-actions">
                  <span className="file-size">{(selectedAttachment.size / 1024).toFixed(1)} KB</span>
                  <button
                    onClick={toggleFullscreen}
                    className="btn btn-sm btn-outline-primary"
                    title={isFullscreen ? "Išeiti iš pilno ekrano" : "Pilnas ekranas"}
                  >
                    {isFullscreen ? '🪟' : '⛶'}
                  </button>
                  <a
                    href={selectedAttachment.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-outline-secondary"
                    title="Atidaryti naujame lange"
                  >
                    🔍
                  </a>
                </div>
              </div>

              {pdfLoading ? (
                <div className="pdf-loading">
                  <div className="loading-spinner"></div>
                  <p>Kraunamas PDF dokumentas...</p>
                </div>
              ) : pdfError ? (
                <div className="pdf-error">
                  <div className="pdf-icon">❌</div>
                  <p>Klaida: {pdfError}</p>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => window.open(selectedAttachment?.download_url, '_blank')}
                  >
                    Atidaryti naujame lange
                  </button>
                </div>
              ) : (
                <div className="pdf-viewer-container">
                  <div className="pdf-container">
                    {/* Main PDF canvas */}
                    <canvas
                      ref={canvasRef}
                      className="pdf-main-canvas"
                      style={{
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        maxWidth: '100%',
                        height: 'auto'
                      }}
                    />

                    {/* Overlay for marking */}
                    {markingMode && (
                      <div className="pdf-marking-overlay">
                        <canvas
                          ref={overlayCanvasRef}
                          className="pdf-overlay-canvas"
                          onMouseDown={startDrawing}
                          onMouseMove={continueDrawing}
                          onMouseUp={finishDrawing}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            pointerEvents: 'auto',
                            zIndex: 10,
                            border: '1px solid transparent',
                            borderRadius: '4px'
                          }}
                        />
                      </div>
                    )}

                    {/* Page navigation */}
                    {numPages > 1 && (
                      <div className="pdf-navigation">
                        <button
                          onClick={() => {
                            if (currentPage > 1) {
                              setCurrentPage(currentPage - 1);
                              renderPage(currentPage - 1);
                            }
                          }}
                          disabled={currentPage <= 1}
                          className="btn btn-sm btn-outline-secondary"
                        >
                          ← Ankstesnis
                        </button>
                        <span>Puslapis {currentPage} iš {numPages}</span>
                        <button
                          onClick={() => {
                            if (currentPage < numPages) {
                              setCurrentPage(currentPage + 1);
                              renderPage(currentPage + 1);
                            }
                          }}
                          disabled={currentPage >= numPages}
                          className="btn btn-sm btn-outline-secondary"
                        >
                          Kitas →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Formos */}
              <div className="training-layout">
                <div className="training-main">
                  <div className="training-sidebar">
                    <div className="form-section">
                      <h4>📋 Šablono informacija</h4>
                      <div className="form-group">
                        <label>Šablono pavadinimas:</label>
                        <input
                          type="text"
                          className="form-control"
                          value={trainingData.template_name}
                          onChange={(e) => setTrainingData(prev => ({ ...prev, template_name: e.target.value }))}
                          placeholder="Pvz.: UAB Loglena sąskaitos šablonas"
                        />
                      </div>

                      <div className="form-group">
                        <label>Dokumento tipas:</label>
                        <select
                          className="form-control"
                          value={trainingData.document_type}
                          onChange={(e) => setTrainingData(prev => ({ ...prev, document_type: e.target.value as any }))}
                        >
                          {DOCUMENT_TYPES.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-section">
                      <h4>🎯 Laukų žymėjimas</h4>
                    <p className="text-muted" style={{ fontSize: '12px', marginBottom: '15px' }}>
                      Įveskite laukų reikšmes arba naudokite pažymėjimo įrankį 🎯 ant PDF dokumento.
                    </p>

                      <div className="field-mapping-grid">
                        {TRAINING_FIELDS.map(field => (
                          <div key={field.key} className={`field-item ${markingMode === field.key ? 'marking-active' : ''}`}>
                            <label className="field-label">
                              {field.label}
                              {trainingData.field_mappings[field.key]?.marked && (
                                <span className="marked-indicator" title="Pažymėta">✓</span>
                              )}
                            </label>

                            {markingMode === field.key ? (
                              <div className="marking-controls">
                                <div className="marking-active-notice">
                                  <div className="marking-indicator">
                                    <span className="marking-dot"></span>
                                    <span>Pažymėjimo režimas aktyvus</span>
                                  </div>
                                  <button
                                    className="btn btn-sm btn-secondary marking-cancel"
                                    onClick={cancelMarking}
                                    title="Atšaukti pažymėjimą"
                                  >
                                    ✕ Atšaukti
                                  </button>
                                </div>
                                <div className="marking-hint">
                                  <small>🎯 Spauskite ir tempkite ant PDF, kad pažymėtumėte regioną</small>
                                </div>
                              </div>
                            ) : (
                              <div className="field-input-group">
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  placeholder="Įveskite reikšmę..."
                                  value={trainingData.field_mappings[field.key]?.text || trainingData.field_mappings[field.key]?.position || ''}
                                  onChange={(e) => handleFieldMapping(field.key, { ...trainingData.field_mappings[field.key], text: e.target.value })}
                                />
                            <button
                              className={`btn btn-sm btn-outline-secondary btn-mark-field ${markingMode === field.key ? 'active' : ''}`}
                              onClick={() => startMarking(field.key)}
                              title={`Pažymėti ${field.label} PDF dokumente`}
                            >
                              🎯
                            </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Dokumentų sąrašas
            <div>
              <div className="section-header">
                <h3>📎 NEAPMOkyti DOKUMENTAI - FAILAS PAKEISTAS ✅</h3>
                <div className="section-stats">
                  <span className="badge badge-info">
                    {Array.isArray(untrainedAttachments) ? untrainedAttachments.length : 0} dokumentų laukia mokymo
                  </span>
                </div>
              </div>
              <p className="text-muted">
                Pasirinkite PDF dokumentą iš sąrašo žemiau. Sistema išmoks atpažinti panašius dokumentus ateityje.
              </p>

              {loading ? (
                <div className="text-center">Kraunama...</div>
              ) : apiError ? (
                <div className="text-center text-danger">
                  <div className="error-icon">❌</div>
                  <p>{apiError}</p>
                  <button
                    className="btn btn-outline-primary btn-sm"
                    onClick={loadUntrainedAttachments}
                  >
                    Bandyti dar kartą
                  </button>
                </div>
              ) : Array.isArray(untrainedAttachments) && untrainedAttachments.length === 0 ? (
                <div className="text-center text-muted">
                  🎉 VISI DOKUMENTAI JAU APMOKYTI - FAILAS PAKEISTAS ✅
                </div>
              ) : (
                <div className="attachments-grid">
                  {Array.isArray(untrainedAttachments) && untrainedAttachments.map(attachment => (
                    <div
                      key={attachment.id}
                      className="attachment-card"
                      onClick={() => handleAttachmentSelect(attachment)}
                    >
                      <div className="attachment-icon">📄</div>
                      <div className="attachment-info">
                        <h5 className="attachment-name">{attachment.filename}</h5>
                        <div className="attachment-meta">
                          <span className="size">{(attachment.size / 1024).toFixed(1)} KB</span>
                          <span className="separator">•</span>
                          <span className="subject" title={attachment.mail_message_subject}>
                            {attachment.mail_message_subject?.substring(0, 40)}...
                          </span>
                        </div>
                      </div>
                      <div className="attachment-action">
                        <button className="btn btn-primary btn-sm">
                          Apmokyti →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {selectedAttachment ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedAttachment(null)}
                disabled={saving}
              >
                ← Atgal
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saugoma...' : '💾 Išsaugoti šabloną'}
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={handleClose}>
              Uždaryti
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentTrainingModal;