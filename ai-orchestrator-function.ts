import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// API Keys - Set these in your Supabase Edge Functions environment
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY'); // For Orion (LLaMA-3.1 70B)
const MISTRAL_API_KEY = Deno.env.get('MISTRAL_API_KEY'); // For Titan (Mixtral 8x7B)
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY'); // For Athena (Claude Haiku)
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY'); // For Vox (TTS)
const AZURE_SPEECH_KEY = Deno.env.get('AZURE_SPEECH_KEY'); // For Aether (Azure TTS)
const AZURE_SPEECH_REGION = Deno.env.get('AZURE_SPEECH_REGION'); // For Aether

// Local model endpoints - Set these for your self-hosted models
const NOVA_ENDPOINT = Deno.env.get('NOVA_ENDPOINT') || 'http://localhost:8001'; // Gemma 7B
const CHRONOS_ENDPOINT = Deno.env.get('CHRONOS_ENDPOINT') || 'http://localhost:8002'; // Phi-3/LLaMA-3.1 8B
const ECHO_ENDPOINT = Deno.env.get('ECHO_ENDPOINT') || 'http://localhost:8003'; // Whisper STT

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface InterviewContext {
  sessionId: string;
  sessionType: string;
  difficulty: number;
  questionNumber: number;
  previousQuestions: string[];
  userResponse?: string;
  audioData?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, context } = await req.json();

    switch (action) {
      case 'generate_question':
        return await generateInterviewQuestion(context);
      case 'process_audio':
        return await processAudioInput(context);
      case 'generate_speech':
        return await generateSpeech(context);
      case 'evaluate_response':
        return await evaluateResponse(context);
      case 'get_model_status':
        return await getModelStatus();
      default:
        throw new Error('Unknown action');
    }
  } catch (error) {
    console.error('Error in ai-orchestrator:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function generateInterviewQuestion(context: InterviewContext) {
  // Check model availability and select best available
  const availableModels = await getAvailableModels(['Orion', 'Titan', 'Nova']);
  
  if (availableModels.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No AI models available', unavailableModels: ['Orion', 'Titan', 'Nova'] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
    );
  }

  let question = '';
  let usedModel = '';

  // Try models in order of preference
  for (const model of availableModels) {
    try {
      if (model.codename === 'Orion' && GROQ_API_KEY) {
        question = await callGroqAPI(context);
        usedModel = 'Orion';
        break;
      } else if (model.codename === 'Titan' && MISTRAL_API_KEY) {
        question = await callMistralAPI(context);
        usedModel = 'Titan';
        break;
      } else if (model.codename === 'Nova') {
        question = await callLocalModel(NOVA_ENDPOINT, context);
        usedModel = 'Nova';
        break;
      }
    } catch (error) {
      console.error(`Error with ${model.codename}:`, error);
      await markModelUnavailable(model.codename);
      continue;
    }
  }

  if (!question) {
    question = getFallbackQuestion(context);
    usedModel = 'Fallback';
  }

  // Track usage
  if (usedModel !== 'Fallback') {
    await trackUsage(usedModel, context.sessionId, 1, question.length);
  }

  // Get evaluation from Athena if available
  let evaluation = null;
  const athenaAvailable = await isModelAvailable('Athena');
  if (athenaAvailable && context.userResponse) {
    try {
      evaluation = await evaluateWithAthena(context.userResponse, context);
    } catch (error) {
      console.error('Athena evaluation failed:', error);
    }
  }

  return new Response(
    JSON.stringify({
      question,
      usedModel,
      evaluation,
      modelStatus: await getModelStatus()
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function processAudioInput(context: InterviewContext) {
  const echoAvailable = await isModelAvailable('Echo');
  
  if (!echoAvailable) {
    return new Response(
      JSON.stringify({ error: 'Speech recognition unavailable', unavailableModels: ['Echo'] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
    );
  }

  try {
    let transcript = '';
    
    if (ECHO_ENDPOINT) {
      // Use local Whisper
      transcript = await callLocalSTT(context.audioData);
    } else {
      // Fallback to browser speech recognition
      transcript = context.userResponse || '';
    }

    await trackUsage('Echo', context.sessionId, 1, transcript.length);

    return new Response(
      JSON.stringify({ transcript, usedModel: 'Echo' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await markModelUnavailable('Echo');
    throw error;
  }
}

async function generateSpeech(context: InterviewContext) {
  const availableModels = await getAvailableModels(['Vox', 'Aether']);
  
  if (availableModels.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No TTS models available', unavailableModels: ['Vox', 'Aether'] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 }
    );
  }

  for (const model of availableModels) {
    try {
      let audioUrl = '';
      
      if (model.codename === 'Vox' && ELEVENLABS_API_KEY) {
        audioUrl = await callElevenLabsAPI(context.userResponse || '');
        await trackUsage('Vox', context.sessionId, 1, (context.userResponse || '').length);
        
        return new Response(
          JSON.stringify({ audioUrl, usedModel: 'Vox' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (model.codename === 'Aether' && AZURE_SPEECH_KEY) {
        audioUrl = await callAzureTTS(context.userResponse || '');
        await trackUsage('Aether', context.sessionId, 1, (context.userResponse || '').length);
        
        return new Response(
          JSON.stringify({ audioUrl, usedModel: 'Aether' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error(`TTS error with ${model.codename}:`, error);
      await markModelUnavailable(model.codename);
      continue;
    }
  }

  return new Response(
    JSON.stringify({ error: 'All TTS models failed', useBrowserTTS: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function evaluateResponse(context: InterviewContext) {
  const athenaAvailable = await isModelAvailable('Athena');
  
  if (!athenaAvailable || !ANTHROPIC_API_KEY) {
    return getFallbackEvaluation(context);
  }

  try {
    const evaluation = await evaluateWithAthena(context.userResponse || '', context);
    await trackUsage('Athena', context.sessionId, 1, (context.userResponse || '').length);
    
    return new Response(
      JSON.stringify({ evaluation, usedModel: 'Athena' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    await markModelUnavailable('Athena');
    return getFallbackEvaluation(context);
  }
}

// API Calling Functions
async function callGroqAPI(context: InterviewContext): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are Orion, the chief interviewer. Generate a ${context.sessionType} interview question at difficulty level ${context.difficulty}/10. Be professional, engaging, and adapt to the conversation flow.`
        },
        {
          role: 'user',
          content: `Previous questions: ${context.previousQuestions.join(', ')}. Generate question #${context.questionNumber}.`
        }
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Groq API error');
  
  return data.choices[0].message.content;
}

async function callMistralAPI(context: InterviewContext): Promise<string> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mixtral-8x7b-instruct',
      messages: [
        {
          role: 'system',
          content: `You are Titan, the technical interviewer. Focus on technical aspects and problem-solving. Difficulty: ${context.difficulty}/10.`
        },
        {
          role: 'user',
          content: `Generate a technical interview question. Context: ${context.sessionType}, Question #${context.questionNumber}`
        }
      ],
      max_tokens: 200,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Mistral API error');
  
  return data.choices[0].message.content;
}

async function callLocalModel(endpoint: string, context: InterviewContext): Promise<string> {
  const response = await fetch(`${endpoint}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `Generate a ${context.sessionType} interview question at difficulty ${context.difficulty}/10. Question number: ${context.questionNumber}`,
      max_tokens: 200,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error('Local model error');
  
  return data.response || data.text || data.output;
}

async function evaluateWithAthena(response: string, context: InterviewContext) {
  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `As Athena, the HR evaluator, analyze this interview response: "${response}". Provide scores (1-10) for clarity, confidence, content, and tone. Be constructive and professional.`
        }
      ],
    }),
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error?.message || 'Anthropic API error');
  
  return data.content[0].text;
}

async function callElevenLabsAPI(text: string): Promise<string> {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ELEVENLABS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!response.ok) throw new Error('ElevenLabs API error');
  
  const audioBlob = await response.blob();
  // In a real implementation, you'd upload this to storage and return the URL
  return 'data:audio/mpeg;base64,' + btoa(String.fromCharCode(...new Uint8Array(await audioBlob.arrayBuffer())));
}

async function callAzureTTS(text: string): Promise<string> {
  const response = await fetch(`https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AZURE_SPEECH_KEY}`,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='en-US-AriaNeural'>${text}</voice></speak>`,
  });

  if (!response.ok) throw new Error('Azure TTS error');
  
  const audioBlob = await response.blob();
  return 'data:audio/mpeg;base64,' + btoa(String.fromCharCode(...new Uint8Array(await audioBlob.arrayBuffer())));
}

async function callLocalSTT(audioData: string): Promise<string> {
  const response = await fetch(`${ECHO_ENDPOINT}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: audioData }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error('Local STT error');
  
  return data.transcript || data.text;
}

// Utility Functions
async function getAvailableModels(modelNames: string[]) {
  const { data } = await supabase
    .from('ai_models')
    .select('*')
    .in('codename', modelNames)
    .eq('credit_status', true);
  
  return data || [];
}

async function isModelAvailable(codename: string): Promise<boolean> {
  const { data } = await supabase
    .from('ai_models')
    .select('credit_status')
    .eq('codename', codename)
    .single();
  
  return data?.credit_status || false;
}

async function markModelUnavailable(codename: string) {
  await supabase
    .from('ai_models')
    .update({ credit_status: false, last_checked: new Date().toISOString() })
    .eq('codename', codename);
}

async function trackUsage(modelCodename: string, sessionId: string, requests: number, tokens: number) {
  await supabase.from('ai_usage_tracking').insert({
    model_codename: modelCodename,
    session_id: sessionId,
    requests_made: requests,
    tokens_used: tokens,
  });

  // Update current usage
  await supabase.rpc('update_model_usage', {
    model_name: modelCodename,
    requests_to_add: requests,
    tokens_to_add: tokens,
  });
}

async function getModelStatus() {
  const { data } = await supabase
    .from('ai_models')
    .select('codename, credit_status, current_daily_usage, current_monthly_usage, daily_limit, monthly_limit')
    .order('codename');
  
  return data || [];
}

function getFallbackQuestion(context: InterviewContext): string {
  const questions = [
    "Tell me about a challenging project you've worked on recently.",
    "How do you handle working under pressure and tight deadlines?",
    "What motivates you in your professional work?",
    "Describe a time when you had to learn something new quickly.",
    "What are your greatest professional strengths?",
  ];
  
  return questions[(context.questionNumber - 1) % questions.length];
}

function getFallbackEvaluation(context: InterviewContext) {
  return new Response(
    JSON.stringify({
      evaluation: "Response received and noted. Continue with the interview.",
      usedModel: 'Fallback',
      scores: { clarity: 7, confidence: 7, content: 7, tone: 7 }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}