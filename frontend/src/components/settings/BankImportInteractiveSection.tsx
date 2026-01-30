import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';

interface ParsedTransaction {
  rowNumber: number;
  date: string;
  debitCredit: string;
  amount: string;
  partnerName: string | null;
  partnerCode: string | null;
  partnerAccount: string | null;
  description: string;
  invoiceNumber: string | null;
  operationNumber: string;
  paymentType: string;
  currency: string;
  // Matching rezultatai
  matchedInvoiceId?: number | null;
  matchedInvoiceNumber?: string | null;
  matchConfidence?: number; // 0-1
  matchType?: 'sales' | 'purchase' | null;
  // UI state
  isSelected?: boolean;
  isConfirmed?: boolean;
  manuallyEdited?: boolean;
}

interface ParseResult {
  transactions: ParsedTransaction[];
  errors: Array<{ row: number; error: string }>;
  totalRows: number;
  successRows: number;
}

interface Invoice {
  id: number;
  invoice_number: string | null;
  partner_name?: string; // Deprecated - naudoti partner.name
  partner?: {
    id: number;
    name: string;
    code?: string;
  };
  amount_total: string;
  payment_status: string;
  due_date: string;
  issue_date: string;
}

const BankImportInteractiveSection: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  
  // Sąskaitų sąrašai iš sistemos
  const [salesInvoices, setSalesInvoices] = useState<Invoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Filtrai
  const [filterStatus, setFilterStatus] = useState<'all' | 'matched' | 'unmatched' | 'lowConfidence'>('all');

  useEffect(() => {
    // Užkrauti sąskaitas iš sistemos tik vieną kartą
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInvoices = async () => {
    setLoadingInvoices(true);
    try {
      // Užkrauti visas sąskaitas (filtruosime frontend'e)
      const [salesRes, purchaseRes] = await Promise.all([
        api.get('/invoices/sales/', { params: { page_size: 1000 } }),
        api.get('/invoices/purchase/', { params: { page_size: 1000 } })
      ]);
      
      let salesData = salesRes.data.results || salesRes.data || [];
      let purchaseData = purchaseRes.data.results || purchaseRes.data || [];
      
      // Filtruojame frontend'e - tik neapmokėtas/dalinai apmokėtas
      // Bet jei nėra neapmokėtų, rodysime visas (kad galėtų pasirinkti)
      const filteredSales = Array.isArray(salesData) ? salesData.filter((inv: any) => 
        inv.payment_status === 'unpaid' || inv.payment_status === 'partially_paid'
      ) : [];
      
      const filteredPurchase = Array.isArray(purchaseData) ? purchaseData.filter((inv: any) => 
        inv.payment_status === 'unpaid' || inv.payment_status === 'partially_paid'
      ) : [];
      
      // Jei nėra neapmokėtų, rodysime visas (kad galėtų pasirinkti)
      salesData = filteredSales.length > 0 ? filteredSales : (Array.isArray(salesData) ? salesData : []);
      purchaseData = filteredPurchase.length > 0 ? filteredPurchase : (Array.isArray(purchaseData) ? purchaseData : []);
      
      setSalesInvoices(salesData);
      setPurchaseInvoices(purchaseData);
      
      console.log(`✓ Užkrauta ${salesData.length} pardavimo ir ${purchaseData.length} pirkimo sąskaitų`);
      console.log('Pardavimo sąskaitų pavyzdys:', salesData.slice(0, 3));
      console.log('Pirkimo sąskaitų pavyzdys:', purchaseData.slice(0, 3));
    } catch (error: any) {
      console.error('Klaida užkraunant sąskaitas:', error);
      // Net jei klaida, tęsiame - galės naudoti tik CSV duomenis
      setSalesInvoices([]);
      setPurchaseInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setTransactions([]);
    }
  };

  const parsePartnerInfo = (partnerInfo: string): { name: string | null; code: string | null; account: string | null } => {
    if (!partnerInfo) return { name: null, code: null, account: null };

    const parts = partnerInfo.split('|').map(p => p.trim());
    
    let name = parts[0] || null;
    let code: string | null = null;
    let account: string | null = null;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('LT') && part.length >= 20) {
        account = part;
      } else if (part && !part.includes('XXX') && !part.startsWith('LT') && part.length > 5 && part.length < 15) {
        code = part;
      }
    }

    if (name) {
      name = name.replace(/"/g, '').trim();
    }

    return { name, code, account };
  };

  const extractInvoiceNumber = (description: string): string | null => {
    if (!description) return null;

    const patterns = [
      /\b([A-Z]{2,4}\d{4,8})\b/g,
      /[Nn]r\.?\s*([A-Z0-9\-/]+)/g,
      /[Ss][Ff]\.?\s*([A-Z0-9\-/]+)/g,
      /Invoice No[.:]\s*([A-Z0-9\-/]+)/gi,
      /Serija\s+([A-Z0-9]+)\s+[Nn]r\.?\s*(\d+)/gi,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(description);
      if (match) {
        const invoiceNum = match[match.length - 1] || match[1];
        if (invoiceNum && invoiceNum.length >= 3) {
          return invoiceNum.trim();
        }
      }
    }

    return null;
  };

  // Normalizacijos funkcijos
  const normalizeInvoiceNumber = (num: string | null | undefined): string => {
    if (!num) return '';
    // Pašalinti visus tarpus ir normalizuoti case
    return num.replace(/\s+/g, '').toUpperCase().trim();
  };

  const normalizePartnerName = (name: string | null | undefined): string => {
    if (!name) return '';
    // Pašalinti visus tarpus, normalizuoti case, normalizuoti UAB/uab
    let normalized = name.replace(/\s+/g, '').toLowerCase().trim();
    // Normalizuoti UAB/uab/Uab -> uab
    normalized = normalized.replace(/(uab|u\.a\.b\.|uab)/gi, 'uab');
    // Pašalinti specialius simbolius (tik palikti raides ir skaičius)
    normalized = normalized.replace(/[^a-z0-9]/g, '');
    return normalized;
  };

  // Funkcija patikrinti ar du partnerio pavadinimai sutampa (atsižvelgiant į žodžių eilę)
  const partnerNamesMatch = (name1: string, name2: string): boolean => {
    if (!name1 || !name2) return false;
    const norm1 = normalizePartnerName(name1);
    const norm2 = normalizePartnerName(name2);
    
    // Tikslus sutapimas
    if (norm1 === norm2) return true;
    
    // Patikrinti ar vienas yra kito dalis (pvz. "transnordauab" vs "uabtransnorda")
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    
    // Patikrinti ar abu turi tuos pačius simbolius (nepriklausomai nuo eilės)
    // Tai padės atpažinti "transnordauab" vs "uabtransnorda"
    const chars1 = norm1.split('').sort().join('');
    const chars2 = norm2.split('').sort().join('');
    
    // Jei simboliai sutampa (nepriklausomai nuo eilės) ir ilgis panašus
    if (chars1 === chars2 && Math.abs(norm1.length - norm2.length) <= 2) return true;
    
    // Patikrinti ar bent 70% simbolių sutampa
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length > norm2.length ? norm2 : norm1;
    let commonChars = 0;
    for (const char of shorter) {
      if (longer.includes(char)) commonChars++;
    }
    const similarity = commonChars / longer.length;
    if (similarity >= 0.7 && shorter.length >= 5) return true;
    
    return false;
  };

  const matchTransactionToInvoice = (tx: ParsedTransaction): { invoice: Invoice | null; confidence: number; type: 'sales' | 'purchase' | null } => {
    // Jei dar nėra užkrautos sąskaitos, grąžinti tuščią rezultatą
    if (salesInvoices.length === 0 && purchaseInvoices.length === 0) {
      return { invoice: null, confidence: 0, type: null };
    }

    let bestMatch: Invoice | null = null;
    let bestConfidence = 0;
    let matchType: 'sales' | 'purchase' | null = null;

    const txAmount = parseFloat(tx.amount);
    const txNormalizedInvoiceNum = normalizeInvoiceNumber(tx.invoiceNumber);

    // 1. Tikslus sąskaitos numerio sutapimas (be sumos patikrinimo pirmiausia)
    if (txNormalizedInvoiceNum) {
      // Ieškome sales invoices - tikslus numerio sutapimas
      for (const inv of salesInvoices) {
        // Patikrinti ar invoice_number nėra null
        if (!inv.invoice_number) continue;
        
        const invNormalizedNum = normalizeInvoiceNumber(inv.invoice_number);
        
        // Tikslus sutapimas arba numeris yra aprašyme
        if (invNormalizedNum === txNormalizedInvoiceNum || 
            invNormalizedNum.includes(txNormalizedInvoiceNum) || 
            txNormalizedInvoiceNum.includes(invNormalizedNum)) {
          const invAmount = parseFloat(inv.amount_total || '0');
          const amountMatch = Math.abs(invAmount - txAmount) < 0.01;
          
          // Patikrinti partnerio pavadinimą
          const invPartnerName = inv.partner?.name || inv.partner_name || '';
          const partnerMatch = tx.partnerName && invPartnerName && 
            partnerNamesMatch(tx.partnerName, invPartnerName);
          
          // Jei sutampa numeris IR suma IR partneris - aukščiausias confidence
          if (amountMatch && partnerMatch) {
            const confidence = 1.0;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'sales';
            }
          } else if (amountMatch) {
            // Jei sutampa numeris IR suma, bet ne partneris
            const confidence = 0.95;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'sales';
            }
          } else if (partnerMatch) {
            // Jei sutampa numeris IR partneris, bet ne suma
            const confidence = 0.85;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'sales';
            }
          } else {
            // Jei tik numeris sutampa
            const confidence = 0.7;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'sales';
            }
          }
        }
      }

      // Ieškome purchase invoices
      for (const inv of purchaseInvoices) {
        // Patikrinti ar invoice_number nėra null
        if (!inv.invoice_number) continue;
        
        const invNormalizedNum = normalizeInvoiceNumber(inv.invoice_number);
        
        if (invNormalizedNum === txNormalizedInvoiceNum || 
            invNormalizedNum.includes(txNormalizedInvoiceNum) || 
            txNormalizedInvoiceNum.includes(invNormalizedNum)) {
          const invAmount = parseFloat(inv.amount_total || '0');
          const amountMatch = Math.abs(invAmount - txAmount) < 0.01;
          
          // Patikrinti partnerio pavadinimą
          const invPartnerName = inv.partner?.name || inv.partner_name || '';
          const partnerMatch = tx.partnerName && invPartnerName && 
            partnerNamesMatch(tx.partnerName, invPartnerName);
          
          if (amountMatch && partnerMatch) {
            const confidence = 1.0;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'purchase';
            }
          } else if (amountMatch) {
            const confidence = 0.95;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'purchase';
            }
          } else if (partnerMatch) {
            const confidence = 0.85;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'purchase';
            }
          } else {
            const confidence = 0.7;
            if (confidence > bestConfidence) {
              bestMatch = inv;
              bestConfidence = confidence;
              matchType = 'purchase';
            }
          }
        }
      }
    }

    // 2. Pagal sumą ir partnerį (jei nėra numerio sutapimo)
    if (!bestMatch && tx.partnerName) {
      const allInvoices = [
        ...salesInvoices.map(inv => ({ ...inv, type: 'sales' as const })),
        ...purchaseInvoices.map(inv => ({ ...inv, type: 'purchase' as const }))
      ];

      for (const inv of allInvoices) {
        // Patikrinti ar yra reikalingi laukai
        const invPartnerName = inv.partner?.name || inv.partner_name || '';
        if (!invPartnerName || !inv.amount_total) continue;
        
        const partnerMatch = tx.partnerName && partnerNamesMatch(tx.partnerName, invPartnerName);
        
        if (!partnerMatch) continue;
        
        const invAmount = parseFloat(inv.amount_total);
        if (Math.abs(invAmount - txAmount) < 0.01) {
          const confidence = 0.6;
          if (confidence > bestConfidence) {
            bestMatch = inv;
            bestConfidence = confidence;
            matchType = inv.type;
          }
        }
      }
    }

    return { invoice: bestMatch, confidence: bestConfidence, type: matchType };
  };

  const parseSwedbankCSV = async (fileContent: string): Promise<ParseResult> => {
    const lines = fileContent.split('\n').filter(line => line.trim());
    const parsedTransactions: ParsedTransaction[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      try {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current);

        if (values.length < 10) {
          continue;
        }

        const operationType = values[1]?.trim();
        
        if (['10', '82', '86'].includes(operationType)) {
          continue;
        }

        const date = values[2]?.trim() || '';
        const partnerInfo = values[3]?.trim() || '';
        const description = values[4]?.trim() || '';
        const amount = values[5]?.trim() || '';
        const currency = values[6]?.trim() || '';
        const debitCredit = values[7]?.trim() || '';
        const operationNumber = values[8]?.trim() || '';
        const paymentType = values[9]?.trim() || '';

        const partner = parsePartnerInfo(partnerInfo);
        const invoiceNumber = extractInvoiceNumber(description);

        const tx: ParsedTransaction = {
          rowNumber: i + 1,
          date,
          debitCredit,
          amount,
          partnerName: partner.name,
          partnerCode: partner.code,
          partnerAccount: partner.account,
          description,
          invoiceNumber, // Tiesiog rastas numeris iš CSV (kaip BankImportTestSection)
          operationNumber,
          paymentType,
          currency,
          isSelected: false,
          isConfirmed: false,
          manuallyEdited: false,
        };

        parsedTransactions.push(tx);

      } catch (error: any) {
        errors.push({ row: i + 1, error: error.message || 'Nežinoma klaida' });
      }
    }

    return {
      transactions: parsedTransactions,
      errors,
      totalRows: lines.length,
      successRows: parsedTransactions.length,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    // Patikrinti ar užkrautos sąskaitos
    if (salesInvoices.length === 0 && purchaseInvoices.length === 0) {
      alert('⏳ Dar kraunamos sąskaitos iš sistemos. Palaukite...');
      return;
    }

    setLoading(true);

    try {
      let fileContent: string | null = null;
      const encodings = ['windows-1257', 'utf-8', 'iso-8859-13'];
      
      for (const encoding of encodings) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const decoder = new TextDecoder(encoding);
          fileContent = decoder.decode(arrayBuffer);
          
          if (fileContent && !fileContent.includes('�')) {
            console.log(`Sėkmingai nuskaityta su ${encoding} encoding`);
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      if (!fileContent) {
        throw new Error('Nepavyko nuskaityti failo su jokiu palaikomu encoding\'u');
      }
      
      const parseResult = await parseSwedbankCSV(fileContent);
      
      // PO parsing'o - bandome automatiškai susieti su sąskaitomis (jei yra užkrautos)
      // Bet net jei neranda - vis tiek rodysime rastus numerius iš CSV
      const transactionsWithMatching = parseResult.transactions.map(tx => {
        // Visada paliekame rastą numerį iš CSV (kaip BankImportTestSection)
        // Bandome automatiškai susieti tik jei yra užkrautos sąskaitos
        if (salesInvoices.length > 0 || purchaseInvoices.length > 0) {
          const match = matchTransactionToInvoice(tx);
          if (match.invoice) {
            return {
              ...tx,
              matchedInvoiceId: match.invoice.id,
              matchedInvoiceNumber: match.invoice.invoice_number,
              matchConfidence: match.confidence,
              matchType: match.type,
            };
          }
        }
        // Net jei nerasta - vis tiek turime rastą numerį iš CSV
        return tx;
      });
      
      setResult(parseResult);
      setTransactions(transactionsWithMatching);
    } catch (error: any) {
      alert('Klaida nuskaitant failą: ' + (error.message || 'Nežinoma klaida'));
    } finally {
      setLoading(false);
    }
  };

  const getDebitCreditLabel = (dc: string) => {
    if (dc === 'K') return '📥 Įplaukimas';
    if (dc === 'D') return '📤 Išėjimas';
    return dc;
  };

  const getDebitCreditColor = (dc: string) => {
    if (dc === 'K') return '#28a745';
    if (dc === 'D') return '#dc3545';
    return '#6c757d';
  };

  const getConfidenceLabel = (confidence?: number) => {
    if (!confidence) return '❌ Neatpažinta';
    if (confidence >= 0.95) return '✅ Tiksliai';
    if (confidence >= 0.8) return '✓ Gerai';
    if (confidence >= 0.6) return '⚠️ Abejotina';
    return '❓ Neaiški';
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return '#dc3545';
    if (confidence >= 0.95) return '#28a745';
    if (confidence >= 0.8) return '#5cb85c';
    if (confidence >= 0.6) return '#ff9800';
    return '#f39c12';
  };

  const toggleSelectTransaction = (index: number) => {
    setTransactions(prev => prev.map((tx, i) => 
      i === index ? { ...tx, isSelected: !tx.isSelected } : tx
    ));
  };

  const toggleSelectAll = () => {
    const allSelected = filteredTransactions.every(tx => tx.isSelected);
    setTransactions(prev => prev.map(tx => ({
      ...tx,
      isSelected: !allSelected
    })));
  };

  const handleInvoiceChange = (index: number, invoiceId: string, type: 'sales' | 'purchase') => {
    const invoiceIdNum = parseInt(invoiceId);
    const invoices = type === 'sales' ? salesInvoices : purchaseInvoices;
    const invoice = invoices.find(inv => inv.id === invoiceIdNum);

    setTransactions(prev => prev.map((tx, i) => 
      i === index ? {
        ...tx,
        matchedInvoiceId: invoice?.id || null,
        matchedInvoiceNumber: (invoice?.invoice_number || null),
        matchType: type,
        matchConfidence: invoice ? 1.0 : 0,
        manuallyEdited: true,
      } : tx
    ));
  };

  const confirmSelected = () => {
    const selectedCount = transactions.filter(tx => tx.isSelected && tx.matchedInvoiceId).length;
    if (selectedCount === 0) {
      alert('Nepasirinkta nė vienos transakcijos su sąskaita!');
      return;
    }

    if (window.confirm(`Patvirtinti ${selectedCount} pažymėtų transakcijų?`)) {
      setTransactions(prev => prev.map(tx => 
        tx.isSelected && tx.matchedInvoiceId ? { ...tx, isConfirmed: true } : tx
      ));
      alert(`✓ Patvirtinta ${selectedCount} transakcijų!`);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'matched') return tx.matchedInvoiceId !== null && tx.matchedInvoiceId !== undefined;
      if (filterStatus === 'unmatched') return !tx.matchedInvoiceId;
      if (filterStatus === 'lowConfidence') return tx.matchConfidence && tx.matchConfidence < 0.8;
      return true;
    });
  }, [transactions, filterStatus]);

  const stats = {
    total: transactions.length,
    matched: transactions.filter(tx => tx.matchedInvoiceId).length,
    unmatched: transactions.filter(tx => !tx.matchedInvoiceId).length,
    lowConfidence: transactions.filter(tx => tx.matchConfidence && tx.matchConfidence < 0.8).length,
    confirmed: transactions.filter(tx => tx.isConfirmed).length,
  };

  return (
    <div className="settings-section" style={{ pointerEvents: 'auto' }}>
      <style>{`
        .bank-import-section .card:hover {
          transform: none !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
        }
        .bank-import-section .table tr:hover {
          background-color: transparent !important;
        }
        .bank-import-section .table tbody tr:hover {
          background-color: transparent !important;
        }
        .bank-import-section select {
          position: relative !important;
          z-index: 1000 !important;
        }
        .bank-import-section select:focus {
          z-index: 1001 !important;
          position: relative !important;
        }
        .bank-import-section td {
          overflow: visible !important;
        }
      `}</style>
      <div className="bank-import-section">
      <div style={{ backgroundColor: '#d1ecf1', border: '1px solid #bee5eb', borderRadius: '6px', padding: '12px', marginBottom: '20px' }}>
        <strong>📋 Interaktyvus režimas</strong> - Peržiūrėkite, patvirtinkite arba koreguokite automatiškai atpažintas sąskaitas. Sistema dar nesaugo duomenų.
      </div>

      <h2>🏦 Banko Išrašo Importas (Interaktyvus)</h2>
      <p style={{ marginBottom: '20px', color: '#666' }}>
        Įkelkite CSV, peržiūrėkite rezultatus ir patvirtinkite teisingai atpažintas eilutes.
      </p>
      
      <div className="card">
        {loadingInvoices && (
          <div style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' }}>
            ⏳ Kraunamos sąskaitos iš sistemos... ({salesInvoices.length + purchaseInvoices.length} užkrauta)
          </div>
        )}
        {!loadingInvoices && (salesInvoices.length > 0 || purchaseInvoices.length > 0) && (
          <div style={{ backgroundColor: '#d4edda', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' }}>
            ✓ Užkrauta <strong>{salesInvoices.length}</strong> pardavimo ir <strong>{purchaseInvoices.length}</strong> pirkimo sąskaitų
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="bank-file">📄 Pasirinkite CSV failą</label>
            <input
              type="file"
              id="bank-file"
              accept=".csv"
              onChange={handleFileChange}
              required
              style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            {file && (
              <div style={{ marginTop: '10px', fontSize: '14px', color: '#28a745' }}>
                ✓ Pasirinktas: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
              </div>
            )}
          </div>
          <button type="submit" className="button" disabled={loading || !file || loadingInvoices}>
            {loading ? '⏳ Nuskaitoma...' : loadingInvoices ? '⏳ Kraunamos sąskaitos...' : '🔍 Nuskaityti ir atpažinti'}
          </button>
        </form>
      </div>

      {result && (
        <>
          {/* Statistika */}
          <div className="card" style={{ backgroundColor: '#e7f3ff', borderLeft: '4px solid #2196F3', marginTop: '20px' }}>
            <h3>📊 Statistika</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Iš viso</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2196F3' }}>{stats.total}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Atpažinta</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>{stats.matched}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Neatpažinta</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc3545' }}>{stats.unmatched}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Abejotinos</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff9800' }}>{stats.lowConfidence}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Patvirtinta</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#5cb85c' }}>{stats.confirmed}</div>
              </div>
            </div>
          </div>

          {/* Filtrai ir Veiksmai */}
          <div className="card" style={{ marginTop: '20px', padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setFilterStatus('all')}
                  style={{
                    padding: '8px 16px',
                    border: filterStatus === 'all' ? '2px solid #2196F3' : '1px solid #ddd',
                    backgroundColor: filterStatus === 'all' ? '#e7f3ff' : 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: filterStatus === 'all' ? 'bold' : 'normal',
                  }}
                >
                  Visos ({stats.total})
                </button>
                <button
                  onClick={() => setFilterStatus('matched')}
                  style={{
                    padding: '8px 16px',
                    border: filterStatus === 'matched' ? '2px solid #28a745' : '1px solid #ddd',
                    backgroundColor: filterStatus === 'matched' ? '#d4edda' : 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: filterStatus === 'matched' ? 'bold' : 'normal',
                  }}
                >
                  Atpažintos ({stats.matched})
                </button>
                <button
                  onClick={() => setFilterStatus('unmatched')}
                  style={{
                    padding: '8px 16px',
                    border: filterStatus === 'unmatched' ? '2px solid #dc3545' : '1px solid #ddd',
                    backgroundColor: filterStatus === 'unmatched' ? '#f8d7da' : 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: filterStatus === 'unmatched' ? 'bold' : 'normal',
                  }}
                >
                  Neatpažintos ({stats.unmatched})
                </button>
                <button
                  onClick={() => setFilterStatus('lowConfidence')}
                  style={{
                    padding: '8px 16px',
                    border: filterStatus === 'lowConfidence' ? '2px solid #ff9800' : '1px solid #ddd',
                    backgroundColor: filterStatus === 'lowConfidence' ? '#fff3e0' : 'white',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: filterStatus === 'lowConfidence' ? 'bold' : 'normal',
                  }}
                >
                  Abejotinos ({stats.lowConfidence})
                </button>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={toggleSelectAll}
                  className="button"
                  style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: '#6c757d' }}
                >
                  {filteredTransactions.every(tx => tx.isSelected) ? '☐ Atžymėti visas' : '☑ Pažymėti visas'}
                </button>
                <button
                  onClick={confirmSelected}
                  className="button"
                  style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: '#28a745' }}
                  disabled={transactions.filter(tx => tx.isSelected).length === 0}
                >
                  ✓ Patvirtinti pažymėtas ({transactions.filter(tx => tx.isSelected).length})
                </button>
              </div>
            </div>
          </div>

          {/* Transakcijų lentelė */}
          <div className="card" style={{ marginTop: '20px' }}>
            <h3 style={{ marginBottom: '10px', fontSize: '16px' }}>💳 Transakcijos ({filteredTransactions.length})</h3>
            <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', position: 'relative' }}>
              <table className="table" style={{ fontSize: '12px', borderCollapse: 'collapse', position: 'relative' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 5 }}>
                  <tr>
                    <th style={{ width: '30px', padding: '6px 4px' }}>
                      <input
                        type="checkbox"
                        onChange={toggleSelectAll}
                        checked={filteredTransactions.length > 0 && filteredTransactions.every(tx => tx.isSelected)}
                        style={{ margin: 0 }}
                      />
                    </th>
                    <th style={{ width: '30px', padding: '6px 4px' }}>#</th>
                    <th style={{ width: '90px', padding: '6px 4px' }}>Data</th>
                    <th style={{ width: '90px', padding: '6px 4px' }}>Tipas</th>
                    <th style={{ width: '90px', padding: '6px 4px' }}>Suma</th>
                    <th style={{ minWidth: '150px', padding: '6px 4px' }}>Partneris</th>
                    <th style={{ minWidth: '200px', padding: '6px 4px' }}>Aprašymas</th>
                    <th style={{ width: '100px', padding: '6px 4px' }}>Atpažinta</th>
                    <th style={{ minWidth: '200px', padding: '6px 4px' }}>Sąskaita</th>
                    <th style={{ width: '60px', padding: '6px 4px' }}>Statusas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx, idx) => {
                    const actualIndex = transactions.indexOf(tx);
                    return (
                      <tr
                        key={actualIndex}
                        style={{
                          backgroundColor: tx.isConfirmed ? '#d4edda' : tx.isSelected ? '#fff3cd' : tx.matchConfidence && tx.matchConfidence < 0.8 ? '#fff3e0' : 'transparent',
                          lineHeight: '1.3',
                        }}
                      >
                        <td style={{ padding: '4px' }}>
                          <input
                            type="checkbox"
                            checked={tx.isSelected || false}
                            onChange={() => toggleSelectTransaction(actualIndex)}
                            style={{ margin: 0 }}
                          />
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ padding: '4px' }}>{tx.date}</td>
                        <td style={{ padding: '4px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              color: 'white',
                              backgroundColor: getDebitCreditColor(tx.debitCredit),
                              display: 'inline-block',
                            }}
                          >
                            {getDebitCreditLabel(tx.debitCredit)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '4px' }}>
                          {tx.amount} €
                        </td>
                        <td style={{ padding: '4px', fontSize: '11px' }}>{tx.partnerName || <span style={{ color: '#999' }}>—</span>}</td>
                        <td style={{ fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px' }}>
                          {tx.description}
                        </td>
                        <td style={{ padding: '4px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              color: 'white',
                              backgroundColor: getConfidenceColor(tx.matchConfidence),
                              display: 'inline-block',
                            }}
                          >
                            {getConfidenceLabel(tx.matchConfidence)}
                          </span>
                        </td>
                        <td style={{ padding: '4px', position: 'relative', zIndex: 1 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', position: 'relative' }}>
                            {/* Rastas numeris iš CSV (kaip BankImportTestSection) */}
                            {tx.invoiceNumber && (
                              <div style={{ marginBottom: '2px' }}>
                                <strong
                                  style={{
                                    color: '#ff9800',
                                    backgroundColor: '#fff3e0',
                                    padding: '2px 6px',
                                    borderRadius: '3px',
                                    fontSize: '11px',
                                    display: 'inline-block',
                                  }}
                                >
                                  📄 {tx.invoiceNumber}
                                </strong>
                                {tx.matchedInvoiceId && tx.matchedInvoiceNumber && (
                                  <span
                                    style={{
                                      marginLeft: '3px',
                                      padding: '1px 4px',
                                      borderRadius: '2px',
                                      fontSize: '9px',
                                      backgroundColor: getConfidenceColor(tx.matchConfidence),
                                      color: 'white',
                                    }}
                                  >
                                    → {tx.matchedInvoiceNumber}
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Dropdown su tikromis sąskaitomis */}
                            <select
                              value={tx.matchedInvoiceId && tx.matchType ? `${tx.matchType}:${tx.matchedInvoiceId}` : ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                console.log('Dropdown changed:', value, 'for transaction:', actualIndex);
                                
                                if (!value || value === '') {
                                  // Pašalinti susiejimą
                                  setTransactions(prev => prev.map((t, i) => 
                                    i === actualIndex ? {
                                      ...t,
                                      matchedInvoiceId: null,
                                      matchedInvoiceNumber: null,
                                      matchType: null,
                                      matchConfidence: 0,
                                      manuallyEdited: false,
                                    } : t
                                  ));
                                  return;
                                }
                                
                                const [type, id] = value.split(':');
                                console.log('Parsed type:', type, 'id:', id);
                                
                                if (id && (type === 'sales' || type === 'purchase')) {
                                  handleInvoiceChange(actualIndex, id, type as 'sales' | 'purchase');
                                } else {
                                  console.warn('Invalid type or id:', { type, id, value });
                                }
                              }}
                              style={{ 
                                fontSize: '10px', 
                                padding: '3px', 
                                width: '100%',
                                minHeight: '24px',
                                zIndex: 1000,
                                position: 'relative',
                                backgroundColor: 'white',
                              }}
                              disabled={loadingInvoices}
                              onFocus={(e) => {
                                // Užtikrinti kad dropdown būtų matomas
                                e.target.style.zIndex = '1001';
                              }}
                              onBlur={(e) => {
                                e.target.style.zIndex = '1000';
                              }}
                            >
                              <option value="">-- Pasirinkite sąskaitą --</option>
                              {loadingInvoices ? (
                                <option disabled>Kraunamos sąskaitos...</option>
                              ) : (
                                <>
                                  {salesInvoices.length > 0 && (
                                    <optgroup label={`Pardavimo sąskaitos (${salesInvoices.length})`}>
                                      {salesInvoices.map(inv => {
                                        const invNum = inv.invoice_number || `#${inv.id}`;
                                        const partnerName = (inv.partner?.name || inv.partner_name || 'Nėra partnerio');
                                        const amount = inv.amount_total || '0';
                                        return (
                                          <option key={`sales:${inv.id}`} value={`sales:${inv.id}`}>
                                            {invNum} - {partnerName} ({amount} €)
                                          </option>
                                        );
                                      })}
                                    </optgroup>
                                  )}
                                  {purchaseInvoices.length > 0 && (
                                    <optgroup label={`Pirkimo sąskaitos (${purchaseInvoices.length})`}>
                                      {purchaseInvoices.map(inv => {
                                        const invNum = inv.invoice_number || `#${inv.id}`;
                                        const partnerName = (inv.partner?.name || inv.partner_name || 'Nėra partnerio');
                                        const amount = inv.amount_total || '0';
                                        return (
                                          <option key={`purchase:${inv.id}`} value={`purchase:${inv.id}`}>
                                            {invNum} - {partnerName} ({amount} €)
                                          </option>
                                        );
                                      })}
                                    </optgroup>
                                  )}
                                  {salesInvoices.length === 0 && purchaseInvoices.length === 0 && !loadingInvoices && (
                                    <option disabled>Nėra sąskaitų sistemoje</option>
                                  )}
                                </>
                              )}
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          {tx.isConfirmed && <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '14px' }}>✓</span>}
                          {tx.manuallyEdited && <span style={{ color: '#ff9800', fontSize: '12px' }}>✎</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
};

export default BankImportInteractiveSection;
