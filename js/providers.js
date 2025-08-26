const providers = {
  gemini: {
    name: 'Google Gemini',
    apiKeyName: 'GEMINI_API_KEY',
    generateContent: async function(prompt) {
      const apiKey = window[this.apiKeyName] || "";
      if (!apiKey) {
        throw new Error("API key for Gemini is missing.");
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("The model returned an empty response.");
      }

      return text;
    }
  }
  // Future providers like 'openai' can be added here.
};
