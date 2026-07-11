package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pkg/errors"
)

const generateTimeout = 5 * time.Minute

// GenerateText makes a non-streaming text-generation call against the given provider,
// sending instructions as the system prompt and input as the user message, and returns
// the model's text output.
func GenerateText(ctx context.Context, provider ProviderConfig, model, instructions, input string) (string, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return "", errors.New("model is required")
	}
	if strings.TrimSpace(provider.APIKey) == "" {
		return "", errors.New("API key is required")
	}

	switch provider.Type {
	case ProviderOpenAI:
		return generateOpenAICompatible(ctx, provider, model, instructions, input)
	case ProviderGemini:
		return generateGemini(ctx, provider, model, instructions, input)
	default:
		return "", errors.Errorf("unsupported provider type %q", provider.Type)
	}
}

func generateOpenAICompatible(ctx context.Context, provider ProviderConfig, model, instructions, input string) (string, error) {
	endpoint := strings.TrimSpace(provider.Endpoint)
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1"
	}

	messages := []map[string]string{}
	if instructions != "" {
		messages = append(messages, map[string]string{"role": "system", "content": instructions})
	}
	messages = append(messages, map[string]string{"role": "user", "content": input})

	// Deliberately omit a token-limit parameter for the same compatibility reason as
	// ProbeChat: "max_tokens" vs "max_completion_tokens" support varies by provider.
	body, err := json.Marshal(map[string]any{
		"model":    model,
		"messages": messages,
		"stream":   false,
	})
	if err != nil {
		return "", errors.Wrap(err, "failed to build request body")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", errors.Wrap(err, "failed to build request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	respBody, err := doGenerateRequest(req)
	if err != nil {
		return "", err
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", errors.Wrap(err, "failed to parse response")
	}
	if len(parsed.Choices) == 0 || parsed.Choices[0].Message.Content == "" {
		return "", errors.New("response did not include text")
	}
	return parsed.Choices[0].Message.Content, nil
}

func generateGemini(ctx context.Context, provider ProviderConfig, model, instructions, input string) (string, error) {
	endpoint := strings.TrimSpace(provider.Endpoint)
	if endpoint == "" {
		endpoint = "https://generativelanguage.googleapis.com/v1beta"
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if !strings.HasSuffix(endpoint, "/v1beta") && !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1beta"
	}

	payload := map[string]any{
		"contents": []map[string]any{
			{"role": "user", "parts": []map[string]string{{"text": input}}},
		},
	}
	if instructions != "" {
		payload["systemInstruction"] = map[string]any{
			"parts": []map[string]string{{"text": instructions}},
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", errors.Wrap(err, "failed to build request body")
	}

	url := fmt.Sprintf("%s/models/%s:generateContent", endpoint, model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", errors.Wrap(err, "failed to build request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", provider.APIKey)

	respBody, err := doGenerateRequest(req)
	if err != nil {
		return "", err
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", errors.Wrap(err, "failed to parse response")
	}
	var sb strings.Builder
	if len(parsed.Candidates) > 0 {
		for _, part := range parsed.Candidates[0].Content.Parts {
			sb.WriteString(part.Text)
		}
	}
	if sb.Len() == 0 {
		return "", errors.New("response did not include text")
	}
	return sb.String(), nil
}

func doGenerateRequest(req *http.Request) ([]byte, error) {
	client := &http.Client{Timeout: generateTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.Wrap(err, "request failed")
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
	if err != nil {
		return nil, errors.Wrap(err, "failed to read response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.Errorf("provider returned %s: %s", resp.Status, extractErrorMessage(respBody))
	}
	return respBody, nil
}
