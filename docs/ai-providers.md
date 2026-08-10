# AI providers

The default provider is **Mock**. It streams a deterministic local answer and never needs an API key or network connection.

## Configure a cloud provider

Choose the provider in **Settings → AI**, paste the key into the one-time password field, press **Store**, then save settings. The native command writes the key to the OS credential store and returns no key material to React.

| Provider | Default model | Streaming transport | Required key |
| --- | --- | --- | --- |
| Mock | `aster-mock-stream` | Local async chunks | No |
| OpenAI | `gpt-4.1-mini` | Chat Completions SSE | Yes |
| Gemini | `gemini-3.6-flash` | `streamGenerateContent` SSE | Yes |
| Claude | `claude-sonnet-4-5` | Messages SSE | Yes |

Model availability is account- and region-specific. Change the model string in Settings if your provider account offers a different enabled model. Gemini 2.5 Flash should not be used as the default for newly configured accounts; Google documents `gemini-3.6-flash` as a current production model.

## Request lifecycle

1. The renderer sends structured, bounded context to Rust.
2. Rust redacts secrets again, reads the provider key from secure storage, and starts one timeout-bound request. **Test provider connection** makes an explicit native reachability check; saving a key alone is shown as configured, not connected.
3. Each SSE delta becomes an `aster://ai-stream` event and updates the overlay immediately.
4. Stop adds the request ID to the native cancellation set. Provider, rate-limit, invalid-key, malformed response, and network errors become a safe **AI unavailable** response.

No AI key is read from environment variables, logs, local settings JSON, or the frontend bundle.
