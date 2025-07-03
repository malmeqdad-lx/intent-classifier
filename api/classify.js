// api/classify.js
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { prompt } = req.body; // Only need prompt now
      
      // Use server-side environment variable
      const apiKey = process.env.CLAUDE_API_KEY; // Note: no REACT_APP_ prefix
      
      console.log('Server API key check:', {
        hasKey: !!apiKey,
        keyLength: apiKey?.length || 0
      });
      
      if (!apiKey) {
        console.log('Server API key not configured');
        return res.status(500).json({ error: 'Server API key not configured' });
      }
  
      if (!prompt) {
        console.log('Missing prompt');
        return res.status(400).json({ error: 'Prompt is required' });
      }
  
      console.log('Making Claude API call with server key...');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });
  
      console.log('Claude API response status:', response.status);
  
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Claude API error:', errorText);
        return res.status(response.status).json({ 
          error: `Claude API Error: ${response.status} - ${errorText}` 
        });
      }
  
      const data = await response.json();
      console.log('Claude API success');
      res.status(200).json(data);
  
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({ 
        error: error?.message || 'Internal server error'
      });
    }
  }