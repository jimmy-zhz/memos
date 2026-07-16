package memogit

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/proto/gen/api/v1/apiv1connect"
)

// Client wraps the memos Connect API clients with PAT auth and exposes the
// subset of operations memogit needs.
type Client struct {
	memo      apiv1connect.MemoServiceClient
	auth      apiv1connect.AuthServiceClient
	workspace apiv1connect.WorkspaceServiceClient
}

// patInterceptor injects `Authorization: Bearer <token>` on every request.
type patInterceptor struct {
	token string
}

func (i patInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		req.Header().Set("Authorization", "Bearer "+i.token)
		return next(ctx, req)
	}
}

func (i patInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(ctx context.Context, spec connect.Spec) connect.StreamingClientConn {
		conn := next(ctx, spec)
		conn.RequestHeader().Set("Authorization", "Bearer "+i.token)
		return conn
	}
}

func (i patInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

// NewClient builds a Client for the given server URL and PAT.
func NewClient(cfg *Config) *Client {
	httpClient := &http.Client{Timeout: 60 * time.Second}
	baseURL := strings.TrimRight(cfg.Server, "/")
	opts := connect.WithInterceptors(patInterceptor{token: cfg.Token})
	return &Client{
		memo:      apiv1connect.NewMemoServiceClient(httpClient, baseURL, opts),
		auth:      apiv1connect.NewAuthServiceClient(httpClient, baseURL, opts),
		workspace: apiv1connect.NewWorkspaceServiceClient(httpClient, baseURL, opts),
	}
}

// CurrentUsername returns the authenticated user's username (used to scope
// list queries to the user's own memos).
func (c *Client) CurrentUsername(ctx context.Context) (string, error) {
	resp, err := c.auth.GetCurrentUser(ctx, connect.NewRequest(&v1pb.GetCurrentUserRequest{}))
	if err != nil {
		return "", fmt.Errorf("get current user (check server URL and token): %w", err)
	}
	user := resp.Msg.GetUser()
	if user == nil || user.GetUsername() == "" {
		return "", fmt.Errorf("current user response missing username")
	}
	return user.GetUsername(), nil
}

// ResolveWorkspace looks up a workspace owned by the current user by its
// display title (unique per user) and returns its resource name
// ("workspaces/{uid}"). There is no server-side title lookup for ListMemos'
// workspace filter (unlike CreateMemo, which accepts a title), so this pages
// through ListWorkspaces client-side and matches by exact title.
func (c *Client) ResolveWorkspace(ctx context.Context, title string) (*v1pb.Workspace, error) {
	resp, err := c.workspace.ListWorkspaces(ctx, connect.NewRequest(&v1pb.ListWorkspacesRequest{}))
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	var names []string
	for _, w := range resp.Msg.GetWorkspaces() {
		names = append(names, w.GetTitle())
		if w.GetTitle() == title {
			return w, nil
		}
	}
	return nil, fmt.Errorf("no workspace titled %q (have: %v)", title, names)
}

// DefaultWorkspace returns the current user's first workspace, matching the
// server's own "first workspace is the default" convention
// (resolveOrCreateDefaultWorkspace). Errors if the user has none yet — the
// server only auto-creates one lazily on first memo write, and clone should
// not silently write to the server.
func (c *Client) DefaultWorkspace(ctx context.Context) (*v1pb.Workspace, error) {
	resp, err := c.workspace.ListWorkspaces(ctx, connect.NewRequest(&v1pb.ListWorkspacesRequest{}))
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	list := resp.Msg.GetWorkspaces()
	if len(list) == 0 {
		return nil, fmt.Errorf("account has no workspaces yet; create one in memos first")
	}
	return list[0], nil
}

// ListAllMemos pages through ListMemos scoped to the given workspace and
// returns every NORMAL memo. filter is a full CEL expression (already
// including any creator scoping); workspace is a resource name
// ("workspaces/{uid}").
func (c *Client) ListAllMemos(ctx context.Context, workspace, filter string) ([]*v1pb.Memo, error) {
	var out []*v1pb.Memo
	pageToken := ""
	for {
		req := &v1pb.ListMemosRequest{
			PageSize:  200,
			PageToken: pageToken,
			State:     v1pb.State_NORMAL,
			// Oldest first keeps clone output deterministic and git-friendly.
			OrderBy:   "create_time asc",
			Filter:    filter,
			Workspace: workspace,
		}
		resp, err := c.memo.ListMemos(ctx, connect.NewRequest(req))
		if err != nil {
			return nil, fmt.Errorf("list memos: %w", err)
		}
		out = append(out, resp.Msg.GetMemos()...)
		pageToken = resp.Msg.GetNextPageToken()
		if pageToken == "" {
			break
		}
	}
	return out, nil
}
