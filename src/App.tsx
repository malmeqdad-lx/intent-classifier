import React, { useState, useCallback } from 'react';
import { Upload, Settings, Play, Download, Loader2, FileText, Brain, Key } from 'lucide-react';

// TypeScript declarations
declare global {
  interface Window {
    claude?: {
      complete: (prompt: string) => Promise<string>;
    };
  }
}

interface ClassificationResult {
  utterance: string;
  intent: string;
  confidence: number;
  reasoning?: string;
}

interface AppConfig {
  apiKey: string;
  context: string;
  systemPrompt: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert intent classifier. Analyze the following utterance in the context of {CONTEXT} and classify it into the most appropriate intent category.

If no existing category fits well, suggest a new intent category that best describes the user's intention.

Context: {CONTEXT}

Return your response as a valid JSON object in this exact format:
{
  "intent": "category_name",
  "confidence": 0.95,
  "reasoning": "brief explanation of classification"
}

IMPORTANT: Return ONLY the JSON object, no additional text.`;

export default function IntentClassifierApp() {
  const [config, setConfig] = useState<AppConfig>({
    apiKey: '',
    context: 'general conversation',
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });
  
  const [singleUtterance, setSingleUtterance] = useState('');
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [uploadedData, setUploadedData] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const classifyWithClaude = async (utterance: string): Promise<ClassificationResult> => {
    const prompt = config.systemPrompt
      .replace(/{CONTEXT}/g, config.context);

    const fullPrompt = `${prompt}\n\nUtterance to classify: "${utterance}"`;

    try {
      let response: string;

      // Try Claude artifact API first (if available)
      if (window.claude && window.claude.complete) {
        response = await window.claude.complete(fullPrompt);
      } else {
        // Fallback to direct API call
        if (!config.apiKey) {
          throw new Error('Claude API key not configured. Please add your API key in the configuration panel.');
        }

        console.log('Making API call with key:', config.apiKey ? 'Key present' : 'No key');
        
        // Use Vercel API route instead of direct API call
        const apiResponse = await fetch('/api/classify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: fullPrompt,
            apiKey: config.apiKey
          })
        });

        console.log('API Response status:', apiResponse.status);
        
        if (!apiResponse.ok) {
          const errorData = await apiResponse.text();
          console.log('API Error details:', errorData);
          throw new Error(`API Error: ${apiResponse.status} - ${errorData}`);
        }

        const data = await apiResponse.json();
        response = data.content[0].text;
      }
      
      let parsedResponse;
      try {
        // Try to parse as JSON
        parsedResponse = JSON.parse(response.trim());
      } catch {
        // If JSON parsing fails, extract from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid response format');
        }
      }

      return {
        utterance,
        intent: parsedResponse.intent || 'unknown',
        confidence: parsedResponse.confidence || 0,
        reasoning: parsedResponse.reasoning || ''
      };
    } catch (error) {
      console.error('Classification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        utterance,
        intent: 'error',
        confidence: 0,
        reasoning: `Error: ${errorMessage}`
      };
    }
  };

  const handleSingleClassification = async () => {
    if (!singleUtterance.trim()) return;
    
    setLoading(true);
    try {
      const result = await classifyWithClaude(singleUtterance);
      setResults([result, ...results]);
      setSingleUtterance('');
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  const handleBatchClassification = async () => {
    if (uploadedData.length === 0) return;
    
    setLoading(true);
    setBatchProgress({ current: 0, total: uploadedData.length });
    
    const batchResults: ClassificationResult[] = [];
    
    for (let i = 0; i < uploadedData.length; i++) {
      const utterance = uploadedData[i];
      setBatchProgress({ current: i + 1, total: uploadedData.length });
      
      try {
        const result = await classifyWithClaude(utterance);
        batchResults.push(result);
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        batchResults.push({
          utterance,
          intent: 'error',
          confidence: 0,
          reasoning: `Error: ${errorMessage}`
        });
      }
    }
    
    setResults([...batchResults, ...results]);
    setUploadedData([]);
    setBatchProgress({ current: 0, total: 0 });
    setLoading(false);
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      
      if (file.name.endsWith('.csv')) {
        // Simple CSV parsing - assumes one column or first column contains utterances
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        // Skip header if it looks like a header
        const data = lines[0]?.toLowerCase().includes('utterance') || lines[0]?.toLowerCase().includes('text') 
          ? lines.slice(1) 
          : lines;
        setUploadedData(data);
      } else {
        // For now, treat as plain text with one utterance per line
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        setUploadedData(lines);
      }
    };
    reader.readAsText(file);
  }, []);

  const exportResults = () => {
    const csvContent = [
      'Utterance,Intent,Confidence,Reasoning',
      ...results.map(r => `"${r.utterance}","${r.intent}",${r.confidence},"${r.reasoning || ''}"`)
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'intent-classification-results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const resetSystemPrompt = () => {
    setConfig(prev => ({ ...prev, systemPrompt: DEFAULT_SYSTEM_PROMPT }));
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="container">
      <div>
        {/* Header */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Brain style={{ height: '32px', width: '32px', color: '#4f46e5' }} />
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>Intent Classifier</h1>
              <span style={{ fontSize: '12px', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>Powered by Claude</span>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="button"
            >
              <Settings style={{ height: '16px', width: '16px' }} />
              Configure
            </button>
          </div>
        </div>

        {/* Configuration Panel */}
        {showConfig && (
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Configuration</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  <Key style={{ height: '16px', width: '16px', display: 'inline', marginRight: '4px' }} />
                  Claude API Key
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-ant-api03-..."
                  className="input"
                />
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Get your API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5' }}>console.anthropic.com</a>
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Context Domain
                </label>
                <input
                  type="text"
                  value={config.context}
                  onChange={(e) => setConfig(prev => ({ ...prev, context: e.target.value }))}
                  placeholder="e.g., retirement and finances, customer support, etc."
                  className="input"
                />
              </div>
              
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                    System Prompt Template
                  </label>
                  <button
                    onClick={resetSystemPrompt}
                    style={{ fontSize: '14px', color: '#4f46e5', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Reset to Default
                  </button>
                </div>
                <textarea
                  value={config.systemPrompt}
                  onChange={(e) => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  rows={8}
                  className="textarea"
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Use {'{CONTEXT}'} as a placeholder for the context domain
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-2">
          {/* Single Classification */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Single Utterance</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <textarea
                value={singleUtterance}
                onChange={(e) => setSingleUtterance(e.target.value)}
                placeholder="Enter an utterance to classify..."
                rows={3}
                className="textarea"
              />
              
              <button
                onClick={handleSingleClassification}
                disabled={loading || !singleUtterance.trim()}
                className="button"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? <Loader2 style={{ height: '16px', width: '16px' }} className="spin" /> : <Play style={{ height: '16px', width: '16px' }} />}
                Classify
              </button>
            </div>
          </div>

          {/* Batch Upload */}
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Batch Processing</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ border: '2px dashed #d1d5db', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                <Upload style={{ height: '32px', width: '32px', color: '#9ca3af', margin: '0 auto 8px' }} />
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  style={{ cursor: 'pointer', color: '#4f46e5', fontSize: '14px' }}
                >
                  Upload CSV or TXT file
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  One utterance per line
                </p>
              </div>
              
              {uploadedData.length > 0 && (
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
                  <p style={{ fontSize: '14px', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FileText style={{ height: '16px', width: '16px' }} />
                    {uploadedData.length} utterances loaded
                  </p>
                  <div style={{ marginTop: '8px', maxHeight: '128px', overflowY: 'auto', fontSize: '12px', color: '#6b7280' }}>
                    {uploadedData.slice(0, 5).map((item, idx) => (
                      <div key={idx} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>• {item}</div>
                    ))}
                    {uploadedData.length > 5 && (
                      <div style={{ color: '#9ca3af' }}>... and {uploadedData.length - 5} more</div>
                    )}
                  </div>
                </div>
              )}
              
              {batchProgress.total > 0 && (
                <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#1e40af', marginBottom: '8px' }}>
                    <span>Progress</span>
                    <span>{batchProgress.current}/{batchProgress.total}</span>
                  </div>
                  <div style={{ width: '100%', background: '#bfdbfe', borderRadius: '9999px', height: '8px' }}>
                    <div
                      style={{ 
                        background: '#2563eb', 
                        height: '8px', 
                        borderRadius: '9999px', 
                        transition: 'width 0.3s',
                        width: `${(batchProgress.current / batchProgress.total) * 100}%`
                      }}
                    />
                  </div>
                </div>
              )}
              
              <button
                onClick={handleBatchClassification}
                disabled={loading || uploadedData.length === 0}
                className="button"
                style={{ width: '100%', justifyContent: 'center', background: '#059669' }}
              >
                {loading ? <Loader2 style={{ height: '16px', width: '16px' }} className="spin" /> : <Play style={{ height: '16px', width: '16px' }} />}
                Process Batch
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                Classification Results ({results.length})
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={clearResults}
                  className="button"
                  style={{ background: '#6b7280' }}
                >
                  Clear
                </button>
                <button
                  onClick={exportResults}
                  className="button"
                  style={{ background: '#059669' }}
                >
                  <Download style={{ height: '16px', width: '16px' }} />
                  Export CSV
                </button>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Utterance</th>
                    <th>Intent</th>
                    <th>Confidence</th>
                    <th>Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx}>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={result.utterance}>
                        {result.utterance}
                      </td>
                      <td>
                        <span className={`badge ${result.intent === 'error' ? 'badge-red' : 'badge-blue'}`}>
                          {result.intent}
                        </span>
                      </td>
                      <td>
                        <span style={{ 
                          fontWeight: '500',
                          color: result.confidence >= 0.8 ? '#059669' :
                                 result.confidence >= 0.6 ? '#d97706' : '#dc2626'
                        }}>
                          {(result.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280' }} title={result.reasoning}>
                        {result.reasoning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}