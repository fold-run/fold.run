// fold-demo-tasks — a tiny task-capable MCP server, built on the official
// Go SDK, federated into demo.fold.run as the jobs__* namespace.
//
// start_job mints a task that completes after a few seconds; tasks/* poll
// and manage it via the same custom-method mechanism fold federates. The
// minted task rides the tool result's _meta["task"], so clients see the
// taskId and the gateway pins taskId → upstream affinity at mint.
//
// Port of the archived TypeScript demo server's wire contract, minus
// subscriptions/listen (the gateway doesn't federate it) and the stateless
// era plumbing (this is a plain SDK server with the standard lifecycle).
// State is in-memory: demo jobs are ephemeral by design, capped and swept.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	maxJobs      = 100
	minSeconds   = 1
	maxSeconds   = 120
	defSeconds   = 10
	codeNotFound = -32002
)

type job struct {
	TaskID      string
	Label       string
	Cancelled   bool
	CreatedAt   time.Time
	CompletesAt time.Time
	Seconds     int
}

func (j *job) status(now time.Time) string {
	switch {
	case j.Cancelled:
		return "cancelled"
	case now.Before(j.CompletesAt):
		return "working"
	default:
		return "completed"
	}
}

// public is the task object on the wire — the shape the TS server used.
func (j *job) public(now time.Time) map[string]any {
	t := map[string]any{
		"taskId":    j.TaskID,
		"status":    j.status(now),
		"label":     j.Label,
		"createdAt": j.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
	if t["status"] == "working" {
		t["remainingMs"] = j.CompletesAt.Sub(now).Milliseconds()
	}
	return t
}

type board struct {
	mu   sync.Mutex
	jobs map[string]*job
	seq  int
}

func (b *board) mint(label string, seconds int) *job {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.sweepLocked()
	b.seq++
	j := &job{
		TaskID:      fmt.Sprintf("demo-job-%d", b.seq),
		Label:       label,
		CreatedAt:   time.Now(),
		CompletesAt: time.Now().Add(time.Duration(seconds) * time.Second),
		Seconds:     seconds,
	}
	b.jobs[j.TaskID] = j
	return j
}

func (b *board) get(id string) *job {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.jobs[id]
}

func (b *board) list() []*job {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]*job, 0, len(b.jobs))
	for _, j := range b.jobs {
		out = append(out, j)
	}
	sort.Slice(out, func(i, k int) bool { return out[i].CreatedAt.Before(out[k].CreatedAt) })
	return out
}

// sweepLocked drops the oldest finished jobs once the cap is reached, so a
// launch-day crowd can't grow the board without bound.
func (b *board) sweepLocked() {
	if len(b.jobs) < maxJobs {
		return
	}
	now := time.Now()
	spent := make([]*job, 0, len(b.jobs))
	for _, j := range b.jobs {
		if j.status(now) != "working" {
			spent = append(spent, j)
		}
	}
	sort.Slice(spent, func(i, k int) bool { return spent[i].CreatedAt.Before(spent[k].CreatedAt) })
	for i := 0; i < len(spent) && len(b.jobs) >= maxJobs; i++ {
		delete(b.jobs, spent[i].TaskID)
	}
}

// rawParams / rawResult forward opaque JSON through the SDK's custom-method
// machinery — the same pattern the gateway itself uses for tasks/*.
type rawParams struct {
	mcp.ParamsBase
	raw json.RawMessage
}

func (p *rawParams) MarshalJSON() ([]byte, error) {
	if len(p.raw) == 0 {
		return []byte("{}"), nil
	}
	return p.raw, nil
}
func (p *rawParams) UnmarshalJSON(b []byte) error {
	p.raw = append(p.raw[:0], b...)
	return nil
}

type rawResult struct {
	mcp.ResultBase
	raw json.RawMessage
}

func (r *rawResult) MarshalJSON() ([]byte, error) {
	if len(r.raw) == 0 {
		return []byte("{}"), nil
	}
	return r.raw, nil
}
func (r *rawResult) UnmarshalJSON(b []byte) error {
	r.raw = append(r.raw[:0], b...)
	return nil
}

func complete(payload map[string]any) (*rawResult, error) {
	payload["resultType"] = "complete"
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &rawResult{raw: raw}, nil
}

func notFound(id string) error {
	return &jsonrpc.Error{Code: codeNotFound, Message: fmt.Sprintf("task not found: %q", id)}
}

func taskID(raw json.RawMessage) string {
	var p struct {
		TaskID string `json:"taskId"`
	}
	_ = json.Unmarshal(raw, &p)
	return p.TaskID
}

func newServer(b *board) (*mcp.Server, error) {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "fold-demo-tasks",
		Title:   "fold demo tasks",
		Version: "0.1.0",
	}, nil)

	server.AddTool(&mcp.Tool{
		Name: "start_job",
		Description: "Start a demo background job that completes after `seconds` (1–120, " +
			"default 10). The minted task is in the result _meta; poll it with tasks/get.",
		InputSchema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"label":   { "type": "string", "description": "What to call this job." },
				"seconds": { "type": "number", "description": "How long the job runs." }
			}
		}`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args struct {
			Label   string  `json:"label"`
			Seconds float64 `json:"seconds"`
		}
		if req.Params != nil {
			_ = json.Unmarshal(req.Params.Arguments, &args)
		}
		seconds := int(args.Seconds)
		if seconds < minSeconds || seconds > maxSeconds {
			if args.Seconds == 0 {
				seconds = defSeconds
			} else {
				seconds = max(minSeconds, min(maxSeconds, seconds))
			}
		}
		label := args.Label
		if label == "" {
			label = "demo job"
		}
		j := b.mint(label, seconds)
		now := time.Now()
		return &mcp.CallToolResult{
			Meta: mcp.Meta{"task": j.public(now), "pollIntervalMs": 1000},
			Content: []mcp.Content{&mcp.TextContent{
				Text: fmt.Sprintf("started %s (%q, %ds) — poll it with tasks/get", j.TaskID, label, seconds),
			}},
		}, nil
	})

	handlers := map[string]func(raw json.RawMessage) (*rawResult, error){
		"tasks/get": func(raw json.RawMessage) (*rawResult, error) {
			j := b.get(taskID(raw))
			if j == nil {
				return nil, notFound(taskID(raw))
			}
			return complete(map[string]any{"task": j.public(time.Now())})
		},
		"tasks/list": func(_ json.RawMessage) (*rawResult, error) {
			now := time.Now()
			tasks := []any{}
			for _, j := range b.list() {
				tasks = append(tasks, j.public(now))
			}
			return complete(map[string]any{"tasks": tasks})
		},
		"tasks/cancel": func(raw json.RawMessage) (*rawResult, error) {
			j := b.get(taskID(raw))
			if j == nil {
				return nil, notFound(taskID(raw))
			}
			b.mu.Lock()
			if j.status(time.Now()) == "working" {
				j.Cancelled = true
			}
			b.mu.Unlock()
			return complete(map[string]any{"task": j.public(time.Now())})
		},
		"tasks/update": func(raw json.RawMessage) (*rawResult, error) {
			var p struct {
				TaskID string `json:"taskId"`
				Status string `json:"status"`
			}
			_ = json.Unmarshal(raw, &p)
			j := b.get(p.TaskID)
			if j == nil {
				return nil, notFound(p.TaskID)
			}
			if p.Status != "cancelled" {
				return nil, &jsonrpc.Error{
					Code:    jsonrpc.CodeInvalidParams,
					Message: `only status "cancelled" can be applied to demo jobs`,
				}
			}
			b.mu.Lock()
			if j.status(time.Now()) == "working" {
				j.Cancelled = true
			}
			b.mu.Unlock()
			return complete(map[string]any{"task": j.public(time.Now())})
		},
		"tasks/result": func(raw json.RawMessage) (*rawResult, error) {
			j := b.get(taskID(raw))
			if j == nil {
				return nil, notFound(taskID(raw))
			}
			switch j.status(time.Now()) {
			case "working":
				return nil, &jsonrpc.Error{
					Code:    jsonrpc.CodeInvalidParams,
					Message: "task is still working — poll tasks/get",
				}
			case "completed":
				return complete(map[string]any{
					"content": []any{map[string]any{
						"type": "text",
						"text": fmt.Sprintf("job %q finished after %ds", j.Label, j.Seconds),
					}},
				})
			default:
				return complete(map[string]any{
					"content": []any{map[string]any{
						"type": "text",
						"text": fmt.Sprintf("job %q was cancelled", j.Label),
					}},
				})
			}
		},
	}
	for method, h := range handlers {
		handler := h
		if err := mcp.AddReceivingCustomMethod(server, method,
			func(_ context.Context, _ *mcp.ServerSession, p *rawParams) (*rawResult, error) {
				var raw json.RawMessage
				if p != nil {
					raw = p.raw
				}
				return handler(raw)
			}); err != nil {
			return nil, fmt.Errorf("register %s: %w", method, err)
		}
	}
	return server, nil
}

func main() {
	host := flag.String("host", "127.0.0.1", "listen host")
	port := flag.Int("port", 8080, "listen port")
	flag.Parse()

	b := &board{jobs: map[string]*job{}}
	server, err := newServer(b)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/mcp", mcp.NewStreamableHTTPHandler(
		func(*http.Request) *mcp.Server { return server }, nil))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "ok")
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "fold-demo-tasks: a task-capable MCP upstream for demo.fold.run (POST /mcp)")
	})

	addr := fmt.Sprintf("%s:%d", *host, *port)
	log.Printf("fold-demo-tasks listening on %s (mcp at /mcp)", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
