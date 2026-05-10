-- ============================================================
-- Add upgraded AI provider models
-- Claude 3.5, Gemini 2.0, DeepSeek V3, GPT-4 Vision,
-- Gemini Vision, Deepgram, AssemblyAI
-- ============================================================

-- NLP Providers
INSERT INTO public.ai_providers (provider_type, provider_name, display_name, description, is_free, requires_api_key, estimated_cost_per_1k, accuracy_rating)
VALUES
  ('nlp', 'claude', 'Claude 3.5 Sonnet', 'Anthropic''s Claude — excellent for nuanced restaurant text, multi-language support.', false, true, '$0.003', 5),
  ('nlp', 'gemini', 'Google Gemini 2.0', 'Google''s Gemini 2.0 Flash — fast, cheap, and highly accurate for text tasks.', false, true, '$0.001', 5),
  ('nlp', 'deepseek', 'DeepSeek V3', 'Ultra-affordable LLM — great for high-volume, cost-sensitive deployments.', false, true, '$0.0005', 4)
ON CONFLICT (provider_type, provider_name) DO NOTHING;

-- Image Providers
INSERT INTO public.ai_providers (provider_type, provider_name, display_name, description, is_free, requires_api_key, estimated_cost_per_1k, accuracy_rating)
VALUES
  ('image', 'openai', 'OpenAI GPT-4 Vision', 'OpenAI''s vision model — best-in-class food image recognition and menu extraction.', false, true, '$0.005', 5),
  ('image', 'gemini-vision', 'Gemini Vision', 'Google''s multimodal model — strong food image analysis at lower cost.', false, true, '$0.002', 4)
ON CONFLICT (provider_type, provider_name) DO NOTHING;

-- Voice Providers
INSERT INTO public.ai_providers (provider_type, provider_name, display_name, description, is_free, requires_api_key, estimated_cost_per_1k, accuracy_rating)
VALUES
  ('voice', 'deepgram', 'Deepgram', 'Real-time speech-to-text with high accuracy. Best for live voice ordering.', false, true, '$4.00/min', 5),
  ('voice', 'assemblyai', 'AssemblyAI', 'Multi-language transcription with speaker detection. Good for diverse menus.', false, true, '$5.00/min', 4)
ON CONFLICT (provider_type, provider_name) DO NOTHING;
