# Simplified Agent Configuration

## Quick Setup

Instead of configuring separate API keys for each provider, you can now use a simplified 3-variable setup:

### Example 1: Using OpenAI

```bash
# .env
AGENT_PROVIDER=openai
AGENT_MODEL=gpt-4o-mini
AGENT_API_KEY=sk-your-openai-key-here
```

That's it! The system will:
- Use OpenAI for all agent roles (planning, generate, verify, review)
- Use `gpt-4o-mini` as the model
- Automatically map `AGENT_API_KEY` to `OPENAI_API_KEY`

### Example 2: Using Groq

```bash
# .env
AGENT_PROVIDER=groq
AGENT_MODEL=llama-3.3-70b-versatile
AGENT_API_KEY=gsk_your-groq-key-here
```

### Example 3: Using DeepSeek (Cheap Alternative)

```bash
# .env
AGENT_PROVIDER=deepseek
AGENT_MODEL=deepseek-chat
AGENT_API_KEY=sk-your-deepseek-key
```

### Example 4: Using Ollama (Free, Local)

```bash
# .env
AGENT_PROVIDER=ollama
AGENT_MODEL=llama3.3
AGENT_API_KEY=ollama  # default value
```

## How It Works

The simplified config uses these fallback rules:

1. **Provider Selection:**
   - `AGENT_PROVIDER` → `AGENT_PROVIDER_DEFAULT` → `codex` (default)
   - Per-role providers (e.g., `AGENT_PROVIDER_PLAN`) override if set

2. **Model Selection:**
   - `AGENT_MODEL` → `AGENT_MODEL_DEFAULT` → provider's default
   - Per-role models (e.g., `AGENT_MODEL_PLAN`) override if set

3. **API Key Mapping:**
   - If `AGENT_PROVIDER=openai` and `AGENT_API_KEY` is set → maps to `OPENAI_API_KEY`
   - If `AGENT_PROVIDER=groq` and `AGENT_API_KEY` is set → maps to `GROQ_API_KEY`
   - Provider-specific keys (e.g., `OPENAI_API_KEY`) always take precedence

## Advanced: Mixed Providers

If you need different providers for different roles:

```bash
# .env
# Default to OpenAI
AGENT_PROVIDER=openai
AGENT_MODEL=gpt-4o-mini
AGENT_API_KEY=sk-xxx

# But use Groq for planning (faster, cheaper for planning tasks)
AGENT_PROVIDER_PLAN=groq
AGENT_MODEL_PLAN=llama-3.3-70b-versatile
GROQ_API_KEY=gsk_yyy
```

## Migration from Old Config

**Before (verbose):**
```bash
AGENT_PROVIDER_DEFAULT=openai
AGENT_MODEL_DEFAULT=gpt-4o-mini
OPENAI_API_KEY=sk-xxx
AGENT_PROVIDER_PLAN=openai
AGENT_MODEL_PLAN=gpt-4o-mini
# ... repeat for each role
```

**After (simplified):**
```bash
AGENT_PROVIDER=openai
AGENT_MODEL=gpt-4o-mini
AGENT_API_KEY=sk-xxx
```

Much cleaner! 🎉

## Supported Providers

| Provider | Example API Key | Model Example |
|----------|----------------|---------------|
| `openai` | `sk-proj-...` | `gpt-4o-mini`, `gpt-4o` |
| `groq` | `gsk_...` | `llama-3.3-70b-versatile`, `mixtral-8x7b` |
| `deepseek` | `sk-...` | `deepseek-chat` |
| `qwen` | `sk-...` | `qwen-plus`, `qwen-turbo` |
| `ollama` | `ollama` | `llama3.3`, `qwen2.5` (must be pulled first) |
| `codex` | N/A (CLI tool) | N/A |
| `copilot` | N/A (CLI tool) | N/A |
