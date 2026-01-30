import React, { useState } from 'react';

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
}

interface ParseResult {
  transactions: ParsedTransaction[];
  errors: Array<{ row: number; error: string }>;
  totalRows: number;
  successRows: number;
}

const BankImportTestSection: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
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

  const parseSwedbankCSV = async (fileContent: string): Promise<ParseResult> => {
    const lines = fileContent.split('\n').filter(line => line.trim());
    const transactions: ParsedTransaction[] = [];
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

        transactions.push({
          rowNumber: i + 1,
          date,
          debitCredit,
          amount,
          partnerName: partner.name,
          partnerCode: partner.code,
          partnerAccount: partner.account,
          description,
          invoiceNumber,
          operationNumber,
          paymentType,
          currency,
        });

      } catch (error: any) {
        errors.push({ row: i + 1, error: error.message || 'Nežinoma klaida' });
      }
    }

    return {
      transactions,
      errors,
      totalRows: lines.length,
      successRows: transactions.length,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    try {
      // Bandome nuskaityti su įvairiais encoding'ais
      let fileContent: string | null = null;
      const encodings = ['windows-1257', 'utf-8', 'iso-8859-13'];
      
      for (const encoding of encodings) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const decoder = new TextDecoder(encoding);
          fileContent = decoder.decode(arrayBuffer);
          
          // Patikriname ar yra lietuviškų simbolių
          // Jei dekodavimas sėkmingas ir matome lietuviškas raides, tai teisingas encoding
          if (fileContent && !fileContent.includes('�')) {
            console.log(`Sėkmingai nuskaityta su ${encoding} encoding`);
            break;
          }
        } catch (err) {
          console.log(`Nepavyko su ${encoding}, bandome kitą...`);
          continue;
        }
      }
      
      if (!fileContent) {
        throw new Error('Nepavyko nuskaityti failo su jokiu palaikomu encoding\'u');
      }
      
      const parseResult = await parseSwedbankCSV(fileContent);
      setResult(parseResult);
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

  return (
    <div className="settings-section">
      <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '12px', marginBottom: '20px' }}>
        <strong>⚠️ Mokymosi režimas</strong> - Sistema testuoja CSV failo nuskaitymą ir duomenų atpažinimą. Su sistema dar nesujungta.
      </div>

      <h2>🏦 Banko Išrašo Importas (Testavimas)</h2>
      <p style={{ marginBottom: '20px', color: '#666' }}>
        Įkelkite Swedbank CSV banko išrašą, kad išmokytume teisingai nuskaityti ir atpažinti duomenis.
      </p>
      
      <div className="card">
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
          <button type="submit" className="button" disabled={loading || !file}>
            {loading ? '⏳ Nuskaitoma...' : '🔍 Nuskaityti ir analizuoti'}
          </button>
        </form>
      </div>

      {result && (
        <>
          {/* Statistika */}
          <div className="card" style={{ backgroundColor: '#e7f3ff', borderLeft: '4px solid #2196F3', marginTop: '20px' }}>
            <h3>📊 Nuskaitymo statistika</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Iš viso eilučių</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2196F3' }}>{result.totalRows}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Nuskaitytos</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#28a745' }}>{result.successRows}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Klaidos</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc3545' }}>{result.errors.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>Rasta sąsk. Nr.</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff9800' }}>
                  {result.transactions.filter(t => t.invoiceNumber).length}
                </div>
              </div>
            </div>
          </div>

          {/* Transakcijų lentelė */}
          <div className="card" style={{ marginTop: '20px' }}>
            <h3>💳 Nuskaitytos transakcijos ({result.transactions.length})</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th style={{ width: '100px' }}>Data</th>
                    <th style={{ width: '100px' }}>Tipas</th>
                    <th style={{ width: '100px' }}>Suma</th>
                    <th style={{ minWidth: '200px' }}>Partneris</th>
                    <th style={{ width: '120px' }}>Įm. kodas</th>
                    <th style={{ width: '120px' }}>Sąsk. Nr. ✨</th>
                    <th style={{ minWidth: '250px' }}>Aprašymas</th>
                  </tr>
                </thead>
                <tbody>
                  {result.transactions.map((tx, idx) => (
                    <tr
                      key={idx}
                      style={{
                        backgroundColor: tx.invoiceNumber ? '#e8f5e9' : 'transparent',
                      }}
                    >
                      <td>{idx + 1}</td>
                      <td>{tx.date}</td>
                      <td>
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: 'white',
                            backgroundColor: getDebitCreditColor(tx.debitCredit),
                          }}
                        >
                          {getDebitCreditLabel(tx.debitCredit)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        {tx.amount} {tx.currency}
                      </td>
                      <td>{tx.partnerName || <span style={{ color: '#999' }}>—</span>}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {tx.partnerCode || <span style={{ color: '#999' }}>—</span>}
                      </td>
                      <td>
                        {tx.invoiceNumber ? (
                          <strong
                            style={{
                              color: '#ff9800',
                              backgroundColor: '#fff3e0',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                            }}
                          >
                            📄 {tx.invoiceNumber}
                          </strong>
                        ) : (
                          <span style={{ color: '#999' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rasti sąskaitų numeriai */}
          {result.transactions.filter(t => t.invoiceNumber).length > 0 && (
            <div className="card" style={{ backgroundColor: '#fff3e0', borderLeft: '4px solid #ff9800', marginTop: '20px' }}>
              <h3>🔍 Rasti sąskaitų numeriai ({Array.from(new Set(result.transactions.filter(t => t.invoiceNumber).map(t => t.invoiceNumber))).length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {Array.from(new Set(result.transactions.filter(t => t.invoiceNumber).map(t => t.invoiceNumber))).map(
                  (invNum, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#fff',
                        border: '2px solid #ff9800',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                      }}
                    >
                      {invNum}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BankImportTestSection;

